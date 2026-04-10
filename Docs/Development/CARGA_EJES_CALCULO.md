# Cálculo de Carga de Ejes — Documentación Técnica

Explica cómo se derivan `totalMassT`, `frontAxleLoad` y `frontAxleRatio` a partir de los datos de `tireLoadKN` que ya tenemos en el pipeline de telemetría.

---

## 1. De dónde viene el dato

El campo `tireLoadKN` de cada rueda proviene de **MoreRealistic**:

| Campo MR | Fuente | Descripción |
| --- | --- | --- |
| `mrLastTireLoadS` | MR ≥ 0.26.04.02 | Carga vertical suavizada (EMA 0.99/0.01) ← **usamos este** |
| `mrLastTireLoad` | MR cualquier versión | Carga vertical raw (sin suavizado) ← fallback |

La unidad es **kilonewtons (kN)**. Es la fuerza que el suelo ejerce sobre el neumático en dirección vertical.

---

## 2. Cómo se convierte a masa

La relación es directa por la segunda ley de Newton:

$$F = m \cdot g \quad \Rightarrow \quad m = \frac{F}{g}$$

Con $g = 9{,}81\text{ m/s}^2$:

$$\text{masaRueda} = \frac{\text{tireLoadKN} \times 1000}{9{,}81} \text{ kg}$$

O simplificado a toneladas:

$$\text{masaRuedaT} = \frac{\text{tireLoadKN}}{9{,}81}$$

### Ejemplo con un Fendt 942 + cultivador

| Rueda | `tireLoadKN` | Masa rueda |
| --- | --- | --- |
| FL | 18.2 kN | 1.86 t |
| FR | 18.5 kN | 1.89 t |
| RL | 34.1 kN | 3.48 t |
| RR | 34.7 kN | 3.54 t |
| **Total** | **105.5 kN** | **10.75 t** |

---

## 3. Los tres campos derivados

### 3.1 `totalMassT` — Masa total del tren (tractor + implemento + ballast)

```text
totalMassT = (wt[FL].tireLoadKN + wt[FR].tireLoadKN + wt[RL].tireLoadKN + wt[RR].tireLoadKN) / 9.81
```

> Este valor incluye automáticamente **todo lo que pesa sobre las ruedas**: el tractor, el implemento en tiro, los contrapesos frontales y traseros, la carga de la sembradora, etc. Por eso no necesitamos `ballastWeight` como campo separado — ya está implícito.

### 3.2 `frontAxleLoad` — Carga en el eje delantero (kN)

```text
frontAxleLoad = wt[FL].tireLoadKN + wt[FR].tireLoadKN
```

Representa la fuerza total que soportan las ruedas delanteras. Cuanto más baja sea respecto al total, más cargadas están las traseras (típico con apero pesado en enganche de 3 puntos).

### 3.3 `frontAxleRatio` — Porcentaje de masa en eje delantero

```text
totalLoadKN   = frontAxleLoad + rearAxleLoad
frontAxleRatio = frontAxleLoad / totalLoadKN     ← valor 0.0 a 1.0
```

| Valor | Interpretación |
| --- | --- |
| 0.50 | Distribución perfectamente equilibrada (50/50) |
| 0.35–0.45 | Normal con apero trasero en campo |
| < 0.30 | Eje delantero muy descargado → riesgo de pérdida de dirección |
| > 0.55 | Eje trasero muy descargado → riesgo de patinaje trasero |

---

## 4. Por qué sustituye a `ballastWeight`

El problema de capturar `ballastWeight` directamente es que:

1. **MR no lo expone en tiempo de ejecución** — habría que leer el XML del vehículo al inicio de sesión, y el jugador puede añadir/quitar contrapesos sin recargar.
2. **No es lo que importa para el modelo ML** — lo que importa es el *efecto* del contrapeso, no su origen.

Dos tractores con configuraciones distintas (uno con 600 kg de contrapesos, otro sin contrapesos pero con un frontloader lleno) pueden tener la misma `frontAxleRatio`. El modelo aprenderá el mismo comportamiento óptimo para ambos porque **la distribución de carga es idéntica**.

```text
Tractor A: ballast 600 kg + frontAxleRatio 0.44  ← lo que queríamos capturar
Tractor B: frontloader 600L + frontAxleRatio 0.44  ← mismo comportamiento
              ↓
     Para el modelo: son el mismo caso
```

---

## 5. Cuándo se calculan estos campos

En el pipeline actual, `tireLoadKN` se captura en **`captureWheelData()`** de `SHTelemetry_Extensions.lua` (PASO 5). Los tres campos derivados se calcularán en el **backend Node.js** al momento de guardar el JSONL, sin necesidad de modificar el Lua:

```js
// En telemetry.js — al construir la muestra para guardar
const wt = data.wheelTraction || [];
const fl = wt[0]?.tireLoadKN || 0;
const fr = wt[1]?.tireLoadKN || 0;
const rl = wt[2]?.tireLoadKN || 0;
const rr = wt[3]?.tireLoadKN || 0;

const totalLoadKN   = fl + fr + rl + rr;
const frontLoadKN   = fl + fr;

sample.totalMassT      = totalLoadKN / 9.81;
sample.frontAxleLoad   = frontLoadKN;
sample.frontAxleRatio  = totalLoadKN > 0 ? frontLoadKN / totalLoadKN : 0.5;
```

> El valor por defecto de `frontAxleRatio` cuando no hay datos MR es `0.5` (distribución neutra), para no introducir un artefacto de 0.0 en el dataset.

---

## 6. Señales de alerta útiles en tiempo real

Cuando `frontAxleRatio` esté disponible en la telemetría, se pueden añadir alertas en el dashboard:

| Condición | Alerta |
| --- | --- |
| `frontAxleRatio < 0.25` | ⚠ Eje delantero muy descargado — peligro de dirección |
| `frontAxleRatio < 0.30` | Considerar contrapesos frontales |
| `frontAxleRatio > 0.58` | Eje trasero descargado — revisar distribución |

---

**Última actualización:** 10 de abril de 2026  
**Relacionado con:** `TRACCION_RUEDAS.md`, `IA_TELEMETRIA_INTELIGENTE.md`
