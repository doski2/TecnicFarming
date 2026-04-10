# 🧠 IA Telemetría Inteligente — Diseño del Sistema

> **Estado:** Fase A completada · Fase B en progreso  
> **Objetivo:** Aprender el comportamiento óptimo de cada tractor+herramienta para dar recomendaciones en tiempo real

---

## 1. Visión General

La idea es convertir el dashboard de **monitorización pasiva** a **análisis activo**. En lugar de solo ver los datos, el sistema aprende cómo se comporta cada tractor con cada herramienta en cada terreno, y con el tiempo puede **predecir, alertar y recomendar** antes de que el jugador cometa un error.

El flujo completo sería:

```text
FS25 (Lua) → Named Pipe → Backend → JSON persistente
                                          ↓
                                   Script Python
                                  (exploración/validación)
                                          ↓
                                   Modelo entrenado
                                          ↓
                                   Dashboard IA
```

---

## 2. Datos a Recopilar

### 2.1 Identificación del contexto

| Dato | Descripción | Fuente Lua |
| --- | --- | --- |
| `tractorId` | ID único del vehículo | `vehicle:getName()` o `vehicle.rootNode` |
| `isOwnedField` | Si trabaja en campo propio | `FieldUtil.getFieldAtWorldPosition()` + `field:getOwner()` |
| `fieldId` | ID del campo | `FieldUtil` |
| `workType` | Tipo de trabajo activo | Detectar implemento adjunto (ver 2.3) |
| `timestamp` | Marca de tiempo | `getDate()` en Lua |

> ⚠️ **Importante:** Solo se recopilan datos cuando `isOwnedField = true`. No tiene sentido aprender de campos ajenos o de IA.

### 2.2 Telemetría del tractor

| Dato | Descripción |
| --- | --- |
| `rpm` | Velocidad de motor |
| `torque` | Par motor actual (Nm) |
| `motorLoad` | Carga motor (%) |
| `fuelUsage` | Consumo L/h |
| `speed` | Velocidad km/h |
| `gear` | Marcha actual |
| `wheelSlip` | Patinaje ruedas (%) por rueda |
| `terrainAnglePitch` | Inclinación frontal/trasera |
| `terrainAngleRoll` | Inclinación lateral |
| `posX`, `posZ` | Posición en el mapa |

### 2.3 Estado del implemento

| Dato | Descripción | Cómo detectarlo en Lua |
| --- | --- | --- |
| `implementName` | Nombre del implemento | `implement.object:getName()` |
| `implementType` | Tipo (cultivador, sembradora, etc.) | Especialización del objeto |
| `isLowered` | Bajado/subido | `implement.object:getIsFoldMiddleAllowed()` / estado fold |
| `isActive` | Activado (ej: abonadora encendida) | `implement.object:getIsActive()` |
| `workWidth` | Ancho de trabajo (m) | `implement.object.workAreaParameters.width` |

**Tipos de trabajo detectables:**

- `PLOW` — Arado
- `CULTIVATOR` — Cultivador
- `SOWER` — Sembradora
- `FERTILIZER` — Abonadora/esparcidor
- `HARVESTER` — Cosechadora
- `MOWER` — Segadora
- `BALER` — Empacadora
- `TRANSPORT` — Sin implemento / transporte

### 2.4 Configuración del tractor (MR)

Hay que investigar si el mod MoreRealistic expone estos datos en Lua:

| Dato | Descripción | Estado |
| --- | --- | --- |
| `tireBrand` | Marca de neumático | 🔍 Por investigar en MR |
| `tireSize` | Tamaño del neumático | 🔍 Por investigar en MR |
| `tireType` | Tipo (carretera, agrícola, etc.) | 🔍 Por investigar en MR |
| `ballastWeight` | Peso de contrapesos (kg) | ❌ Descartado — inferible de `totalMassT` y ratio ejes |
| `frontAxleLoad` | Carga eje delantero | ✅ Calculado: sum(tireLoadKN FL+FR) |
| `frontAxleRatio` | % de masa en eje delantero | ✅ Calculado: frontLoad / totalLoad |

> **Nota:** Si MR no expone estos datos directamente, se pueden inferir del comportamiento (un tractor con más contrapeso tendrá menos patinaje trasero con la misma carga).

### 2.5 Terreno y malla del campo

| Dato | Descripción | Cómo obtenerlo |
| --- | --- | --- |
| `terrainHeight` | Altura del terreno en posición actual | `getTerrainHeightAtWorldPos()` |
| `soilDensity` | Dureza/tipo de suelo | Inferido del patinaje vs carga |
| `slipZone` | Zona de patinaje recurrente | Calculado por backend: posX/Z + slip > umbral |
| `fieldMesh` | Malla de desnivel | Grid de altura muestreada durante trabajos |

La **malla del terreno** se construye acumulando puntos `{posX, posZ, height, slip}` durante el trabajo. Con suficientes puntos se puede renderizar un mapa de calor en el dashboard.

### 2.6 Clima y predicción de estado del campo

Este es el punto más complejo. En Lua hay que añadir:

| Dato | Descripción | API Lua |
| --- | --- | --- |
| `weatherState` | Estado actual (soleado, lluvia, nublado) | `g_currentMission.environment.weather` |
| `soilMoisture` | Humedad del suelo (%) | `g_currentMission.environment.soilMoisture` (si existe) |
| `nextRainTime` | Horas hasta próxima lluvia | `weather:getNextRainTime()` o similar |
| `nextDryTime` | Horas hasta que el campo esté seco | Calculado: `nextRainTime` + tiempo de secado |
| `fieldState` | Estado del campo (seco/húmedo/helado) | `FruitTypeManager` + condiciones |
| `sowingWindowHours` | Horas disponibles para sembrar | Calculado: tiempo hasta lluvia |

**El objetivo del punto 7 es:**  
> *"Tienes X horas antes de que llueva. Si el campo necesita Y horas para sembrar Z hectáreas, ¿llegas?"*

Esto requiere también que el jugador indique (o el sistema detecte) cuántas hectáreas tiene el campo y el ancho de trabajo del implemento.

---

## 3. Almacenamiento Persistente

### Formato: JSON Lines (`.jsonl`)

Cada sesión de trabajo genera una línea JSON por muestra (cada ~1 segundo, no 60fps — no necesitamos tanta resolución para entrenamiento):

```json
{"ts":1711234567,"tractorId":"Fendt942","fieldId":12,"workType":"CULTIVATOR","isLowered":true,"isActive":true,"rpm":1650,"torque":420,"motorLoad":78,"fuelUsage":14.2,"speed":8.3,"gear":"A4","wheelSlipRL":12,"wheelSlipRR":14,"pitch":-2.1,"roll":0.5,"posX":234.5,"posZ":891.2,"weather":"SUNNY","soilMoisture":0.32,"nextRainHours":6.5}
```

### Ubicación

```text
TecnicFarming/
└── Data/
    ├── sessions/
    │   ├── campo_3/                              ← subcarpeta por campo
    │   │   ├── 2026-04-11_MF8570_HARVESTING.jsonl
    │   │   └── 2026-04-11_MF8570_SOWING.jsonl
    │   ├── campo_5/
    │   │   └── 2026-04-11_JD8R_CULTIVATOR.jsonl
    │   └── sin_campo/
    │       └── ...
    ├── campo_profiles.json                       ← ✅ perfiles acumulados campo+workType
    └── field_mesh/                               ← pendiente Fase B
        └── ...
```

### ¿Por qué JSON Lines y no base de datos?

- Sin dependencias (no SQLite, no PostgreSQL)
- Legible a mano y con Python directamente
- Fácil de inspeccionar y depurar
- `pandas.read_json(path, lines=True)` — una línea para cargar todo
- Se puede migrar a SQLite más adelante sin cambiar el formato de entrada

---

## 4. Pipeline de Análisis Python (Primera Etapa)

Antes de añadir nada al dashboard, se valida la utilidad de los datos con un script Python independiente.

### Estructura del script

```text
TecnicFarming/
└── Analysis/
    ├── explore_sessions.py       ← Análisis exploratorio general
    ├── tractor_profile.py        ← Perfil óptimo por tractor+herramienta
    ├── field_heatmap.py          ← Visualizar malla de patinaje/desnivel
    ├── weather_window.py         ← Análisis de ventanas de siembra
    └── requirements.txt          ← pandas, matplotlib, numpy, scikit-learn
```

### Qué hará cada script

**`explore_sessions.py`**

- Cargar todos los `.jsonl`
- Estadísticas básicas: RPM medio, consumo medio, patinaje medio por tractor
- Distribuciones: histogramas de RPM por `workType`
- Correlaciones: ¿patinaje correlaciona con humedad? ¿motorLoad con gear?

**`tractor_profile.py`**

- Para cada combinación `(tractorId, workType)` calcular:
  - RPM óptima (menor consumo con mayor avance)
  - Gear óptima para esa velocidad de trabajo
  - Umbral de patinaje normal vs anormal
  - Consumo esperado por hectárea

**`field_heatmap.py`**

- Plotear `posX, posZ` con color = `wheelSlip` promedio
- Identificar zonas problemáticas del campo
- Exportar como imagen o JSON para el dashboard

**`weather_window.py`**

- Analizar histórico de `nextRainHours` vs `soilMoisture`
- ¿Cuánto tarda el campo en secarse después de lluvia?
- Modelo simple de predicción: regresión lineal de humedad → secado

### Librerías necesarias

```text
pandas>=2.0
numpy>=1.24
matplotlib>=3.7
scikit-learn>=1.3
```

---

## 5. Integración Futura en el Dashboard

Solo se integrará al dashboard **cuando el script Python haya validado que los datos son útiles y el modelo funciona bien**. La sección nueva sería:

### Panel "IA Advisor"

```text
┌─────────────────────────────────────────────┐
│  🧠 IA Advisor                              │
│                                             │
│  Fendt 942 + Cultivador 9m                  │
│  Perfil óptimo: 1650 RPM · A4 · 8.5 km/h  │
│  Consumo esperado: 13.8 L/h                 │
│                                             │
│  ⚠ Patinaje alto · Zona NE del campo       │
│                                             │
│  🌧 Lluvia en ~6h                           │
│  ✅ Tiempo suficiente para terminar campo   │
└─────────────────────────────────────────────┘
```

---

## 6. Modificaciones Necesarias en Lua

### 6.1 En `SHTelemetry.lua` (nuevo bloque)

```lua
-- Detección de campo propio
local function isOnOwnedField(vehicle)
    local x, _, z = getWorldTranslation(vehicle.rootNode)
    local farmId = g_currentMission.player.farmId
    local fieldId = FieldUtil.getFieldAtWorldPosition(x, z)
    if fieldId and fieldId > 0 then
        local field = g_currentMission.fields[fieldId]
        return field ~= nil and field.farmId == farmId, fieldId
    end
    return false, -1
end

-- Estado del implemento
local function getImplementState(vehicle)
    local impl = vehicle:getAttachedImplements()[1]  -- implemento principal
    if impl then
        return {
            name     = impl.object:getName(),
            isLowered = impl.object:getIsLowered(),
            isActive  = impl.object:getIsActive(),
            workType  = detectWorkType(impl.object)  -- función a implementar
        }
    end
    return nil
end

-- Estado del tiempo + predicción
local function getWeatherData()
    local env = g_currentMission.environment
    return {
        weatherState   = env.weather:getCurrentWeatherType(),
        soilMoisture   = env.soilMoisture or 0,
        nextRainHours  = env.weather:getNextRainTime() / 3600  -- convertir a horas
    }
end
```

### 6.2 Investigar en MR (pendiente)

- ¿Expone MR datos de rueda en tiempo de ejecución vía Lua?
- Buscar en `MR_Motorized.lua` y `MR_AttacherJoints.lua`
- Alternativa: leer el XML de configuración del vehículo al inicio de sesión

---

## 7. Predicción de Ventana de Siembra

Este es el "corazón" del punto climático. El sistema debe responder:

> *"¿Puedo terminar de sembrar el campo antes de que llueva?"*

### Inputs necesarios

- `nextRainHours` — horas hasta la lluvia (del juego)
- `fieldAreaHa` — hectáreas del campo (leer de `FieldUtil` o dejar que el usuario lo configure)
- `workWidth` — ancho de trabajo del implemento (metros)
- `workSpeedKmh` — velocidad actual de trabajo
- `fieldCompleted` — % del campo ya trabajado

### Cálculo

```text
areaRestanteHa = fieldAreaHa * (1 - fieldCompleted/100)
anchoKm        = workWidth / 1000
pasesNecesarios = areaRestanteHa / anchoKm
distanciaKm    = pasesNecesarios * longitudCampoKm
horasNecesarias = distanciaKm / workSpeedKmh

margenHoras = nextRainHours - horasNecesarias
```

Si `margenHoras > 0` → **"Llegas"** (verde)  
Si `margenHoras < 0` → **"No llegas, te faltan X horas"** (rojo)  
Si `margenHoras < 1` → **"Justo, acelera"** (ámbar)

---

## 8. Desafíos y Preguntas Abiertas

| Pregunta | Estado |
| --- | --- |
| ¿`g_currentMission.environment.weather:getNextRainTime()` existe en FS25? | 🔍 Por verificar |
| ¿MR expone datos de neumáticos en tiempo de ejecución? | 🔍 Por verificar en MR_Motorized.lua |
| ¿Hay diferencias de comportamiento entre marcas de neumáticos en el juego? | 🔍 Por investigar |
| ¿`FieldUtil.getFieldAtWorldPosition()` funciona dentro de SHTelemetry? | 🔍 Por verificar |
| ¿Cuánta memoria ocupa 1 sesión de 8h a 1 muestra/s? | ~28MB (estimado) — aceptable |
| ¿El script Python corre con los datos del servidor o del cliente? | Del servidor (Node.js lee el pipe, guarda el .jsonl) |

---

## 9. Fases de Implementación

### Fase A — Recopilación de datos ✅

- [x] Añadir estado de implemento en el payload (`implementName`, `workType`, `implementLowered`, `implementWorking`)
- [x] Guardar `.jsonl` en el backend Node.js — subcarpetas `campo_N/`
- [x] Selección manual de campo (selector 1–99, auto-detect pendiente con `FieldUtil`)
- [x] Campo incluido en cada muestra + en el nombre del archivo
- [x] `accelerator` incluido en cada muestra del JSONL
- [x] Verificar que los datos llegan correctos — bug `normalizeTelemetryData` corregido
- [ ] Detección automática de campo con `FieldUtil.getFieldAtWorldPosition()` — pendiente
- [ ] Añadir datos de clima en el payload (`weatherState`, `soilMoisture`, `nextRainHours`) — pendiente

### Fase B — Análisis Python 🔄

- [x] Crear `Scripts/analyze_session.py` — estadísticas por sesión, distribuciones carga/velocidad
- [x] `recommended_accelerator` — promedio acelerador en zona óptima de carga (70–85 %)
- [x] Perfil acumulado campo+workType (`campo_profiles.json`) — promedio ponderado entre sesiones
- [x] Validar correlaciones — `recommended_accelerator` funciona correctamente en prueba real
- [x] Integración en dashboard — banda de perfil histórico + hint en pestaña marcha
- [ ] Crear `Analysis/field_heatmap.py` — mapa de calor `posX/Z + slip`
- [ ] Crear `Analysis/weather_window.py` — ventana de siembra antes de lluvia
- [ ] Revisar resultados con múltiples sesiones acumuladas

### Fase C — Modelo ⏳

- [ ] Entrenar modelo de perfil óptimo (scikit-learn: regresión o clustering)
- [ ] Entrenar modelo de predicción climática
- [ ] Exportar modelo como JSON

### Fase D — Dashboard IA ⏳

- [x] Panel IA construido (`ia-tab.html`) — telemetría en tiempo real + análisis por sesión
- [x] Panel de archivos grabados por campo — listar, analizar, eliminar
- [x] Pestaña marcha con hint acelerador basado en análisis histórico
- [ ] Visualizar mapa de calor del campo
- [ ] Alertas en tiempo real basadas en modelo
- [ ] Predicción de ventana de siembra

---

**Última actualización:** 11 de abril de 2026  
**Autor:** TecnicFarming  
**Estado:** Fase A completada · Fase B en progreso — análisis por sesión y perfiles acumulados operativos
