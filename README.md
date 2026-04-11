# 🌾 Dashboard Telemetría - Farming Simulator 25

Dashboard en tiempo real para monitorear rendimiento de maquinaria en FS25

![Version](https://img.shields.io/badge/version-0.1.0-blue)
![Status](https://img.shields.io/badge/status-development-yellow)
![License](https://img.shields.io/badge/license-MIT-green)

---

## 🎯 Características

- ⚡ **Telemetría en Tiempo Real** — 60 FPS datos en vivo
- 📊 **Gráficos Interactivos** — Tachómetro, consumo, RPM
- 🎨 **Interfaz Profesional** — Diseño Glassmorphism oscuro
- 📈 **Análisis de Rendimiento** — Detecta ineficiencias
- 🔧 **Datos Precisos** — Integración con MoreRealistic_FS25
- 📱 **Responsive** — Optimizado para 1080p (2ª pantalla)

---

## 🚀 Inicio Rápido

### Requisitos

- Windows 10/11
- Node.js 16+
- Farming Simulator 2025
- FSTelemetry + MoreRealistic_FS25 mods

### Instalación (3 pasos)

```bash
# 1. Instalar dependencias
cd Dashboard/backend
npm install

# 2. Configurar entorno
cp .env.example .env

# 3. Iniciar servidor
npm start
```

Luego abre en navegador:

<http://localhost:8080>

📖 **[Guía de Instalación Completa →](./Docs/Setup/INSTALACION.md)**

---

## 📚 Documentación

| Sección | Descripción |

| [Setup](./Docs/Setup/) | Instalación y configuración |
| [Arquitectura](./Docs/Architecture/) | Diseño del sistema |
| [API](./Docs/API/) | Interfaces WebSocket/Lua |
| [Desarrollo](./Docs/Development/) | Guías técnicas |

---

## 📂 Estructura del Proyecto

TecnicFarming/
├── Dashboard/
│   ├── frontend/          # HTML, CSS, JavaScript
│   │   ├── index.html
│   │   ├── css/           # variables.css, layout.css, components.css
│   │   ├── js/            # gauge.js, section-loader.js, telemetry-client.js…
│   │   └── sections/      # Fragmentos HTML cargados dinámicamente
│   └── backend/           # Node.js, Socket.io
│       ├── server.js
│       └── src/services/
├── SHTelemetry/           # Mod telemetría (SHTelemetry.lua)
├── MoreRealistic_FS25-main/     # Mod física realista
├── Docs/                  # Documentación completa
├── start.bat              # Arranque rápido (backend + navegador)
└── README.md              # Este archivo

---

## 💡 Características Principales

### Tachómetro Dinámico

- RPM en tiempo real
- Líneas ECO/OPTIMAL ajustadas por carga
- Animación suave de aguja

### Monitoreo de Telemetría

- Consumo de combustible (L/h)
- Par motor (Nm)
- Carga motor (%)
- Inclinación terreno (Pitch/Roll)
- Velocidad, marcha, temperatura

### Análisis de Eficiencia

- Zona óptima de RPM basada en torque
- Zona ecológica según consumo
- Indicadores de rendimiento

---

## 🛠️ Stack Tecnológico

| Capa | Tecnología |

| **Backend** | Node.js + Express |
| **Real-time** | Socket.io (WebSocket) |
| **Frontend** | HTML5 + CSS3 + Vanilla JS |
| **Gráficos** | SVG + Chart.js (opcional) |
| **Datos** | FSTelemetry Named Pipe |

---

## 📊 Mi Contribución al Proyecto

### ✅ Completado

- [x] Dashboard diseño visual completo
- [x] Tachómetro SVG con dinámicas
- [x] Tarjetas de telemetría
- [x] Indicadores de inclinación
- [x] Cálculos de eficiencia
- [x] Estructura de proyecto

### ⏳ En Desarrollo

- [x] Backend Node.js + Socket.io
- [x] Conexión Named Pipe
- [x] Datos en tiempo real

### ❌ Por Hacer (Fase 2)

- [x] Histórico de datos
- [ ] Análisis IA (TensorFlow.js)

---

## 🔧 Configuración

Ver [.env.example](./Dashboard/backend/.env.example) para todas las opciones.

**Puertos por defecto:**

- Backend: `3000`
- Frontend: `8080`

---

## 📈 Rendimiento

- **Actualización:** 60 FPS (16.66ms)
- **Latencia:** ~50ms (WebSocket)
- **Bundle:** ~450KB (con deps)
- **CPU:** <5% (idle mode)

---

## 🐛 Solucionar Problemas

### Dashboard no muestra datos

1. Abre DevTools (F12)
2. Ve a Console
3. Revisa errores de WebSocket

### FSTelemetry no se conecta

1. Confirma mod activo en FS25
2. Verifica Named Pipe: `\\\.\pipe\SHTelemetry`
3. Reinicia el servidor backend

📖 **[Troubleshooting Completo →](./Docs/Setup/TROUBLESHOOTING.md)**

---

## 📝 Licencia

MIT License — Ver LICENSE.md para detalles.

---

## 👤 Autor

Dashboard desarrollado para optimizar análisis de rendimiento en Farming Simulator 25.

---

## 🙋 Soporte

¿Preguntas o sugerencias?

- 📖 Lee la [documentación](./Docs/)
- 🐛 Abre un issue
- 💬 Crea una discusión

---

**Última actualización:** 25 de marzo de 2026  
**Estado:** En desarrollo activo 🚀
