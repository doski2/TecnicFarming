# 📚 Documentación - Dashboard Farming Simulator 25

Bienvenido a la documentación del proyecto Dashboard FS25.

## 🚀 Comenzar Rápido

1. **[INSTALACIÓN](./Setup/INSTALACION.md)** — Instalar dependencias y arrancar el dashboard
2. **[GUIA_BACKEND.md](./Setup/GUIA_BACKEND.md)** — Configuración y uso del backend
3. **[WEBSOCKET_INFO.md](./Setup/WEBSOCKET_INFO.md)** — API WebSocket y contrato de datos
4. **[TESTING.md](./Setup/TESTING.md)** — Suite de tests (58 tests en 4 módulos)

## 📖 Documentación por Área

### Setup

| Documento | Contenido |
|-----------|-----------|
| [INSTALACION.md](./Setup/INSTALACION.md) | Instalación paso a paso |
| [GUIA_BACKEND.md](./Setup/GUIA_BACKEND.md) | Backend Node.js, `.env`, logs |
| [WEBSOCKET_INFO.md](./Setup/WEBSOCKET_INFO.md) | Eventos Socket.io y campos de telemetría |
| [TESTING.md](./Setup/TESTING.md) | Tests automatizados y simulador sin juego |

### Datos y análisis

| Documento | Contenido |
|-----------|-----------|
| [GUIA_DATOS_TELEMETRIA.md](./GUIA_DATOS_TELEMETRIA.md) | Campos JSONL, flujo de grabación |
| [GUIA_RENDIMIENTO_COSECHA.md](./GUIA_RENDIMIENTO_COSECHA.md) | Optimización en cosecha |

### Desarrollo

| Documento | Contenido |
|-----------|-----------|
| [TRACCION_RUEDAS.md](./Development/TRACCION_RUEDAS.md) | Tracción y slip por rueda |
| [CARGA_EJES_CALCULO.md](./Development/CARGA_EJES_CALCULO.md) | Carga de ejes y masa |
| [IA_TELEMETRIA_INTELIGENTE.md](./Development/IA_TELEMETRIA_INTELIGENTE.md) | Análisis inteligente de telemetría |

### Raíz del proyecto

| Documento | Contenido |
|-----------|-----------|
| [README.md](../README.md) | Visión general del proyecto |
| [ESTRUCTURA_PROYECTO.md](../ESTRUCTURA_PROYECTO.md) | Árbol de carpetas y flujos |
| [SISTEMA_COMPLETO_CHECKLIST.md](../SISTEMA_COMPLETO_CHECKLIST.md) | Checklist de validación |
| [HERRAMIENTAS_RECOMENDADAS.md](../HERRAMIENTAS_RECOMENDADAS.md) | Stack y librerías |

## 🧪 Validar cambios

```bat
run_tests.bat
```

Ejecuta backend (7), frontend (3), telemetría (28) y análisis Python (20).

## 📞 Soporte

Si encuentras problemas:

1. Ejecuta `run_tests.bat` para descartar regresiones en código
2. Revisa los logs en `Dashboard/backend/logs/`
3. Abre DevTools (F12) y consulta la consola del navegador

---

**Última actualización:** 13 de junio de 2026
