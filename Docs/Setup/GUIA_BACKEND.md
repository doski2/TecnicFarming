# 📝 Guía de Inicio Rápido - Backend Node.js

## 1️⃣ Instalar Dependencias

```bash
```

Instalará:

- `express` — Servidor HTTP
- `socket.io` — WebSocket tiempo real
- `dotenv` — Variables de entorno

## 2️⃣ Crear Archivo .env

```bash
```

**Edita `.env` con tus valores** (generalmente son correctos por defecto):

```env
```

## 3️⃣ Iniciar Servidor

```bash
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
```

**Network → WS:**

- Debe haber conexión `/socket.io`
- Mensajes telemetría cada 16.66ms

## 🐛 Troubleshooting

### "Port already in use"

```bash
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
```

## ✅ Verificación de Conexión

1. Abre <http://localhost:8080>
2. Abre DevTools (F12 → Console)
3. Deberías ver:

   ✓ Conectado al servidor de telemetría
   ✓ UIUpdater inicializado

## 🧪 Tests del backend

```bat
```

Valida parseo JSON, EMA de masa, chunks parciales y mapeo de tracción. Para la suite completa (58
tests), ejecuta `run_tests.bat` desde la raíz.

Ver **[TESTING.md](./TESTING.md)**.

## 🚀 Próximos Pasos

- [ ] Confirmar datos en vivo en Dashboard
- [ ] Ejecutar `run_tests.bat` tras cambios en `telemetry.js`
- [ ] Revisar logs en `Dashboard/backend/logs/` si hay errores
