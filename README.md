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
- Python 3.10+ (opcional, para tests de análisis y `analyze_session.py`)
- Farming Simulator 2025
- SHTelemetry + MoreRealistic_FS25 (mods)

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
|---------|-------------|
| [Setup](./Docs/Setup/) | Instalación, backend, WebSocket y tests |
| [Desarrollo](./Docs/Development/) | Tracción, carga de ejes, IA telemetría |
| [Datos de telemetría](./Docs/GUIA_DATOS_TELEMETRIA.md) | Campos JSONL y flujo de grabación |
| [Índice completo](./Docs/README.md) | Todas las guías disponibles |

---

## 🧪 Testing y Validación

Suite automatizada de **58 tests** en 4 módulos. Ejecuta desde la raíz:

```bat
run_tests.bat
```

| Suite | Archivo | Tests | Qué valida |
|-------|---------|-------|------------|
| Backend | `Dashboard/backend/Tests/telemetry.test.js` | 7 | Parseo JSON, EMA de masa, chunks, tracción |
| Frontend | `Tests/frontend_logic.test.js` | 3 | Ángulos de aguja RPM/velocidad, zonas ECO/OPT |
| Telemetría | `Scripts/test_telemetry.js` | 28 | Mapeo de campos, logging JSONL, wheelTraction |
| Análisis | `Scripts/test_analyze_session.py` | 20 | Estadísticas y perfiles de campo |

📖 **[Guía completa de tests →](./Docs/Setup/TESTING.md)**

### Simulador sin juego

```bat
node Tests\mock_telemetry_provider.js
```

Crea la Named Pipe `\\.\pipe\SHTelemetry` y envía telemetría simulada para probar el dashboard sin abrir FS25.

---

## 📂 Estructura del Proyecto

```
TecnicFarming/
├── Dashboard/
│   ├── frontend/              # HTML, CSS, JavaScript
│   │   ├── js/                  # gauge.js, telemetry-client.js, dashboard.js…
│   │   └── sections/            # Fragmentos HTML cargados dinámicamente
│   └── backend/                 # Node.js + Express + Socket.io
│       ├── server.js
│       ├── Tests/               # Tests unitarios del backend
│       └── src/services/        # telemetry.js
├── SHTelemetry/                 # Mod telemetría (Lua → Named Pipe)
├── Scripts/                     # analyze_session.py + tests
├── Tests/                       # Tests frontend + simulador
├── Data/                        # Sesiones JSONL y perfiles de campo
├── Docs/                        # Documentación
├── run_tests.bat                # Suite completa de tests
├── start.bat                    # Arranque rápido (backend + navegador)
└── README.md
```

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
|------|------------|
| **Backend** | Node.js + Express |
| **Real-time** | Socket.io (WebSocket) |
| **Frontend** | HTML5 + CSS3 + Vanilla JS |
| **Gráficos** | SVG + gráficos históricos |
| **Datos** | SHTelemetry → Named Pipe |
| **Análisis** | Python (`analyze_session.py`) |
| **Tests** | Node.js test runner + Python unittest |

---

## 📊 Mi Contribución al Proyecto

### ✅ Completado

- [x] Dashboard diseño visual completo
- [x] Tachómetro SVG con dinámicas
- [x] Tarjetas de telemetría e inclinación de terreno
- [x] Backend Node.js + Socket.io + Named Pipe
- [x] Datos en tiempo real y grabación de sesiones JSONL
- [x] Análisis de sesiones y perfiles de campo (Python)
- [x] Suite de tests automatizada (58 tests)

### ⏳ En Desarrollo

- [ ] Análisis IA avanzado (TensorFlow.js)
- [ ] Optimización de payload (MessagePack)

---

## 🔧 Configuración

Ver [.env.example](./Dashboard/backend/.env.example) para todas las opciones.

**Puerto por defecto:**

- HTTP + WebSocket + frontend estático: `8080`

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

1. Confirma mod **SHTelemetry** activo en FS25
2. Verifica Named Pipe: `\\.\pipe\SHTelemetry`
3. Reinicia el servidor backend
4. Alternativa de prueba: `node Tests\mock_telemetry_provider.js`

📖 **[Guía de tests →](./Docs/Setup/TESTING.md)** · **[Backend →](./Docs/Setup/GUIA_BACKEND.md)**

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

**Última actualización:** 13 de junio de 2026  
**Estado:** En desarrollo activo 🚀
