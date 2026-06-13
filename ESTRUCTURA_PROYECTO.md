# Estructura de Archivos y Carpetas - Dashboard FS25

## Estructura Real del Proyecto

``
TecnicFarming/
|
+-- Dashboard/                          <- APLICACION PRINCIPAL
|   +-- frontend/
|   |   +-- index.html                    # Entrada del dashboard (servida por Express)
|   |   +-- css/
|   |   |   +-- variables.css             # Variables CSS globales (colores, fuentes)
|   |   |   +-- layout.css                # Estructura y posicionamiento
|   |   |   +-- components.css            # Tarjetas, gauges, widgets
|   |   +-- js/
|   |   |   +-- section-loader.js         # Carga dinamica de HTML + modulos JS
|   |   |   +-- gauge.js                  # Tacometro SVG y zonas ECO/OPT
|   |   |   +-- telemetry-client.js       # Socket.IO + normalizacion de datos
|   |   |   +-- ui-updater.js             # Animaciones, notificaciones, refresco UI
|   |   |   +-- dashboard.js              # Coordinador principal de UI
|   |   |   +-- modules/
|   |   |       +-- dashboard-clock.js    # Reloj superior
|   |   |       +-- dashboard-terrain.js  # Pitch, roll, transformacion tractor
|   |   |       +-- dyno-chart.js         # Grafico dinamometro (uPlot)
|   |   |       +-- ia-analysis.js        # Analisis IA en panel
|   |   +-- sections/                     # Fragmentos HTML cargados dinamicamente
|   |   |   +-- topnav.html
|   |   |   +-- col-left.html
|   |   |   +-- col-center.html
|   |   |   +-- col-right.html
|   |   |   +-- bottom-strip.html
|   |   |   +-- cards/
|   |   |       +-- engine-data.html
|   |   |       +-- fuel-management.html
|   |   |       +-- tractor-health.html
|   |   |       +-- tachometer.html
|   |   |       +-- dynamometer.html
|   |   |       +-- live-telemetry.html
|   |   |       +-- terrain-angle.html
|   |   |       +-- wheel-traction.html
|   |   +-- assets/                       # Recursos graficos
|   |
|   +-- backend/
|       +-- server.js                     # Express + Socket.io + Named Pipe
|       +-- package.json
|       +-- Tests/
|       |   +-- telemetry.test.js         # Tests unitarios TelemetryService
|       +-- src/
|       |   +-- services/
|       |       +-- telemetry.js          # Lectura Named Pipe, parseo y logging
|       +-- logs/
|
+-- SHTelemetry/                          # Mod telemetria SimHub (SHTelemetry.lua)
+-- Scripts/                              # Analisis y tests de telemetria
|   +-- analyze_session.py                # Procesa JSONL -> campo_profiles.json
|   +-- test_telemetry.js                 # 28 tests de parseo y logging
|   +-- test_analyze_session.py           # 20 tests del analizador
+-- Tests/                                # Tests frontend y simulador
|   +-- frontend_logic.test.js            # Tests de gauge.js (3 tests)
|   +-- mock_telemetry_provider.js        # Simulador Named Pipe sin juego
+-- Data/
|   +-- sessions/                         # Grabaciones JSONL por campo
|   +-- campo_profiles.json               # Perfiles acumulados por campo/trabajo
+-- Docs/                                 # Documentacion
|   +-- Setup/
|       +-- INSTALACION.md
|       +-- GUIA_BACKEND.md
|       +-- WEBSOCKET_INFO.md
|       +-- TESTING.md                    # Guia de la suite de tests
|   +-- Development/
|   +-- GUIA_DATOS_TELEMETRIA.md
|
+-- run_tests.bat                         # Ejecuta las 4 suites (58 tests)
+-- start.bat                             # Arranque rapido (backend + navegador)
+-- README.md
+-- ESTRUCTURA_PROYECTO.md                <- Este archivo
+-- HERRAMIENTAS_RECOMENDADAS.md
``

---

## Descripcion por Capa

### Frontend (`Dashboard/frontend/`)

Interfaz completamente estatica servida por Express.

**Flujo de carga:**

1. El navegador carga `index.html`
2. `index.html` carga Socket.IO (CDN) y `section-loader.js`
3. `section-loader.js` inyecta los fragmentos HTML de `sections/` en el DOM
4. `section-loader.js` carga los modulos JS en orden: `gauge.js` -> `uplot.min.js` -> `telemetry-client.js` -> `dashboard-clock.js` -> `dashboard-terrain.js` -> `dyno-chart.js` -> `ia-analysis.js` -> `ui-updater.js` -> `dashboard.js`
5. `dashboard.js` llama a `window.initDashboard()`

### Backend (`Dashboard/backend/`)

Node.js + Express + Socket.io.

**Flujo de datos:**

    FS25 -> Named Pipe \\.\pipe\SHTelemetry -> telemetry.js -> Socket.io /telemetry -> frontend

- Escucha en `http://0.0.0.0:8080`
- Emite evento `telemetry` a 60 FPS (cada 16.66ms)
- Sirve el frontend como raiz estatica (`Dashboard/frontend/`)

### Mods FS25

| Carpeta | Descripcion |
|---|
| `SHTelemetry/` | Mod que extrae datos del juego via Named Pipe |
| `MoreRealistic_FS25` | Mod de fisica realista (torque, consumo, bandas de potencia) |

### Tests y analisis

| Carpeta / archivo | Descripcion |
|---|---|
| `run_tests.bat` | Ejecuta 58 tests en 4 suites |
| `Tests/frontend_logic.test.js` | Tests de logica de gauges |
| `Tests/mock_telemetry_provider.js` | Simulador de telemetria sin FS25 |
| `Scripts/analyze_session.py` | Analiza sesiones JSONL y actualiza perfiles |
| `Data/sessions/` | Archivos `.jsonl` grabados en partida |
