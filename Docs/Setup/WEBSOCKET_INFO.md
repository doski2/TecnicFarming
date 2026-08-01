# 🔌 WebSocket API - Eventos en Tiempo Real

## Conexión

El backend emite eventos Socket.io continuamente al cliente.

### URL

ws://localhost:8080/telemetry

### Cliente Conectando

```javascript
```

---

## 📡 Eventos Principales

### `telemetry` — Datos de Motor en Tiempo Real

**Emitido por:** Backend
**Frecuencia:** 60 FPS (cada 16.66ms)

**Estructura:**

```json
```

### `connected` — Conexión Establecida

**Emitido por:** Cliente
**Cuando:** Cuando WebSocket se conecta al servidor

```javascript
```

### `disconnected` — Desconexión

**Emitido por:** Cliente
**Cuando:** Cuando WebSocket se desconecta

```javascript
```

### `error` — Error de Conexión

**Emitido por:** Cliente
**Cuando:** Error en WebSocket

```javascript
```

---

## 🔄 Cliente → Servidor (Eventos del Cliente)

### `ping` — Test de Latencia

No implementado en el cliente actual. Usa DevTools para medir latencia de WebSocket.

---

## 📊 Ejemplo de Uso Completo

```javascript
```

---

## 🎯 Interpretación de Valores

| Campo | Rango Típico | Alarma | Referencia |

| **engineSpeed**           | 0-3000 RPM  | >2800 | Redline/Límite      |
| **fuelUsagePerHour**      | 5-45 L/h    | >40   | Muy alto            |
| **motorTorque**           | 500-2000 Nm | <300  | Muy bajo            |
| **motorLoad**             | 20-90%      | >95%  | Sobrecarga          |
| **speed**                 | 0-60 km/h   | >55   | Máxima seguridad    |
| **motorTemperature**      | 80-110°C    | >115  | Sobrecalentamiento  |
| **fuelPercentage**        | 0-100%      | <5%   | Casi vacío          |
| **pitch**                 | -15 a +15°  | >±12° | Pendiente peligrosa |
| **mrAvgDrivenWheelsSlip** | 0-3%        | >5%   | Mucho slip          |

---

## 📈 Update Frequency

**Por defecto:** 60 FPS (16.66ms por evento)

Configurable en `.env`:

```env
```

---

## 🔍 Debug - Verificar Conexión

### En Chrome DevTools Console

```javascript
```

### Ver tráfico WebSocket

1. F12 → Network
2. Filtrar por "WS" (WebSocket)
3. Hacer clic en `/socket.io`
4. Ver mensajes en "Frames"

---

## 🚨 Manejo de Errores

El cliente reintenta automáticamente si se desconecta:

Intento 1 → 1000ms delay
Intento 2 → 2000ms delay
...
Intento 10 → máximo alcanzado

Si falla todos los intentos → el panel queda en estado de espera hasta que el backend esté
disponible.

---

## 📝 Notas

- **Latencia esperada:** ~50ms (WebSocket local)
- **Frecuencia máxima:** Configurable, limitada por rendimiento
- **Pérdida de datos:** No hay buffer/queue, solo último dato
- **Estado sin juego:** Badge muestra "Esperando FS25" hasta que llega telemetría real (`isRealData:

  true`)

---

## 📖 Más Documentación

- [INSTALACION.md](./INSTALACION.md) — Cómo instalar
- [GUIA_BACKEND.md](./GUIA_BACKEND.md) — Usar backend Node.js
- [LUA_API.md](../API/LUA_API.md) — Variables de FSTelemetry
