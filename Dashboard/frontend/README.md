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
│   ├── telemetry-client.js
│   ├── ui-updater.js
│   ├── dashboard.js
│   └── modules/
│       ├── dashboard-clock.js
│       ├── dashboard-terrain.js
│       └── dashboard-history.js
└── sections/
    ├── topnav.html
    ├── col-left.html
    ├── col-center.html
    ├── col-right.html
    ├── bottom-strip.html
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
- `js/gauge.js`: animación del tacómetro y zonas ECO/OPT.
- `js/telemetry-client.js`: conexión Socket.IO y normalización de datos.
- `js/ui-updater.js`: efectos visuales, notificaciones y animaciones.
- `js/dashboard.js`: coordinador principal de UI y telemetría.
- `js/modules/dashboard-clock.js`: reloj superior.
- `js/modules/dashboard-terrain.js`: pitch, roll y transformación del tractor.
- `js/modules/dashboard-history.js`: buffer histórico y render de gráficos SVG.
- `sections/`: fragmentos HTML (topnav, columnas, bottom-strip, cards) cargados por `section-loader.js`.

## Arranque

1. Inicia el backend del proyecto con `start.bat`.
2. Abre el panel servido por el backend.
3. Verifica que el indicador de conexión cambie a estado conectado cuando llegue telemetría.

## Dependencias de carga

El orden en `index.html` es:

1. Socket.IO (CDN)
2. `section-loader.js` — carga el resto de forma dinámica en este orden:
   1. `gauge.js`
   2. `telemetry-client.js`
   3. `dashboard-clock.js`
   4. `dashboard-terrain.js`
   5. `dashboard-history.js`
   6. `ui-updater.js`
   7. `dashboard.js` → llama `window.initDashboard()`

## Contrato de telemetría

Los campos usados por el dashboard son:

- `engineSpeed`
- `motorTorque`
- `motorLoad`
- `accelerator`
- `fuelUsagePerHour`
- `fuelPercentage`
- `motorTemperature`
- `speed`
- `currentGear`
- `implementsAttached`
- `implementLowered`
- `implementWorking`
- `mrAvgDrivenWheelsSlip`
- `pitch`
- `roll`
- `tractorDamage`
- `isMotorStarted`
- `timestamp`
- `isRealData`
- `isConnected`

## API principal

```javascript
window.dashboard.updateTelemetry(data)
```

```javascript
window.gaugeAnimator.setRPM(rpm)
window.gaugeAnimator.updateZoneLines(eco, optimal)
```

```javascript
window.telemetryClient.onTelemetry(callback)
window.telemetryClient.sendCommand(command, params)
window.telemetryClient.disconnect()
```

## Notas

- El flujo activo ya no arranca en modo demo.
- La vista depende de telemetría real enviada por el backend.
- Si el backend cae, el panel queda en estado de espera.
