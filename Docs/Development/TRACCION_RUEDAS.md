# Tracción Ruedas — Documentación Técnica

Panel de telemetría por rueda en tiempo real. Muestra el estado individual de cada una de las 4 ruedas del vehículo: carga de tracción, deslizamiento longitudinal, deslizamiento lateral, tipo de suelo y carga vertical.

---

## 1. Arquitectura del Pipeline

```text
FS25 (Lua) → Named Pipe → telemetry.js (backend) → WebSocket → telemetry-client.js → dashboard.js → HTML/CSS
```

| Archivo | Rol |
| --- | --- |
| `SHTelemetry/SHTelemetry_Extensions.lua` | Captura datos de rueda desde el SDK de FS25 y los campos `mrLast*` de MoreRealistic |
| `Dashboard/backend/src/services/telemetry.js` | Parsea el JSON recibido por la pipe y lo expone vía WebSocket |
| `Dashboard/frontend/js/telemetry-client.js` | Mapea los datos WebSocket al estado de la aplicación |
| `Dashboard/frontend/js/dashboard.js` | Renderiza las barras, badges y valores en el DOM |
| `Dashboard/frontend/css/components.css` | Estilos de las barras y badges |
| `Dashboard/frontend/sections/cards/wheel-traction.html` | Estructura HTML del panel |

---

## 2. Datos Capturados por Rueda

### 2.1 Posiciones

Las 4 ruedas se mapean por orden de índice en `spec_wheels.wheels`:

| Índice | Posición | Clave JSON |
| --- | --- | --- |
| 1 | FL (Front Left) | `wheelTraction[0]` |
| 2 | FR (Front Right) | `wheelTraction[1]` |
| 3 | RL (Rear Left) | `wheelTraction[2]` |
| 4 | RR (Rear Right) | `wheelTraction[3]` |

### 2.2 Campos por rueda

| Campo | Tipo | Fuente | Descripción |
| --- | --- | --- | --- |
| `motorized` | bool | MR `mrIsDriven` / diferenciales | Si la rueda recibe tracción del motor |
| `torquePercent` | float 0–100 | `motorLoad` × ratio de carga | % de carga del motor redistribuida por peso real |
| `slip` | float | SDK vanilla (0 en FS25) | Deslizamiento base (reemplazado por `longSlip` con MR) |
| `speedMs` | float | `rotSpeed × radius` | Velocidad periférica de la rueda [m/s] |
| `contact` | bool | `hasGroundContact` | Si la rueda toca el suelo |
| `tireLoadKN` | float | MR `mrLastTireLoad` | Carga vertical sobre la rueda [kN] |
| `longSlip` | float 0–1 | MR `mrLastLongSlip` | Deslizamiento longitudinal (tracción/frenada) |
| `latSlip` | float 0–1 | MR `mrLastLatSlip` | Deslizamiento lateral (derrape en curva) |
| `groundType` | string | MR `mrLastGroundType` | Tipo de suelo: `ROAD`, `HARD`, `SOFT`, `FIELD` |
| `rrFx` | float | MR `mrLastRrFx` | Factor de resistencia a la rodadura |
| `pressureFx` | float | MR `mrLastPressureFx` | Factor de presión del neumático (desde MR 0.26.03.25) |

---

## 3. Lógica de Captura en Lua (5 pasos)

### Paso 1 — Detección de ruedas motorizadas

**Prioridad:** `ph.mrIsDriven` (MR) > índices de diferencial FS25 > `driveMode` > fallback 4WD.

MR reorganiza los diferenciales de forma diferente al SDK base, por lo que `mrIsDriven` es la fuente más fiable. Si no está disponible (sin MR), se recorre `spec_motorized.differentials` usando `diffIndex1IsWheel` / `diffIndex2IsWheel`.

### Paso 2 — Señal global de torque del motor

Se calcula `motorTorquePct` (0–100) como señal de referencia:

- Con MR activo: `motorAppliedTorque × RPM / peakMotorPower`
- Sin MR: `spec_motorized.actualLoadPercentage`
- Fallback extra en reversa: `lastAcceleratorPedal`

> **Nota técnica:** `wheel.physics.torque` existe en el SDK pero siempre vale `0.0`, no `nil`. No es usable como fuente de torque individual.

### Paso 3 — Captura por rueda

Para cada rueda `i <= 4`:

1. `isMotorized` desde MR o diferenciales (ver Paso 1)
2. `speedMs = rotSpeed × radius`
3. `contact = hasGroundContact`
4. `torquePercent = motorTorquePct` (base, se redistribuye en Paso 5)
5. Campos MR si disponibles: `tireLoadKN`, `longSlip`, `latSlip`, `groundType`, `rrFx`, `pressureFx`
6. Fallback de `groundType` sin MR: estimación por `densityType` y `groundDepth`

### Paso 4 — Tipo de tracción (driveType)

Detecta `4WD`, `FWD`, `RWD` o `2WD` para el badge del panel.

- Con MR: compara `mrIsDriven` de ruedas delanteras (i≤2) vs traseras (i≥3)
- Sin MR: compara índices de diferencial resueltos en Paso 1

### Paso 5 — Redistribución de torque por carga (solo con MR)

Como MR no expone torque individual por rueda, se aproxima redistributyendo `motorTorquePct` proporcionalmente al `tireLoadKN` de cada rueda:

```text
torquePercent[rueda] = motorTorquePct × (tireLoad[rueda] / avgTireLoad)
```

**Efecto práctico:** con un apero en tiro, las ruedas RR/RL tienen más carga → muestran más TRQ que FL/FR. Esto refleja la transferencia de carga real que ocurre en campo. Si MR no está activo (sin `tireLoadKN`), todas las ruedas muestran el mismo `motorTorquePct`.

---

## 4. Detección de Tipo de Suelo

La detección usa las constantes de MR directamente (`WheelsUtil.GROUND_*`) en lugar de números hardcodeados, igual que el propio código de MR en `RealisticUtils.lua`:

```lua
if     gt == WheelsUtil.GROUND_FIELD        then wt.groundType = "FIELD"
elseif gt == WheelsUtil.GROUND_SOFT_TERRAIN then wt.groundType = "SOFT"
elseif gt == WheelsUtil.GROUND_HARD_TERRAIN then wt.groundType = "HARD"
elseif gt == WheelsUtil.GROUND_ROAD         then wt.groundType = "ROAD"
end
```

`mrLastGroundType` se actualiza con lazy-update (`mrFrictionNeedUpdate`) solo cuando el vehículo se mueve a más de 0.2 km/h.

**Fallback sin MR:**

- `densityType != NONE` → `FIELD`
- `groundDepth >= 0.8` → `SOFT`
- `groundDepth >= 0.1` → `HARD`
- `groundDepth < 0.1` → `ROAD`

---

## 5. Visualización en el Dashboard

### 5.1 Panel principal

```text
┌─ TRACCIÓN RUEDAS ─────────── 4WD ─┐
│ FL ● TRQ ████░░░░░░░░  42%  FIELD  │
│      SLP ███░░░░░░░░░░  8%  25.3kN │
│      LAT ██░░░░░░░░░░░  5%         │
│ FR ● TRQ ...                       │
│ RL ● TRQ ...                       │
│ RR ● TRQ ...                       │
└────────────────────────────────────┘
```

### 5.2 Elemento TRQ (Torque)

- **Barra fill:** crece con el % de carga del motor redistribuido por peso
- **Colores por umbral:**
  - 0–50% → Teal (verde oscuro, zona eficiente)
  - 51–80% → Ámbar (`.med`, carga media-alta)
  - >80% → Naranja/rojo (`.high`, motor al límite)
- **Valor numérico:** % entero a la derecha

### 5.3 Elemento SLP (Slip longitudinal)

- Fuente: `mrLastLongSlip` (MR) o `slip` (vanilla, siempre 0 en FS25)
- Colores: normal → naranja-medio → rojo >40%
- Valor: % entero (0–100)

### 5.4 Elemento LAT (Slip lateral)

- Fuente: `mrLastLatSlip` (solo con MR activo)
- Oculto cuando MR no está disponible (`wt-hidden`)
- Colores: igual que SLP pero umbral de alerta a 25%

### 5.5 Badge de tipo de suelo

- Posición: columna derecha, debajo del badge 4WD/FWD/RWD
- Valores: `ROAD` (azul), `HARD` (ámbar), `SOFT` (marrón), `FIELD` (verde lima)
- Oculto cuando `groundType` es `null`

### 5.6 Punto de contacto

- Dot verde brillante cuando `contact = true` (rueda en suelo)
- Dot apagado cuando la rueda está en el aire

### 5.7 Carga vertical (kN)

- Solo visible con MR activo (`mrLastTireLoad`)
- Valor en kN con 1 decimal

### 5.8 Fila inactiva

- La fila completa se opaca al 32% cuando `motorized = false` (rueda libre, sin tracción)

---

## 6. Zonas de Referencia para Conducción

### TRQ (Carga del motor)

| Zona | % | Significado |
| --- | --- | --- |
| Ligera | < 40% | Motor sobredimensionado o trabajo muy ligero |
| Eficiente | 40–70% | Trabajo normal, buena eficiencia de combustible |
| **Óptima** | **70–85%** | **Máximo rendimiento, motor en curva de par** |
| Límite | 85–100% | Aceptable en momentos puntuales |
| Sobrecarga | > 100% | Solo posible con MR; riesgo de parada |

### SLP (Deslizamiento longitudinal)

| Zona | % | Significado |
| --- | --- | --- |
| Normal en campo | 5–15% | Tracción eficiente |
| Alerta | 15–25% | Ruleslip moderado |
| **Peligro** | **> 25%** | **Rueda patinando, daño al suelo y pérdida de avance** |

### LAT (Deslizamiento lateral)

| Zona | % | Significado |
| --- | --- | --- |
| Normal en curva | < 15% | Dirección respondiendo |
| Alerta | 15–30% | Derrape significativo |
| **Peligro** | **> 30%** | **Riesgo de vuelco lateral o daño al suelo** |

### kN (Carga vertical)

- Tractor estándar 4WD: ~20–25 kN por rueda en vacío
- Con apero en tiro: traseras pueden superar 35–40 kN
- Asimetría FL↔FR o RL↔RR > 20%: terreno inclinado o apero mal centrado

---

## 7. Dependencia de MoreRealistic

| Dato | Sin MR | Con MR |
| --- | --- | --- |
| `motorized` | Índices de diferencial | `mrIsDriven` (fiable) |
| `torquePercent` | `motorLoad` igual en todas | `motorLoad` redistribuido por `tireLoadKN` |
| `longSlip` | `0` (SDK no lo expone) | `mrLastLongSlip` |
| `latSlip` | No disponible | `mrLastLatSlip` |
| `groundType` | Estimado por `groundDepth` | `mrLastGroundType` exacto |
| `tireLoadKN` | No disponible | `mrLastTireLoad` |
| `rrFx` | No disponible | `mrLastRrFx` |
| `pressureFx` | No disponible | `mrLastPressureFx` (desde MR 0.26.03.25) |

---

## 8. Archivos Modificados en Esta Implementación

| Archivo | Cambios |
| --- | --- |
| `SHTelemetry/SHTelemetry_Extensions.lua` | Nueva función `captureWheelData` con 5 pasos; campos `rrFx`, `pressureFx` añadidos |
| `Dashboard/backend/src/services/telemetry.js` | Mapeo de `rrFx`, `pressureFx`, `longSlip`, `latSlip`, `groundType`, `tireLoadKN` en `parseData()` |
| `Dashboard/frontend/js/telemetry-client.js` | Mapeo completo de todos los campos por rueda incluyendo los nuevos de MR |
| `Dashboard/frontend/js/dashboard.js` | Renderizado de TRQ/SLP/LAT bars, badges de suelo, puntos de contacto, carga kN |
| `Dashboard/frontend/css/components.css` | Estilos de `.wheel-torque-bar`, `.wheel-slip-fill`, `.wheel-ground-badge`, `.wt-bar-row`, etc. |
| `Dashboard/frontend/sections/cards/wheel-traction.html` | Estructura HTML del panel con 4 filas de rueda |
