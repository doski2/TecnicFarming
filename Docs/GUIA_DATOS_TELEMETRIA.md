# Guía de Datos de Telemetría — TecnicFarming FS25

> Referencia de todos los campos grabados en los archivos `.jsonl` de sesión.
> Origen de datos: **SHTelemetry mod (Lua)** → **Dashboard backend (Node.js)** → `Data/sessions/`

---

## ¿Cómo se genera cada archivo?

El backend graba **1 muestra por segundo** mientras el implemento esté bajado y el vehículo se mueva a más de 0,3 km/h. La ruta del archivo es:

```
Data/sessions/campo_<N>/<fecha>_<vehículo>_<tipoTrabajo>.jsonl
```

Cada línea del archivo es un objeto JSON independiente (formato JSONL). El script `Scripts/analyze_session.py` procesa estas líneas y genera estadísticas acumuladas en `Data/campo_profiles.json`.

---

## Campos del archivo JSONL

### Identificación y contexto

| Campo | Tipo | Ejemplo | Descripción |
|---|---|---|---|
| `ts` | entero | `1775928392` | Timestamp Unix en segundos (hora del servidor, no del juego) |
| `campo` | entero | `13` | Número de campo seleccionado en el dashboard |
| `tractorId` | string | `"MR Massey Ferguson MF 8570"` | Nombre completo del vehículo activo (vehicle:getFullName()) |
| `workType` | string | `"HARVESTER"` | Tipo de trabajo detectado según las specs del implemento |
| `implementName` | string | `"MR Capello Diamant 8"` | Nombre del primer implemento acoplado |

#### Valores posibles de `workType`

| Valor | Significa |
|---|---|
| `HARVESTER` | Cosechadora o cabezal cosechador |
| `SOWER` | Sembradora / sembradora de precisión |
| `SPRAYER` | Pulverizador / abonadora líquida |
| `FERTILIZER` | Esparcidor de abono sólido / purín |
| `PLOW` | Arado |
| `CULTIVATOR` | Cultivador / subsolador / disco |
| `MOWER` | Segadora / rastrilladora / henificadora |
| `BALER` | Empacadora |
| `TRANSPORT` | Remolque de transporte |
| `FIELDWORK` | Trabajo de campo genérico |
| `UNKNOWN` | No detectado |

---

### Motor y transmisión

| Campo | Unidad | Ejemplo | Descripción |
|---|---|---|---|
| `rpm` | RPM | `2200` | Régimen real del motor en ese instante |
| `torque` | Nm | `490.1` | Par motor aplicado en ese instante (kN·m × 1000) |
| `motorLoad` | % (0-125) | `63.7` | Carga del motor. **100% = límite nominal.** MR permite picos breves >100%. |
| `accelerator` | % (0-100) | `24.9` | Posición del pedal de acelerador. En cosechadoras controla la velocidad de avance mientras el motor corre a RPM constante. |
| `fuelUsage` | L/h | `34.0` | Consumo instantáneo. Con MR activo usa el valor suavizado (filtro 0,99/0,01). |
| `gear` | string | `"D"` | Marcha activa: nombre de la marcha actual según el vehículo. |
| `transmissionType` | string | `"manual"` | Tipo de transmisión detectada: `manual`, `automatic` o `cvt`. |

#### Cómo interpretar `motorLoad`

```
  0 - 30%  → Motor muy descargado. Se puede aumentar velocidad o acelerar más.
 30 - 60%  → Carga media. Normal en transporte o cuestas suaves.
 60 - 85%  → ZONA ÓPTIMA de trabajo. Máxima eficiencia combustible/potencia.
 85 -100%  → Carga alta. Motor esforzado. Vigilar temperatura y slip.
100 -125%  → Sobrecarga momentánea (MR). Reducir velocidad inmediatamente.
```

---

### Movimiento y posición

| Campo | Unidad | Ejemplo | Descripción |
|---|---|---|---|
| `speed` | km/h | `3.56` | Velocidad absoluta de avance (siempre ≥ 0, sin signo de dirección) |
| `pitch` | grados | `-6.5` | Inclinación longitudinal. **Negativo = bajando cuesta adelante. Positivo = subiendo.** |
| `roll` | grados | `1.2` | Inclinación lateral. **Positivo = lado derecho más alto. Negativo = lado izquierdo más alto.** |

#### Velocidades de referencia por tipo de trabajo (FS25 + MR)

| Tipo de trabajo | Velocidad típica |
|---|---|
| Cosechadora (maíz/girasol) | 3 - 5 km/h |
| Cosechadora (trigo/cebada) | 5 - 8 km/h |
| Sembradora | 8 - 12 km/h |
| Cultivador / arado | 8 - 14 km/h |
| Pulverizador | 12 - 18 km/h |
| Transporte campo | >20 km/h |

---

### Deslizamiento de ruedas (Wheel Slip)

| Campo | Unidad | Ejemplo | Descripción |
|---|---|---|---|
| `wheelSlipRL` | % | `1.6` | Deslizamiento longitudinal de la rueda trasera izquierda (Rear-Left). Dato de MoreRealistic. |
| `wheelSlipRR` | % | `1.2` | Deslizamiento longitudinal de la rueda trasera derecha (Rear-Right). |

Calculado desde `mrLastLongSlip` de MR_WheelPhysics × 100. Solo ruedas 3 y 4 (traseras). Las delanteras no se graban porque en tractores/cosechadoras rara vez son directrices de tracción en campo.

#### Cómo interpretar el slip

```
  0 - 2%   → Tracción óptima. Neumáticos trabajando bien.
  2 - 5%   → Deslizamiento normal en campo húmedo o cuesta.
  5 - 10%  → Deslizamiento notable. Considerar reducir velocidad.
 10 - 20%  → Deslizamiento severo. Riesgo de compactación y pérdida de tracción.
  > 20%    → Patina. Reducir velocidad o usar diferencial bloqueado.
```

---

### Masas y distribución de carga en ejes

Estos campos se calculan en el backend a partir de los datos de carga de neumáticos de MoreRealistic (`mrLastTireLoadS` de cada rueda, en kN).

| Campo | Unidad | Ejemplo | Descripción |
|---|---|---|---|
| `totalMassT` | toneladas | `16.01` | **Peso aparente** = suma de las fuerzas normales de las 4 ruedas ÷ 9,81. **No es la masa real del vehículo.** Es la fuerza que los neumáticos ejercen sobre el terreno en ese instante. Varía con la pendiente y con la dinámica de movimiento (ver nota). |
| `frontAxleLoad` | kN | `115.25` | Fuerza normal sobre el eje delantero (FL + FR). Cuanto más en cuesta abajo, mayor es este valor. |
| `frontAxleRatio` | 0-1 | `0.734` | Fracción del peso total sobre el eje delantero. **Este indicador es fiable incluso en pendiente** porque la distribución relativa entre ejes sí refleja la posición del CG. 0.5 = equilibrado. |

> **⚠️ Nota sobre `totalMassT` y la pendiente**
>
> `mrLastTireLoadS` mide la fuerza **normal al terreno** en cada rueda. En una pendiente de ángulo θ:
>
> - Fuerza normal total ≈ m×g×cos(θ) (estática)
> - El backend divide por 9,81: `totalMassT` ≈ m×cos(θ)
>
> En pendientes suaves (0-10°) el efecto es pequeño (cos(7°) = 0,993), pero los efectos dinámicos de aceleración/frenada y la transferencia de carga longitudinal pueden amplificar la diferencia respecto a la masa real. **Usar `totalMassT` como referencia de la carga sobre el suelo en ese instante, no como la masa absoluta del conjunto.**

#### Cómo interpretar `frontAxleRatio`

```
  > 0.6    → Mucho peso al frente. Dirección pesada / hundimiento frontal en campo blando.
0.4 - 0.6  → Distribución equilibrada. Óptimo para dirección y tracción.
  < 0.4    → Mucho peso atrás. Riesgo de empinarse / pérdida de dirección.
```

**Ejemplo del dataset** — Cosechadora MF 8570, Campo 13 (pendiente pronunciada):
El `totalMassT` varía de **18,36 t** a **15,09 t** a lo largo de 76 segundos mientras el `pitch` pasa de **-6,4°** a **-1,9°**. El terreno se está **nivelando** (menos cuesta abajo) y la transferencia de carga dinámica al eje delantero disminuye, por eso baja también `frontAxleRatio` de **0,881** a **0,690**. La variación de `totalMassT` refleja principalmente los cambios en la pendiente y la dinámica del terreno, **no** una variación de masa real del vehículo.

---

## Archivo de perfiles: `Data/campo_profiles.json`

Generado automáticamente por `analyze_session.py` cada vez que se analiza una sesión. Contiene el **promedio ponderado** de todas las sesiones de un campo + tipo de trabajo.

```json
"13_HARVESTER": {
  "campo": 13,
  "workType": "HARVESTER",
  "sessions": 1,               // número de sesiones analizadas
  "total_samples": 177,        // muestras totales (= segundos de trabajo real)
  "recommended_accelerator": 25.1,   // % acelerador en zona óptima (70-85% carga)
  "avg_motor_load": 65.0,      // % carga media del motor
  "avg_speed_kmh": 3.3,        // km/h media de trabajo
  "avg_fuel_lh": 34.7,         // L/h consumo medio
  "avg_rpm": 2200,             // RPM medias
  "last_updated": "2026-04-11",
  "last_vehicle": "MR Massey Ferguson MF 8570"
}
```

### Cómo usar el perfil de campo

1. **`recommended_accelerator`**: punto de partida para la próxima sesión en ese campo. Usa este valor al comenzar y ajusta ±2% según la carga real.
2. **`avg_motor_load` 60-80%**: si tu sesión actual está muy por debajo de este rango, puedes aumentar la velocidad. Si está por encima, reducirla.
3. **`avg_fuel_lh`**: referencia de consumo para estimar combustible necesario antes de salir al campo.

---

## Validación de datos — sesión del 11/04/2026 (MF 8570, Campo 13)

| Indicador | Valor observado | ¿Correcto? | Nota |
|---|---|---|---|
| RPM constante 2200 | 2200 RPM | ✅ | RPM nominal de cosechadora. El motor de la MF 8570 corre a régimen fijo durante la cosecha. |
| Acelerador 22-25% | 22.9 - 24.9% | ✅ | En cosechadoras CVT/powershift, el pedal controla la velocidad de avance, no el régimen del motor. 25% → ~3.5 km/h de avance. |
| Velocidad 3-3.7 km/h | Normal | ✅ | Velocidad típica cosechando maíz con cabezal Capello Diamant 8. |
| Consumo 23-35 L/h | Creciente | ✅ | Sube a medida que sube la carga del motor. Normal al aumentar el acelerador. |
| Carga motor 38-75% | Variable | ✅ | Oscila por cambios de terreno (pitch varía de -1.9° a -7.7°). Cuesta arriba = más carga. |
| totalMassT 18.36 → 15.09 t | Varía con el terreno | ✅ | **No es masa real.** Es el peso dinámico sobre el suelo. Disminuye porque el campo se nivela (pitch va de -6,4° a -1,9°): menos pendiente = menos transferencia de carga al eje delantero y menor fuerza normal total registrada. |
| frontAxleRatio 0.88 → 0.69 | Decrece al nivelarse el terreno | ✅ | En cuesta abajo el peso se transfiere al eje delantero (frontAxleRatio sube). Al nivelarse el campo, el reparto se equilibra y el ratio baja. Indicador fiable de distribución de CG. |
| Slip 0-4.5% | Picos puntuales | ✅ | Terreno de campo (FIELD). El pico de 4.5% en ts=1775928451 es momentáneo (RL=0.5, RR=4.5) — bache o zona blanda. |
| Pitch -1.9° a -7.7° | Negativo = cuesta abajo | ✅ | El campo 13 tiene una pendiente pronunciada. El motor trabaja más cuando el pitch es más negativo (pendiente aumenta resistencia al cabezal). |
| transmissionType "manual" | — | ✅ | El MF 8570 en MR está configurado como transmisión directa powershift (isAutomatic=false en FS25). No es CVT hidrostática. |

---

## Flujo completo de los datos

```
FS25 (juego)
  └─ SHTelemetry.lua          — Captura datos del motor, ruedas, implemento cada 10ms
       └─ SHTelemetry_Extensions.lua  — Captura posición, ruedas MR, implemento, pitch/roll
            └─ Named Pipe \\\\.\\pipe\\SHTelemetry  — Envío como JSON línea por línea
                 └─ pipe-to-tcp-bridge.ps1  — Puente PowerShell Pipe → TCP :9000
                      └─ TelemetryService (Node.js)  — Recibe, parsea, filtra
                           ├─ WebSocket → Dashboard frontend (tiempo real)
                           └─ _logSample() → Data/sessions/<campo>/<fecha>.jsonl (1/s)
                                └─ analyze_session.py → Data/campo_profiles.json
```
