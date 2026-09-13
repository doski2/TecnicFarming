# 🔌 WebSocket API - Eventos en Tiempo Real

Contrato Socket.io entre el backend (`Dashboard/backend`) y el dashboard (`Dashboard/frontend`).

El payload del evento `telemetry` lo genera `TelemetryService.toClientPayload()` — **una sola
normalización en el backend**; el cliente no remapea campos.

---

## Conexión

| Parámetro   | Valor                           |
| ----------- | ------------------------------- |
| URL base    | `http://localhost:8080`         |
| Namespace   | `/telemetry`                    |
| Protocolo   | Socket.io (WebSocket)           |
| Frecuencia  | ~60 FPS (`UPDATE_FREQUENCY_MS`) |

### Cliente (dashboard)

```javascript
const socket = io('/telemetry', {
  reconnection: true,
  reconnectionDelay: 5000,
  reconnectionDelayMax: 10000,
  reconnectionAttempts: 10
});

socket.on('telemetry', (data) => {
  // data ya incluye engineSpeed, motorLoad, fuelUsagePerHour, etc.
  console.log(data.engineSpeed, data.motorLoad);
});
```

---

## 📡 Servidor → Cliente

### `telemetry` — Telemetría en vivo

**Emitido por:** backend (`server.js` → `nsp.emit('telemetry', data)`)
**Frecuencia:** cada `UPDATE_FREQUENCY_MS` (por defecto 16.66 ms ≈ 60 FPS)
**Fuente:** `TelemetryService.getCurrentData()` → `toClientPayload()`

#### Campos principales (dashboard)

| Campo dashboard        | Origen interno (`currentData`) | Tipo    | Descripción                    |
| ---------------------- | ------------------------------ | ------- | ------------------------------ |
| `engineSpeed`          | `rpm`                          | number  | RPM del motor                  |
| `motorLoad`            | `engineLoad`                   | number  | Carga motor 0–100 %            |
| `motorTorque`          | `torque`                       | number  | Par motor (Nm)                 |
| `fuelUsagePerHour`     | `consumption`                  | number  | Consumo L/h                    |
| `motorTemperature`     | `temperature`                  | number  | °C                             |
| `fuelPercentage`       | `fuelLevel`                    | number  | % depósito                     |
| `currentGear`          | `gear`                         | string  | Marcha (ej. `6F`)              |
| `powerHP`              | `powerKW × 1.35962`            | number  | Potencia calculada             |
| `speed`                | `speed`                        | number  | km/h                           |
| `pitch` / `roll`       | idem                           | number  | Inclinación (°)                |
| `workType` / `cropType`| idem                           | string  | Trabajo y cultivo              |
| `wheelTraction`        | normalizado a 4 ruedas         | array   | FL, FR, RL, RR                 |
| `isRealData`           | estado pipe                    | boolean | `true` si FS25 está conectado  |
| `isConnected`          | estado pipe                    | boolean | Pipe activa                    |
| `timestamp`            | `Date.now()`                   | number  | ms epoch                       |

El objeto incluye **también** los nombres internos (`rpm`, `engineLoad`, `consumption`, …) para
compatibilidad y depuración.

#### Ejemplo de payload

```json
{
  "rpm": 1850,
  "engineSpeed": 1850,
  "engineLoad": 72.5,
  "motorLoad": 72.5,
  "consumption": 14.2,
  "fuelUsagePerHour": 14.2,
  "torque": 420,
  "motorTorque": 420,
  "speed": 12.4,
  "gear": "6F",
  "currentGear": "6F",
  "vehicleName": "Fendt 724",
  "workType": "HARVESTER",
  "cropType": "WHEAT",
  "implementLowered": true,
  "wheelTraction": [
    { "position": "FL", "torquePercent": 25, "slip": 0.02, "tireLoadKN": 28 }
  ],
  "mrPowerBandMinRpm": 1200,
  "mrPowerBandMaxRpm": 1800,
  "mrPeakPowerRpm": 1700,
  "totalMassT": 12.4,
  "isRealData": true,
  "isConnected": true,
  "timestamp": 1718200000000
}
```

#### `wheelTraction[]` (siempre 4 elementos)

| Campo           | Tipo    | Descripción              |
| --------------- | ------- | ------------------------ |
| `position`      | string  | `FL`, `FR`, `RL`, `RR`   |
| `motorized`     | boolean | Rueda motriz             |
| `torquePercent` | number  | % par repartido          |
| `slip`          | number  | Patinaje                 |
| `tireLoadKN`    | number? | Carga neumático (kN)     |
| `longSlip`      | number? | Slip longitudinal        |
| `latSlip`       | number? | Slip lateral             |
| `groundType`    | string? | Tipo de suelo            |

### `pong` — Respuesta a ping

```javascript
socket.emit('ping');
socket.on('pong', (data) => console.log('latencia test', data.timestamp));
```

---

## 🔄 Cliente → Servidor

| Evento / API              | Método   | Descripción                              |
| ------------------------- | -------- | ---------------------------------------- |
| `ping`                    | Socket   | Test de latencia → responde `pong`       |
| `/api/session/campo`      | POST     | Campo activo para grabación JSONL        |
| `/api/analyze/sessions`   | GET      | Listar sesiones grabadas (.jsonl)        |
| `/api/campo-profile`      | GET      | Perfiles acumulados por campo/trabajo    |

Ejemplo — establecer campo 3:

```javascript
fetch('/api/session/campo', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ campo: 3 })
});
```

---

## 🎯 Interpretación de valores (alarmas UI)

| Campo                     | Rango típico | Alarma | Referencia           |
| ------------------------- | ------------ | ------ | -------------------- |
| `engineSpeed`             | 0–3000 RPM   | >2800  | Redline              |
| `fuelUsagePerHour`        | 5–45 L/h     | >40    | Consumo muy alto     |
| `motorTorque`             | 500–2000 Nm  | <300   | Par bajo             |
| `motorLoad`               | 20–90 %      | >95 %  | Sobrecarga           |
| `speed`                   | 0–60 km/h    | >55    | Velocidad alta       |
| `motorTemperature`        | 80–110 °C    | >115   | Sobrecalentamiento   |
| `fuelPercentage`          | 0–100 %      | <5 %   | Depósito casi vacío  |
| `pitch`                   | −15 a +15 °  | >±12 ° | Pendiente peligrosa  |
| `mrAvgDrivenWheelsSlip`   | 0–3 %        | >5 %   | Patinaje excesivo    |

---

## 📈 Frecuencia de actualización

Configurable en `Dashboard/backend/.env`:

```env
UPDATE_FREQUENCY_MS=16.66
SOCKET_IO_NAMESPACE=/telemetry
```

---

## 🔍 Debug

### Consola del navegador

```javascript
// Tras cargar el dashboard
window.telemetryClient.socket.connected;
```

### DevTools → Network → WS

1. F12 → Network → filtro **WS**
2. Clic en `/socket.io`
3. Pestaña **Frames** → buscar evento `telemetry`

---

## 🚨 Reconexión

El cliente reintenta con delays crecientes (5 s → 10 s máx., hasta 10 intentos). Si falla, el
badge muestra **"Esperando FS25"** hasta que el backend reciba datos reales (`isRealData: true`).

---

## 📖 Documentación relacionada

- [INSTALACION.md](./INSTALACION.md) — Instalación
- [GUIA_BACKEND.md](./GUIA_BACKEND.md) — Backend y logs
- [GUIA_DATOS_TELEMETRIA.md](../GUIA_DATOS_TELEMETRIA.md) — Campos JSONL (grabación)
- [SHTelemetry/README.md](../../SHTelemetry/README.md) — Mod Lua y variables capturadas
- [TESTING.md](./TESTING.md) — Tests y simulador sin juego

---

**Última actualización:** 13 de septiembre de 2026
