# 🧪 Guía de Tests — TecnicFarming

Suite automatizada para validar el backend, el frontend y el análisis de sesiones tras cambios en
mods (MoreRealistic, SHTelemetry) o en el dashboard.

---

## Ejecución rápida

Desde la raíz del proyecto:

```bat
run_tests.bat
```

Ejecuta las **3 suites** en orden. Requisitos: Node.js 16+, Python 3.10+ (para análisis).

---

## Suites incluidas

| #   | Suite    | Comando                                  | Tests | Qué valida                                                                 |
| --- | -------- | ---------------------------------------- | ----- | -------------------------------------------------------------------------- |
| 1   | Backend  | `cd Dashboard/backend && npm test`       | 28    | `TelemetryService`: parseo, EMA, chunks, tracción, JSONL, payload cliente  |
| 2   | Frontend | `node Tests/frontend_logic.test.js`      | 15    | `gauge.js`, `work-types.js`, `telemetry-ui.js`, `dyno-chart.js`            |
| 3   | Análisis | `python Scripts/test_analyze_session.py` | 23    | `analyze_session.py`: promedios, perfiles de campo, distribuciones         |

### Total: 61 tests

---

## Ejecutar suites individualmente

```bat
cd Dashboard\backend && npm test
node Tests\frontend_logic.test.js
python Scripts\test_analyze_session.py
```

---

## Archivos de tests

```text
Dashboard/backend/Tests/telemetry.test.js   # Suite unificada de telemetría
Tests/frontend_logic.test.js
Scripts/test_analyze_session.py
```

---

## Simulador sin juego (`mock_telemetry_provider.js`)

Para probar el dashboard **sin abrir FS25**:

1. Inicia el backend:

   ```bat
   cd Dashboard\backend
   npm start
   ```

2. En **otra terminal**, inicia el simulador (se conecta a la pipe del backend):

   ```bat
   node Tests\mock_telemetry_provider.js
   ```

3. Abre <http://localhost:8080> (pestaña **Dashboard** o **Trabajo** para ver gauges)

El **backend** escucha en `\\.\pipe\SHTelemetry`; el simulador se conecta como cliente (igual que FS25+SHTelemetry) y envía JSON a ~10 Hz.

> Solo un proceso puede escuchar en la pipe. Cierra el mock antes de usar FS25 real.

---

## Detalle por módulo

### Backend (`telemetry.test.js`)

- Inicialización, mapeo básico y MoreRealistic
- EMA de `totalMassT`, `handleData` con chunks parciales
- `wheelTraction` array y objeto Lua 1-indexed
- `tryParseTelemetryJson`, `toClientPayload` (aliases para el dashboard)
- `_logSample`: condiciones de grabación y estructura JSONL

### Frontend (`frontend_logic.test.js`)

- Mock de DOM mínimo y `gauge.js` — ángulos RPM/velocidad, ECO/OPT (`Math.random` fijado)
- `work-types.js` — etiquetas `label` / `short` / `profile` y códigos desconocidos

### Análisis Python (`test_analyze_session.py`)

- Promedios, distribuciones, recomendación de acelerador
- `_save_profile` y perfiles en `campo_profiles.json`

---

## Cuándo ejecutar los tests

- Tras modificar `telemetry.js`, `gauge.js` o `analyze_session.py`
- Tras actualizar SHTelemetry o MoreRealistic_FS25
- Antes de commit en parseo de datos o UI de gauges

---

## Solución de problemas

| Error                       | Causa probable           | Solución                                                          |
| --------------------------- | ------------------------ | ----------------------------------------------------------------- |
| `npm: command not found`    | Node.js no instalado     | Instalar Node.js 16+                                              |
| `python: command not found` | Python no en PATH        | Instalar Python 3.10+ o `py Scripts\test_analyze_session.py`      |
| Frontend test falla ángulos | Jitter no mockeado       | Verificar `Math.random` fijado en el test                         |

---

**Última actualización:** 13 de septiembre de 2026
