# FS25 Telemetry Dashboard

Dashboard modular para FS25 con telemetría real, gráficos históricos y visualización de tractor.

## Estructura activa

```text
Dashboard/frontend/
├── index.html
├── css/
│   ├── variables.css
│   ├── layout.css
│   └── components.css
├── js/
│   ├── section-loader.js
│   ├── gauge.js
│   ├── uplot.min.js
│   ├── telemetry-client.js
│   ├── ui-updater.js
│   ├── dashboard.js
│   └── modules/
│       ├── dashboard-clock.js
│       ├── dashboard-terrain.js
│       ├── dyno-chart.js
│       └── ia-analysis.js
└── sections/
    ├── topnav.html
    ├── col-left.html
    ├── col-center.html
    ├── col-right.html
    ├── bottom-strip.html
    ├── ia-tab.html
    └── cards/
        ├── engine-data.html
        ├── fuel-management.html
        ├── tractor-health.html
        ├── tachometer.html
        ├── dynamometer.html
        ├── live-telemetry.html
        ├── terrain-angle.html
        └── wheel-traction.html
```

## Qué hace cada archivo

- `index.html`: markup principal del panel.
- `css/variables.css`: variables CSS (colores, fuentes, espaciados).
- `css/layout.css`: estructura y posicionamiento del layout.
- `css/components.css`: estilos de tarjetas, gauges y widgets.
- `js/section-loader.js`: carga dinámica de fragmentos HTML (`sections/`) y módulos JS.
- `js/gauge.js`: animación del tacómetro, velocímetro y zonas ECO/OPT.
- `js/telemetry-client.js`: conexión Socket.IO y normalización de datos.
- `js/ui-updater.js`: efectos visuales, notificaciones y animaciones.
- `js/dashboard.js`: coordinador principal de UI y telemetría.
- `js/modules/dashboard-clock.js`: reloj superior.
- `js/modules/dashboard-terrain.js`: pitch, roll y transformación del tractor.
- `js/modules/dyno-chart.js`: gráfico del dinamómetro (uPlot).
- `js/modules/ia-analysis.js`: panel de análisis inteligente.
- `sections/`: fragmentos HTML cargados por `section-loader.js`.

## Arranque

1. Inicia el backend con `start.bat` o `npm start` en `Dashboard/backend`.
2. Abre <http://localhost:8080>.
3. Verifica que el indicador de conexión cambie a estado conectado cuando llegue telemetría.

Para probar sin juego: `node Tests\mock_telemetry_provider.js` (desde la raíz del repo).

## Dependencias de carga

El orden en `index.html` es:

1. Socket.IO (CDN)
2. `section-loader.js` — carga el resto de forma dinámica en este orden:
   1. `gauge.js`
   2. `uplot.min.js`
   3. `telemetry-client.js`
   4. `dashboard-clock.js`
   5. `dashboard-terrain.js`
   6. `dyno-chart.js`
   7. `ia-analysis.js`
   8. `ui-updater.js`
   9. `dashboard.js` → llama `window.initDashboard()`

## Tests del frontend

```bat
node Tests\frontend_logic.test.js
```

Valida ángulos de aguja del tacómetro y velocímetro, y posicionamiento de líneas ECO/OPT en `gauge.js`. Ver [Docs/Setup/TESTING.md](../../Docs/Setup/TESTING.md).

## Contrato de telemetría

Los campos usados por el dashboard (normalizados en `telemetry-client.js`):

- `engineSpeed`, `motorTorque`, `motorLoad`, `accelerator`
- `fuelUsagePerHour`, `fuelPercentage`, `motorTemperature`
- `speed`, `currentGear`, `gearGroupName`
- `implementsAttached`, `implementLowered`, `implementWorking`
- `mrAvgDrivenWheelsSlip`, `mrPowerBandMinRpm`, `mrPeakPowerRpm`
- `pitch`, `roll`, `tractorDamage`, `wheelTraction`
- `isMotorStarted`, `timestamp`, `isRealData`, `isConnected`

## API principal

```javascript
window.dashboard.updateTelemetry(data)
```

```javascript
window.gaugeAnimator.setRPM(rpm)
window.gaugeAnimator.updateZoneLines(eco, optimal)
window.speedGaugeAnimator.setSpeed(speed)
```

```javascript
window.telemetryClient.onTelemetry(callback)
window.telemetryClient.sendCommand(command, params)
window.telemetryClient.disconnect()
```

## Notas

- El flujo activo depende de telemetría real enviada por el backend (SHTelemetry o simulador).
- Si el backend cae o no hay Named Pipe, el panel queda en estado de espera.
- El tacómetro aplica un ligero jitter aleatorio a la aguja para realismo visual.
