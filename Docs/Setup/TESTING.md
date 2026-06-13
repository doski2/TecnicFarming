# 🧪 Guía de Tests — TecnicFarming

Suite automatizada para validar el backend, el frontend y el análisis de sesiones tras cambios en mods (MoreRealistic, SHTelemetry) o en el dashboard.

---

## Ejecución rápida

Desde la raíz del proyecto:

```bat
run_tests.bat
```

Ejecuta las **4 suites** en orden. Requisitos: Node.js 16+, Python 3.10+ (para la suite de análisis).

---

## Suites incluidas

| # | Suite | Comando | Tests | Qué valida |
|---|-------|---------|-------|------------|
| 1 | Backend | `cd Dashboard/backend && npm test` | 7 | `TelemetryService`: parseo JSON, EMA de masa, chunks parciales, tracción de ruedas |
| 2 | Frontend | `node Tests/frontend_logic.test.js` | 3 | `gauge.js`: ángulos de aguja RPM/velocidad, líneas ECO/OPT |
| 3 | Telemetría | `node Scripts/test_telemetry.js` | 28 | Mapeo de campos, EMA, wheelTraction, `_logSample`, estructura JSONL |
| 4 | Análisis | `python Scripts/test_analyze_session.py` | 20 | `analyze_session.py`: promedios, perfiles de campo, distribuciones |

**Total: 58 tests**

---

## Ejecutar suites individualmente

```bat
cd Dashboard\backend
npm test

cd ..\..
node Tests\frontend_logic.test.js
node Scripts\test_telemetry.js
python Scripts\test_analyze_session.py
```

---

## Archivos de tests

```
TecnicFarming/
├── run_tests.bat                              # Ejecutor de todas las suites
├── Tests/
│   ├── frontend_logic.test.js                 # Lógica de gauges (Node test runner)
│   └── mock_telemetry_provider.js             # Simulador Named Pipe (manual)
├── Dashboard/backend/Tests/
│   └── telemetry.test.js                      # Tests unitarios del servicio
└── Scripts/
    ├── test_telemetry.js                      # Tests ampliados de parseo y logging
    ├── test_analyze_session.py                # Tests del analizador de sesiones
    └── analyze_session.py                     # Script analizado por los tests
```

---

## Simulador sin juego (`mock_telemetry_provider.js`)

Para probar el dashboard **sin abrir FS25**:

1. Inicia el simulador en una terminal:

   ```bat
   node Tests\mock_telemetry_provider.js
   ```

2. Inicia el backend en otra terminal:

   ```bat
   cd Dashboard\backend
   npm start
   ```

3. Abre <http://localhost:8080>

El simulador crea la Named Pipe `\\.\pipe\SHTelemetry` y envía JSON de telemetría a ~10 Hz con datos de un Fendt 724 simulado (RPM, velocidad, combustible, campos MoreRealistic).

> **Nota:** En Windows solo un proceso puede escuchar en la pipe. Si el backend ya está en ejecución, detén uno de los dos antes de cambiar.

---

## Detalle por módulo

### Backend (`telemetry.test.js`)

- Inicialización con valores por defecto (`driveType: 4WD`, `rpm: 0`)
- Mapeo de campos básicos y MoreRealistic (`mrPowerBandMinRpm`, `motorLoad` → `engineLoad`)
- Suavizado EMA de `totalMassT` (α = 0.04)
- `handleData`: múltiples objetos por chunk y JSON parcial en buffer
- `wheelTraction` como objeto Lua 1-indexed (`{"1":{}, "2":{}…}`)

### Frontend (`frontend_logic.test.js`)

- Mock de DOM mínimo (`document.getElementById`, `requestAnimationFrame`)
- Carga de `gauge.js` en contexto de test
- Ángulos del tacómetro: 0 RPM → −210°, 8000 RPM → +30°
- `updateZoneLines`: posicionamiento ECO/OPT
- Velocímetro: 0 km/h → −210°, 30 km/h → −90°

> El tacómetro aplica jitter aleatorio a la aguja en producción. Los tests fijan `Math.random` para obtener ángulos deterministas.

### Telemetría extendida (`test_telemetry.js`)

- Mapeo completo de campos (`cropType`, `workType`, desgaste, daño)
- EMA: convergencia, ignorar valores ≤ 0
- `wheelTraction` como array o objeto Lua
- `tryParseTelemetryJson`: JSON válido, incompleto o inválido
- `_logSample`: condiciones de grabado (implemento bajado, speed ≥ 0.3 km/h), throttle 1/s, campos JSONL requeridos

### Análisis Python (`test_analyze_session.py`)

- Conteo de muestras, errores de parseo, archivo vacío
- Promedios (`motorLoad`, velocidad, RPM, combustible total)
- Recomendación de acelerador en zona óptima (70–85 % carga)
- Distribuciones de carga, velocidad y acelerador
- `_save_profile`: perfiles ponderados en `campo_profiles.json`
- Tests opcionales con JSONL reales en `Data/sessions/` si existen

---

## Cuándo ejecutar los tests

- Tras modificar `telemetry.js`, `gauge.js` o `analyze_session.py`
- Tras actualizar SHTelemetry o MoreRealistic_FS25
- Antes de hacer commit de cambios en parseo de datos o UI de gauges
- En CI local antes de desplegar o probar con el juego

---

## Solución de problemas

| Error | Causa probable | Solución |
|-------|----------------|----------|
| `npm: command not found` | Node.js no instalado | Instalar Node.js 16+ |
| `python: command not found` | Python no en PATH | Instalar Python 3.10+ o usar `py Scripts\test_analyze_session.py` |
| Frontend test falla en ángulos | Jitter no mockeado | Verificar que `Math.random` esté fijado en el test |
| Tests Python omiten datos reales | No hay `.jsonl` en `Data/sessions/` | Normal en instalación nueva; los tests unitarios siguen pasando |

---

**Última actualización:** 13 de junio de 2026
