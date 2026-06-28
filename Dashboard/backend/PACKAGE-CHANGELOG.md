# Registro de dependencias — `package-lock.json`

Historial de revisiones, actualizaciones y compatibilidad del backend Node.js (`fs25-telemetry-backend`).

Archivos relacionados:

- `package.json` — rangos semver declarados
- `package-lock.json` — versiones exactas instaladas (lockfileVersion 3)
- Este archivo — decisiones y cambios documentados con fecha

---

## Estado actual

| Campo                | Valor                  |
|----------------------|------------------------|
| **Última revisión**  | 2026-06-13             |
| **Node.js probado**  | v22.17.0               |
| **npm**              | 10.9.2                 |
| **Paquetes totales** | 120 (92 prod + 29 dev) |
| **Vulnerabilidades** | 0 (`npm audit`)        |
| **Tests backend**    | 7/7 OK (`npm test`)    |

### Dependencias directas (instaladas)

| Paquete         | Rango en `package.json` | Versión en lock | Última en npm | Estado                                 |
|-----------------|-------------------------|-----------------|---------------|----------------------------------------|
| `express`       | `^4.22.2`               | 4.22.2          | 5.2.1         | ✅ Última 4.x — no migrar a 5.x aún   |
| `socket.io`     | `^4.8.3`                | 4.8.3           | 4.8.3         | ✅ Al día                             |
| `dotenv`        | `^16.6.1`               | 16.6.1          | 17.4.2        | ✅ Última 16.x — no migrar a 17.x aún |
| `nodemon` (dev) | `^3.1.14`               | 3.1.14          | 3.1.14        | ✅ Al día                             |

### Dependencias transitivas relevantes (post-audit)

| Paquete | Versión anterior | Versión actual | Motivo |
|---------|------------------|----------------|--------|
| `ws` | 8.20.1 | **8.21.0** | Parche seguridad GHSA-96hv-2xvq-fx4p |
| `engine.io` | 6.6.8 | **6.6.9** | Actualización vía `npm audit fix` |
| `socket.io-adapter` | 2.5.7 | **2.5.8** | Actualización vía `npm audit fix` |

---

## 2026-06-13 — Revisión de compatibilidad y parche de seguridad

### Hallazgos

1. **`package-lock.json` desincronizado** — El bloque raíz del lockfile listaba rangos antiguos (`express ^4.18.2`, `socket.io ^4.7.2`, `dotenv ^16.3.1`) mientras `package.json` ya declaraba versiones más recientes. Resuelto con `npm install`.
2. **3 vulnerabilidades HIGH** en `ws` 8.20.1 (transitiva de `socket.io` → `engine.io` / `socket.io-adapter`):
   - **GHSA-96hv-2xvq-fx4p** — DoS por agotamiento de memoria con fragmentos pequeños
   - Rango afectado: `ws >=8.0.0 <8.21.0`
3. **Actualizaciones major disponibles** (no aplicadas):
   - `express` 4.22.2 → **5.2.1** — cambios breaking (routing, middleware, `path-to-regexp`)
   - `dotenv` 16.6.1 → **17.4.2** — revisar changelog antes de migrar

### Acciones aplicadas

```bat
cd Dashboard\backend
npm audit fix      # ws 8.21.0, engine.io 6.6.9, socket.io-adapter 2.5.8
npm install        # Sincronizar lockfile con package.json
npm audit          # 0 vulnerabilidades
npm test           # 7 tests OK
```

### Compatibilidad verificada

| Área | Resultado |
|------|-----------|
| ES Modules (`"type": "module"`) | ✅ Sin cambios necesarios |
| `express.static` + `express.json` | ✅ API estable en 4.22.x |
| `socket.io` namespace `/telemetry` | ✅ Sin cambios de API en 4.8.3 |
| `dotenv.config()` | ✅ Compatible con 16.6.1 |
| `TelemetryService` (Named Pipe) | ✅ Solo APIs nativas de Node (`net`, `fs`) |
| Node test runner (`node --test`) | ✅ 7 tests pasan |

### Recomendaciones (sin aplicar)

| Actualización | Riesgo | Cuándo considerarla |
|---------------|--------|---------------------|
| **Express 5.x** | Alto — breaking changes en routing y middleware | Tras revisar [guía de migración Express 5](https://expressjs.com/en/guide/migrating-5.html) y probar todas las rutas `/api/*` |
| **dotenv 17.x** | Medio — posibles cambios en carga de `.env` | Si se necesitan nuevas opciones; probar arranque con `.env.example` |
| **socket.io 5.x** | Alto — no existe aún en línea estable; mantener 4.8.3 | Cuando salga versión estable y documentada |

### Node.js — requisito mínimo

| Versión | Soporte |
|---------|---------|
| Node.js **16+** | Mínimo documentado en README |
| Node.js **18 LTS** | Recomendado para producción |
| Node.js **20/22** | ✅ Probado en esta revisión |

---

## Cómo repetir esta revisión

```bat
cd Dashboard\backend
node --version
npm outdated
npm audit
npm test
```

Si `npm audit` reporta vulnerabilidades con `fix available`:

```bat
npm audit fix
npm test
```

Documentar aquí la fecha, paquetes cambiados y resultado de tests.

---

## Plantilla para entradas futuras

```markdown
## YYYY-MM-DD — Título breve

### Cambios
- paquete: versión_anterior → versión_nueva (motivo)

### Verificación
- [ ] npm audit — 0 vulnerabilidades
- [ ] npm test — X/X OK
- [ ] Arranque manual (`npm start`) — OK

### Notas de compatibilidad
- ...
```

---

**Mantenido junto a:** `package.json`, `package-lock.json`  
**Última actualización de este registro:** 2026-06-13
