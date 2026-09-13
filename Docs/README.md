# 📚 Documentación - Dashboard Farming Simulator 25

Índice central del proyecto. Cada guía tiene un propósito único — evita duplicar tablas de tests o
checklists aquí; enlaza a la fuente canónica.

## 🚀 Comenzar Rápido

1. **[INSTALACIÓN](./Setup/INSTALACION.md)** — Dependencias y primer arranque
2. **[GUIA_BACKEND.md](./Setup/GUIA_BACKEND.md)** — `.env`, logs, monitoreo
3. **[WEBSOCKET_INFO.md](./Setup/WEBSOCKET_INFO.md)** — Eventos Socket.io y campos emitidos
4. **[TESTING.md](./Setup/TESTING.md)** — Suite de tests (43 tests, 3 suites)

## 📖 Por Área

### Setup

| Documento                                      | Contenido                                |
| ---------------------------------------------- | ---------------------------------------- |
| [INSTALACION.md](./Setup/INSTALACION.md)       | Instalación paso a paso                  |
| [GUIA_BACKEND.md](./Setup/GUIA_BACKEND.md)     | Backend Node.js                          |
| [WEBSOCKET_INFO.md](./Setup/WEBSOCKET_INFO.md) | Contrato WebSocket (payload del backend) |
| [TESTING.md](./Setup/TESTING.md)               | Tests y simulador sin juego              |

### Datos y análisis

| Documento                                                    | Contenido                         |
| ------------------------------------------------------------ | --------------------------------- |
| [GUIA_DATOS_TELEMETRIA.md](./GUIA_DATOS_TELEMETRIA.md)       | Campos JSONL y flujo de grabación |
| [GUIA_RENDIMIENTO_COSECHA.md](./GUIA_RENDIMIENTO_COSECHA.md) | Optimización en cosecha           |

### Desarrollo

| Documento                                                                  | Contenido                 |
| -------------------------------------------------------------------------- | ------------------------- |
| [TRACCION_RUEDAS.md](./Development/TRACCION_RUEDAS.md)                     | Tracción y slip por rueda |
| [CARGA_EJES_CALCULO.md](./Development/CARGA_EJES_CALCULO.md)               | Carga de ejes y masa      |
| [IA_TELEMETRIA_INTELIGENTE.md](./Development/IA_TELEMETRIA_INTELIGENTE.md) | Análisis IA               |

### Raíz del proyecto

| Documento                                                         | Contenido              |
| ----------------------------------------------------------------- | ---------------------- |
| [README.md](../README.md)                                         | Visión general         |
| [ESTRUCTURA_PROYECTO.md](../ESTRUCTURA_PROYECTO.md)               | Árbol de carpetas      |
| [SISTEMA_COMPLETO_CHECKLIST.md](../SISTEMA_COMPLETO_CHECKLIST.md) | Checklist validación   |
| [HERRAMIENTAS_RECOMENDADAS.md](../HERRAMIENTAS_RECOMENDADAS.md)   | Stack y librerías      |

## 🧪 Validar cambios

```bat
run_tests.bat
```

Detalle de suites y comandos: **[TESTING.md](./Setup/TESTING.md)**.

---

**Última actualización:** 13 de septiembre de 2026
