# 📝 Guía de Inicio Rápido - Backend Node.js

## 1️⃣ Instalar Dependencias

```bash
cd Dashboard/backend
npm install
```

Instalará:

- `express` — Servidor HTTP
- `socket.io` — WebSocket tiempo real  
- `dotenv` — Variables de entorno

## 2️⃣ Crear Archivo .env

```bash
cp .env.example .env
```

**Edita `.env` con tus valores** (generalmente son correctos por defecto):

```env
NODE_ENV=development
SOCKET_IO_PORT=8080
NAMED_PIPE_NAME=\\\\.\\pipe\\SHTelemetry
UPDATE_FREQUENCY_MS=16.66
```

## 3️⃣ Iniciar Servidor

```bash
npm start
```

Deberías ver:

═══════════════════════════════════════════
🚀 Dashboard FS25 Backend iniciado
═══════════════════════════════════════════
✓ HTTP/WebSocket escuchando: <http://0.0.0.0:8080>
✓ Socket.io namespace: /telemetry
✓ Update frequency: 16.66ms (60 FPS)

## 4️⃣ Abrir Dashboard

En tu navegador:

<http://localhost:8080>

## 🔍 Monitoreo

### Console Output

- `✓ Cliente conectado: ...` — WebSocket conectado
- `✓ Servidor escuchando en Named Pipe` — Esperando datos de SHTelemetry
- `✓ SHTelemetry conectado a Named Pipe` — Datos reales del juego

### Chrome DevTools (F12)

**Console:**

```javascript
// Ver estado conexión
telemetryClient.isConnected
```

**Network → WS:**

- Debe haber conexión `/socket.io`
- Mensajes telemetría cada 16.66ms

## 🐛 Troubleshooting

### "Port already in use"

```bash
# Cambiar puerto en .env
SOCKET_IO_PORT=8081
```

### "Named Pipe no disponible"

→ El backend sigue activo pero espera conexión. Opciones:

1. Activa SHTelemetry en FS25 y entra en partida
2. Usa el simulador: `node Tests\mock_telemetry_provider.js` (desde la raíz del proyecto)

### "npm: command not found"

→ Instala Node.js desde <https://nodejs.org/>

## 📊 Datos de Prueba

El servidor envía datos como:

```json
{
  "engineSpeed": 2150,
  "fuelUsagePerHour": 34.8,
  "motorTorque": 1685,
  "motorLoad": 74,
  "speed": 28,
  "currentGear": 4,
  "motorTemperature": 98,
  "fuelPercentage": 62,
  "pitch": -3.2,
  "roll": 1.8,
  "mrAvgDrivenWheelsSlip": 1.3,
  "tractorDamage": 0,
  "isMotorStarted": true,
  "isRealData": true,
  "isConnected": true,
  "timestamp": 1710700000000
}
```

## ✅ Verificación de Conexión

1. Abre <http://localhost:8080>
2. Abre DevTools (F12 → Console)
3. Deberías ver:

   ✓ Conectado al servidor de telemetría
   ✓ UIUpdater inicializado

## 🧪 Tests del backend

```bat
cd Dashboard\backend
npm test
```

Valida parseo JSON, EMA de masa, chunks parciales y mapeo de tracción. Para la suite completa (58 tests), ejecuta `run_tests.bat` desde la raíz.

Ver **[TESTING.md](./TESTING.md)**.

## 🚀 Próximos Pasos

- [ ] Confirmar datos en vivo en Dashboard
- [ ] Ejecutar `run_tests.bat` tras cambios en `telemetry.js`
- [ ] Revisar logs en `Dashboard/backend/logs/` si hay errores
