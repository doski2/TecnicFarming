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
|   |   |       +-- dashboard-history.js  # Buffer historico y graficos SVG
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
|       +-- src/
|       |   +-- services/
|       |       +-- telemetry.js          # Lectura Named Pipe y emision de datos
|       +-- logs/
|
+-- SHTelemetry/                          # Mod telemetria SimHub (SHTelemetry.lua)
+-- MoreRealistic_FS25-main/              # Mod fisica realista
+-- Docs/                                 # Documentacion
|   +-- Setup/
|       +-- INSTALACION.md
|       +-- GUIA_BACKEND.md
|       +-- WEBSOCKET_INFO.md
+-- Tests/                                # Pruebas
|
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
4. `section-loader.js` carga los modulos JS en orden: `gauge.js` -> `telemetry-client.js` -> `dashboard-clock.js` -> `dashboard-terrain.js` -> `dashboard-history.js` -> `ui-updater.js` -> `dashboard.js`
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
| `SHTelemetry/` | Mod que extrae datos del juego via Named Pipe usando SimHub |
| `MoreRealistic_FS25-main/` | Mod de fisica realista (valores de torque, consumo precisos) |
