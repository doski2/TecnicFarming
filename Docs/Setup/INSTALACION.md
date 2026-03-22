# 📦 Instalación del Dashboard FS25

## Requisitos Previos

### Sistema

- Windows 10 / Windows 11
- Node.js 16+ ([Descargar aquí](https://nodejs.org/))
- Farming Simulator 2025

### Mods Requeridos

- FSTelemetry (para extracción de datos)
- MoreRealistic_FS25 (recomendado para datos precisos)

## 🚀 Instalación Paso a Paso

### 1. Instalar Node.js

1. Descarga Node.js LTS desde <https://nodejs.org/>
2. Ejecuta el instalador
3. Verifica la instalación:

```bash
node --version
npm --version
```

### 2. Clonar/Descargar el Proyecto

```bash
cd c:\Users\doski\TecnicFarming
git clone <repo-url>  # O descarga el ZIP
cd Dashboard
```

### 3. Instalar Dependencias Backend

```bash
cd Dashboard/backend
npm install
```

Esto instalará:

- `express` — Servidor HTTP
- `socket.io` — WebSocket en tiempo real
- `dotenv` — Variables de entorno

### 4. Configurar Variables de Entorno

```bash
# En Dashboard/backend/
cp .env.example .env
```

Edita `.env` con tus valores:

```env
NODE_ENV=development
SOCKET_IO_PORT=8080
NAMED_PIPE_NAME=\\\\.\\pipe\\SHTelemetry
```

### 5. Confirmar FSTelemetry en el Juego

1. Abre Farming Simulator 2025
2. Ve a Configuración → Mods
3. Activa:
   - ✅ FSTelemetry
   - ✅ MoreRealistic_FS25

### 6. Iniciar el Servidor Backend

```bash
# En Dashboard/backend/
npm start
```

Deberías ver:

✓ HTTP/WebSocket escuchando: <http://0.0.0.0:8080>
✓ Socket.io namespace: /telemetry
✓ Update frequency: 16.66ms (60 FPS)

### 7. Abrir el Dashboard

En tu navegador, abre:

<http://localhost:8080>

O ejecuta `start.bat` desde la raíz del proyecto (inicia el backend y abre el navegador automáticamente).

## ✅ Verificar Instalación

### Checklist

- [ ] Node.js instalado (`node --version` muestra versión)
- [ ] `npm install` completó sin errores
- [ ] Archivo `.env` creado
- [ ] Mods FSTelemetry activos en FS25
- [ ] Servidor Backend en ejecución (`npm start`)
- [ ] Dashboard abierto en navegador
- [ ] Datos en vivo aparecen en el dashboard

### Solucionar Problemas

**Error: "npm: command not found"**
→ Instala Node.js desde <https://nodejs.org/>

**Error: "Named Pipe no disponible"**
→ Confirma que SHTelemetry.lua o FSTelemetry.lua está activo

**Dashboard no actualiza datos**
→ Verifica logs en `Dashboard/backend/logs/` y revisa DevTools (F12)

## 📝 Próximo Paso

Una vez instalado, consulta:

- **[CONFIGURACION.md](./CONFIGURACION.md)** — Ajustes iniciales
- **[ARQUITECTURA.md](../Architecture/ARQUITECTURA.md)** — Cómo funciona el sistema
