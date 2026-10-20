# Análisis del proyecto: fallos, duplicados y mejoras

Fecha del análisis: 2026-10-20 · Rama `main` (commit `d2ee0a7`)

Alcance: mod Lua (`SHTelemetry/`), backend Node (`Dashboard/backend/`), frontend (`Dashboard/frontend/`),
scripts Python (`Scripts/`), tests, `.bat` y estructura del repo.

## Estado actual (actualizado 2026-10-20)

- **Corregidos B1–B11**, B12a y B12n, más la limpieza (§3, §4), la seguridad local (§5) y parte del rendimiento (§6).
- Tests: backend 28/28, frontend 10/10, Python 23/23 (al analizar eran 23, 9 y 20). Cada corrección de datos lleva su test, salvo B2, B6 y B7 (Lua y endpoint sin cobertura automática).
- **Verificado por el usuario** con el simulador: arranque, pestañas, indicador de grabación y reconexión. **Pendiente de verificar con FS25 real:** grabación durante el trabajo (contador a 1/s, parada al bajarse del tractor, análisis del perfil) y la reconexión del mod Lua.
- Los cambios **no están commiteados** (ver `git status`).
- Su `.env` local sigue con `UPDATE_FREQUENCY_MS=16.66`; cambiar a `33` para emitir a ~30 Hz.
- Quedan abiertos: B12b–B12m (excepto B12a y B12n), D1–D12, §7 (mejoras funcionales) y los pendientes de §5 y §6.

Leyenda: 🔴 alta (datos incorrectos / pérdida de datos) · 🟠 media · 🟡 baja · ✅ CORREGIDO = ya aplicado y probado. El texto de cada fallo describe el estado **antes** de corregirlo.

---

## 1. Fallos (bugs)

### 🔴 B1 — ✅ CORREGIDO — Al salir del vehículo se siguen grabando muestras con datos obsoletos

- Lua envía `isInVehicle = false` al bajarse ([SHTelemetry.lua:460](../../SHTelemetry/SHTelemetry.lua#L460)) y omite el resto de campos.
- El backend **nunca lee `isInVehicle`** ([telemetry.js:276](../../Dashboard/backend/src/services/telemetry.js#L276)): `parseData` solo actualiza campos presentes, así que `rpm`, `speed`, `implementLowered`, `workType`… quedan congelados.
- `_logSample` ([telemetry.js:377](../../Dashboard/backend/src/services/telemetry.js#L377)) sigue grabando 1 muestra/s con esos valores mientras `implementLowered && speed > 0.3`. Ensucia los `.jsonl` y los promedios de `campo_profiles.json`.
- **Arreglo:** mapear `isInVehicle` en `parseData`; si es `false`, resetear `currentData` (o al menos `speed`, `rpm`, `implement*`) y no grabar.

### 🔴 B2 — ✅ CORREGIDO — "Analizar" un archivo concreto analiza la sesión activa

- [server.js:190](../../Dashboard/backend/server.js#L190): `targetFile = telemetryService._sessionFile` tiene prioridad sobre `?file=`.
- `_sessionFile` se fija en la primera grabación y no se limpia, así que tras grabar una vez, pulsar "▶ Analizar" en cualquier otro archivo de la lista devuelve siempre el archivo activo.
- **Arreglo:** si viene `?file=` válido, usarlo; solo caer a `_sessionFile` si no hay parámetro.

### 🔴 B3 — ✅ CORREGIDO — El perfil de campo se "congela" con datos parciales y puede borrarse entero

En [analyze_session.py](../../Scripts/analyze_session.py):

- Deduplica por nombre de archivo (`analyzed_files`). El archivo se nombra `fecha_vehículo_workType`, y se sigue escribiendo todo el día. Si se analiza a mitad de sesión, el archivo queda marcado como procesado y las muestras posteriores **nunca** entran en el perfil.
- Si `campo_profiles.json` está corrupto o se lee durante una escritura, `except JSONDecodeError: profiles = {}` y se **sobrescribe todo el historial** con un solo perfil.
- La escritura no es atómica ni hay bloqueo (dos análisis simultáneos pueden pisarse).
- `GET /api/analyze` tiene efecto secundario (escribe el perfil): un GET no debería mutar estado. **(Pendiente: sigue siendo GET.)**
- **Arreglo:** guardar `(archivo, nº de muestras)` y sumar solo el delta; escribir a `.tmp` + `os.replace`; si el JSON está corrupto, renombrarlo a `.bak` en vez de descartarlo; mover el guardado a un `POST`.

### 🟠 B4 — ✅ CORREGIDO — Contador de muestras de la UI cuenta frames, no muestras

- `window._iaSampleCount++` se ejecuta en `updateIATab` ([dashboard.js:677](../../Dashboard/frontend/js/dashboard.js#L677)), que corre a ~60 Hz, pero el backend graba **1 muestra/s**.
- Resultado: "100 muestras" se alcanza en ~1,7 s y el botón Analizar se habilita antes de tiempo; el texto "(~X min)" también es incorrecto. Solo cuenta cuando la pestaña Campo·IA está visible.
- **Arreglo:** que el backend publique el nº real de muestras de la sesión (en el payload o en `/api/telemetry/status`) y la UI solo lo muestre.

### 🟠 B5 — ✅ CORREGIDO — `dashboard-terrain.js` convierte pitch/roll de radianes a grados, pero ya llegan en grados

- Lua envía `math.deg(...)` ([SHTelemetry_Extensions.lua:64](../../SHTelemetry/SHTelemetry_Extensions.lua#L64)). [dashboard-terrain.js:11](../../Dashboard/frontend/js/modules/dashboard-terrain.js#L11) multiplica por 57,2958 otra vez.
- Además escribe en los mismos elementos (`angle-pitch`, `angle-roll`) que `updateRightColumn`, cada 100 ms, **machacando** el valor correcto (parpadeo/valores ×57).
- `tractor-rear-group`, `angle-pitch-bar` y `angle-roll-bar` **no existen** en el HTML → el resto del módulo es código muerto.
- **Arreglo:** eliminar el módulo y su registro en `section-loader.js` y `Dashboard.initializeModules`.

### 🟠 B6 — ✅ CORREGIDO — El Lua no se reconecta si el backend se reinicia

- [SHTelemetry.lua:469](../../SHTelemetry/SHTelemetry.lua#L469): la escritura al pipe va en `pcall`, el error se ignora y `shfile` nunca se pone a `nil`. Si el backend cae o se reinicia, el mod sigue "escribiendo" a un pipe muerto para siempre (hasta reiniciar el juego).
- Comentario dice "reconectar cada 300 ciclos (~3 s)", pero a 33 ms por ciclo son ~10 s; y `updateCount` se incrementa solo si no hay conexión.
- **Arreglo:** si `write` falla, cerrar `shfile` y ponerlo a `nil` para que `initPipe` reintente.

### 🟠 B7 — ✅ CORREGIDO — Posible error en Lua si el vehículo no tiene diésel

- [SHTelemetry.lua:108](../../SHTelemetry/SHTelemetry.lua#L108) `getVehicleFuelLevelAndCapacity` llama a `getFillUnitFillLevel(nil)` si `getConsumerFillUnitIndex(DIESEL)` no devuelve índice (eléctricos, remolques con motor, mods). `buildTelemetry` no va envuelto en `pcall` desde `update`, así que se rompe todo el frame de telemetría.
- También `motorFan.enabled` y `motorTemperature.value` ([líneas 384-385](../../SHTelemetry/SHTelemetry.lua#L384)) asumen que existen.
- **Arreglo:** proteger con `nil`-checks y/o `pcall` alrededor de `buildTelemetry` en `update`.

### 🟠 B8 — ✅ CORREGIDO — La UI de "GRABANDO" no coincide con el backend

- [telemetry-ui.js:13](../../Dashboard/frontend/js/modules/telemetry-ui.js#L13) `isRecording` = `implementLowered && |speed| > 0.3`.
- El backend además exige `isRealData && telemetrySource !== 'mock'` ([telemetry.js:212](../../Dashboard/backend/src/services/telemetry.js#L212)). Con el simulador, la UI muestra "● GRABANDO" y no se graba nada.
- **Arreglo:** el backend envía `isRecording` ya calculado (única fuente de verdad) y la UI lo muestra.

### 🟠 B9 — ✅ CORREGIDO — El cliente WebSocket deja de reconectar tras 10 intentos

- [telemetry-client.js:23](../../Dashboard/frontend/js/telemetry-client.js#L23) `reconnectionAttempts: 10` (~100 s). Si el backend se reinicia más tarde, hay que recargar la página.
- **Arreglo:** `reconnectionAttempts: Infinity` (con `reconnectionDelayMax` ya presente).

### 🟡 B10 — ✅ CORREGIDO — Combustible vacío se muestra como 100 %

- [dashboard.js:263](../../Dashboard/frontend/js/dashboard.js#L263) `Math.round(data.fuelPercentage || 100)`: con 0 % sale 100 %. Igual con `motorTemperature || 20`. Backend: `fuelLevel ?? 100`.
- **Arreglo:** usar `??` o comprobar `!== undefined`.

### 🟡 B11 — ✅ CORREGIDO — Un único `try/catch` aborta todo el repintado

- `updateTelemetry` ejecuta 10 `update*` seguidos en un `try` ([dashboard.js:21](../../Dashboard/frontend/js/dashboard.js#L21)). Un fallo (p. ej. `statusLoadEl.firstChild` nulo, línea 243) deja sin actualizar todo lo que va después, en cada frame.
- **Arreglo:** envolver cada `update*` por separado (helper `safe(fn)`).

### 🟡 B12 — Otros menores

| ID | Dónde | Problema |
| --- | --- | --- |
| B12a (corregido) | [server.js:114](../../Dashboard/backend/server.js#L114) | `LOG_EVERY` usa `|| 50` mientras el resto usa `16.66` → frecuencia de log incoherente. |
| B12b | [server.js:142](../../Dashboard/backend/server.js#L142) | Acepta campo `0`..`99` pero el logger trata `0` como "sin campo" (`> 0`). La UI solo ofrece 1..38 ([section-loader.js:85](../../Dashboard/frontend/js/section-loader.js#L85)). |
| B12c | backend/frontend | Al recargar la página el selector de campo vuelve a "vacío" (`-1`) pero el backend conserva `_activeCampo` → se graba en un campo que la UI no muestra. |
| B12d | [telemetry.js:303](../../Dashboard/backend/src/services/telemetry.js#L303) | `tractorDamage`: valor exactamente `1` se interpreta como 1 % y no 100 % (la heurística `>0 && <1`). |
| B12e | [telemetry.js:138](../../Dashboard/backend/src/services/telemetry.js#L138) | `chunk.toString()` puede partir caracteres UTF-8 multibyte; usar `StringDecoder`/`setEncoding('utf8')`. El `buffer` no tiene tope si nunca llega `\n`. |
| B12f | [telemetry.js:146](../../Dashboard/backend/src/services/telemetry.js#L146) | Sin handler de `'close'`; con dos clientes simultáneos `currentClient` se pisa y un `end` viejo puede marcar desconectado al nuevo. |
| B12g | [telemetry.js:397](../../Dashboard/backend/src/services/telemetry.js#L397) | `_lastLogMs` es global: al cambiar de archivo/campo se pierde hasta 1 s de muestra. |
| B12h | [ia-analysis.js:34](../../Dashboard/frontend/js/modules/ia-analysis.js#L34) | "~muestras" se estima como `size/120`, pero cada línea JSONL pesa ~350-450 bytes → el número mostrado es ~3× el real. Devolver `lines` real desde el servidor. |
| B12i | [ia-analysis.js:41](../../Dashboard/frontend/js/modules/ia-analysis.js#L41) | `innerHTML` + `onclick` inline con nombres de archivo. Hoy los nombres están limitados por regex, pero conviene usar DOM API + `addEventListener`. |
| B12j | [dashboard.js:567](../../Dashboard/frontend/js/dashboard.js#L567) | Los comentarios dicen "60 %" y "75 %" del rango pero el código usa 0.40 y 0.70. |
| B12k | [analyze_session.py](../../Scripts/analyze_session.py) | `avg_slip`/`peak_slip` solo usan `wheelSlipRL` (ignora RR). `duration_min = n/60` asume exactamente 1 muestra/s. `wmean` trata `None` previo como 0 (sesga el promedio). |
| B12l (parcial: timeout aplicado) | [server.js](../../Dashboard/backend/server.js) | `spawn('python')` sin alternativa `py`/`python3`; en Windows sin Python en PATH falla con mensaje poco claro. |
| B12n (corregido) | [Scripts/test_analyze_session.py](../../Scripts/test_analyze_session.py) | Los tests de Python escriben en el `Data/campo_profiles.json` **real** (añaden entradas `tmp*.jsonl`). Usar un `profiles_path` temporal. |
| B12m (parcial) | [SHTelemetry.lua](../../SHTelemetry/SHTelemetry.lua) | `pluginVersion` ya es 2.2; `modDesc.xml` sigue en `1.0.0.0`. |

---

## 2. Funciones y lógica duplicadas

| ID | Duplicado | Ubicaciones | Propuesta |
| --- | --- | --- | --- |
| D1 | Cálculo de velocidad + marcha atrás | [SHTelemetry.lua:314-337](../../SHTelemetry/SHTelemetry.lua#L314) y [391-408](../../SHTelemetry/SHTelemetry.lua#L391) | Extraer `computeSpeed(vehicle)` y `computeAccelerator(...)`. |
| D2 | Captura de implemento vs. fallback de cosechadora | `captureImplData` y bloque `attachedCutters` ([Extensions.lua:130 y 252](../../SHTelemetry/SHTelemetry_Extensions.lua#L130)) | Reutilizar `captureImplData(cutter)`. |
| D3 | Lógica de zonas ECO/ÓPTIMA | Lua `targetRpm` ([SHTelemetry.lua:250](../../SHTelemetry/SHTelemetry.lua#L250)), `updateEfficiencyZones`, `updateGearAdvice` (dashboard.js) y umbrales de `analyze_session.py` | Una sola definición (backend) y exponerla en el payload. `targetRpm` hoy **no lo usa nadie** (el backend no lo lee). |
| D4 | Badge GRABANDO / SUBIDA-BAJADA / TRABAJANDO / contador de muestras | `updateConnectionBadge`, `updateIATab`, `updateTrabajoView` | Helper `renderWorkStatus(prefix, data)` o clases por `data-bind`. |
| D5 | `slipPercent` / `isRecording` calculados 3-4 veces por frame | `dashboard.js` + `telemetry-ui.js` + `computeMrAvgDrivenWheelsSlip` (backend) + `wheelSlipRL/RR` (logger) | Calcular una vez en backend (`slipRearPct`, `isRecording`) y consumirlo. La heurística `abs(raw) <= 1 ? 100 : 1` del frontend no existe en el backend → pueden divergir. |
| D6 | Potencia kW/CV | `updateLeftColumn` (frontend) recalcula `powerKW`/`powerHP`, que el backend ya envía | Usar el valor del payload. |
| D7 | Alias de campos | `toClientPayload` duplica `rpm/engineSpeed`, `torque/motorTorque`, `engineLoad/motorLoad`, etc. y el frontend usa `data.engineSpeed || data.rpm` en varios sitios | Elegir un solo nombre y migrar. |
| D8 | `HARVESTING` y `HARVESTER` | [work-types.js:6-7](../../Dashboard/frontend/js/modules/work-types.js#L6), test, comentarios | `HARVESTING` es legado; migrar nombres de archivos/claves antiguos y eliminarlo. |
| D9 | Validación `^(campo_\d{1,2}\|sin_campo)$` y `[\w\-. ]+\.jsonl` | 3 veces en `server.js` | Funciones `isValidSessionDir/File`. |
| D10 | Construcción de rutas de sesión | `server.js` (`DATA_DIR_API`) y `telemetry.js` (`DATA_DIR`) | Módulo `paths.js` único. |
| D11 (parcial) | Tests redundantes | `Scripts/test_live_pipeline.js` (manual); `test_telemetry.js` ya borrado; `Tests/` raíz y `Dashboard/backend/Tests/` | Dejar una sola carpeta de tests; borrar el script deprecado. |
| D12 | Documentación solapada | `README.md`, `ESTRUCTURA_PROYECTO.md`, `SISTEMA_COMPLETO_CHECKLIST.md`, `Docs/README.md`, `Dashboard/frontend/README.md`, `SHTelemetry/README.md` (≈3.100 líneas en total) | Revisar contradicciones y dejar un índice único (pendiente de verificación línea a línea). |

---

## 3. Código muerto / residuos

> **Limpieza aplicada (2026-10-20):** `Scripts/test_telemetry.js`, bloque "CÓMO USAR" del Lua, `handleNavClick`, reglas `rr-*`, variables sin uso de `.env.example`, `pluginVersion` 2.2, `.pyc` desversionados y `.gitignore` actualizado, `engines` Node ≥21 y script de test con glob entre comillas. **Se mantienen** (decisión pendiente): `discoverAvailableSpecs` (herramienta de depuración), `vehicleComponents` en el Lua, `Dashboard/start_dashboard.*`, `fix_markdownlint.py` en la raíz, `Data/campo_profiles.json` versionado.

- `discoverAvailableSpecs` y el bloque "CÓMO USAR ESTE ARCHIVO" ([Extensions.lua:13, 624](../../SHTelemetry/SHTelemetry_Extensions.lua#L624)) están obsoletos (los carga `modDesc` con `extraSourceFiles`).
- `vehicleComponents` (posición, velocidades y quaternions de cada componente a ~30 Hz, [SHTelemetry.lua:423](../../SHTelemetry/SHTelemetry.lua#L423)): el backend **no lo usa** y engorda el JSON de cada tick. También `money`, `mapTitle`, etc. Mantener solo si SimHub lo necesita.
- `UIUpdater.handleNavClick` (solo `console.log`), `setTheme` (solo 3 variables, sin CSS de tema claro), listener de `resize` con altura fijada a mano.
- Reglas `rr-soft/rr-field/rr-soggy` y `trackEl.className` en `updateWheelTraction`.
- `Dashboard/start_dashboard.bat` y `.ps1` (solo redirigen a `start.bat`).
- `iconFilename simhub.dds` en `modDesc.xml`: el archivo está en `.gitignore` (`*.dds`) y no existe en el repo.

## 4. Higiene del repositorio

> **Aplicado:** `.pyc` fuera del índice y `.gitignore`, `.env.example` depurado, `engines` Node ≥21 con glob entre comillas. **Pendiente:** mover `fix_markdownlint.py`, decidir si `campo_profiles.json` se versiona, `LICENSE` y `package.json` raíz.

- (Resuelto) `__pycache__/*.pyc` y `Scripts/__pycache__/*.pyc` estaban versionados y `.gitignore` no ignora `__pycache__/` ni `*.pyc`. Añadirlo y `git rm --cached`.
- `fix_markdownlint.py` (1.079 líneas, con cambios sin commitear) en la raíz: herramienta de desarrollo; mover a `Scripts/tools/` o a un directorio aparte.
- `Data/campo_profiles.json` está versionado pero son datos locales de partida (mientras `Data/sessions/` está ignorado). Decidir criterio.
- (Resuelto) `Dashboard/backend/.env.example` definía variables que el código no lee (`LOG_LEVEL`, `LOG_FILE`, `LOG_MAX_*`, `DEBUG_MODE`, `NAMED_PIPE_TIMEOUT/ENCODING`, `SOCKET_IO_PATH`).
- (Resuelto) `package.json`: `engines.node >=16` pero `node --test` requiere ≥18; el script `Tests/**/*.test.js` depende del shell/versión para expandir el glob (en Node 22 funciona). Subir `engines` a `>=20` y usar `node --test Tests/`.
- Faltan `LICENSE` (package.json dice MIT) y `package.json` en la raíz para comandos únicos.

## 5. Seguridad / robustez

> **Aplicado (acceso solo local):** el servidor escucha en `127.0.0.1` (variable `HOST` para cambiarlo), CORS por defecto limitado a `http://localhost:<puerto>`, `express.json` limitado a 10 kb, frecuencia de emisión por defecto 33 ms (~30 Hz, igual que el mod Lua). También aplicado: logger por stream (no bloquea), `/api/analyze` con un solo análisis a la vez (429) y timeout de 20 s, y métodos públicos `setActiveCampo/getSessionFile/releaseSessionFile`. Pendiente: `uncaughtException` solo registra y continúa.

- (Resuelto) 🟠 El servidor escuchaba en `0.0.0.0` con `CORS_ORIGIN='*'` por defecto y sin autenticación; cualquier equipo de la LAN puede llamar a `DELETE /api/session/file` o `POST /api/session/campo`. Escuchar en `127.0.0.1` por defecto (opción para LAN) y fijar CORS al origen propio.
- (Resuelto) 🟡 `express.json()` sin límite de tamaño explícito, sin rate limit en `/api/analyze` (lanza un proceso Python por petición).
- (Resuelto, salvo rotación) 🟡 `logger` usaba `appendFileSync` en cada línea (bloquea el event loop); sin rotación más allá de `debug.prev.log`.
- (Resuelto) 🟡 `server.js` accedía a campos "privados" del servicio (`_activeCampo`, `_sessionFile`): exponer `setActiveCampo()`/`getSessionFile()`.
- 🟡 `uncaughtException` solo registra y continúa: puede dejar el servicio en estado inconsistente.

## 6. Rendimiento

> **Aplicado:** `updateTelemetry` solo repinta la pestaña visible (el dinamómetro sigue acumulando curvas), `UIUpdater` a 4 Hz, `DynoChart.render` a ~10 Hz, y se eliminó `raw: data` del cliente. **Pendiente:** `GaugeAnimator.maxRPM` fijo en 8000 (depende de las marcas del SVG) y jitter aleatorio de la aguja, tope de `localStorage` del dinamómetro, bucles `requestAnimationFrame` de los relojes con la pestaña oculta.

- (Resuelto) El backend emitía a ~60 Hz (`16.66 ms`) por Socket.IO con payload completo (≈ 60 campos + 4 ruedas) y `raw: data` duplica el objeto en cada mensaje del cliente. El mod Lua solo produce ~30 Hz → la mitad de emisiones repiten datos. Recomendado: emitir a 20-30 Hz, o solo cuando cambie `timestamp` del pipe.
- (Resuelto) `Dashboard.updateTelemetry` actualizaba ~150 elementos por mensaje y también las pestañas ocultas (solo `updateIATab` lo comprueba). Saltar `updateRightColumn/updateWheelTraction/DynoChart` si la pestaña no está visible.
- Tres bucles `requestAnimationFrame` permanentes (gauge RPM, gauge velocidad, `UIUpdater`); `UIUpdater.updateCardGlows` reescribe estilos de varias tarjetas en cada frame y entra en conflicto con los `mouseenter/mouseleave` (que fijan `boxShadow`).
- (Resuelto: ahora ~10 Hz) `DynoChart.render` reordenaba las claves y reconstruye los arrays de uPlot en cada render (60 Hz). Basta con refrescar curvas a 2-5 Hz y mover solo la superposición en vivo.
- `localStorage` de curvas del dinamómetro crece sin límite por vehículo.
- `GaugeAnimator.maxRPM = 8000` fijo: un tractor de 2.200 rpm solo ocupa ~27 % del dial; usar `data.maxRpm`. Además añade jitter aleatorio a la aguja.

## 7. Mejoras funcionales propuestas

1. **Detección automática de campo** (`pendiente.txt` #1): el Lua ya envía `vehiclePositionX/Z`. Consultar `g_farmlandManager:getFarmlandIdAtWorldPosition(x, z)` en Lua (o mapear en backend) y enviar `farmlandId`; el backend lo usa como `_activeCampo` por defecto, con el selector manual como override.
2. **Promedio automático al cerrar sesión** (`pendiente.txt` #2): hoy el perfil solo se actualiza al pulsar Analizar (ver B3). Hacer que el backend dispare el análisis al cerrar un archivo (cambio de campo/vehículo, desconexión, salir del vehículo) y sume el delta.
3. **Indicador de calidad de datos:** avisar en la UI cuando MoreRealistic no está presente (sin `longSlip`/`tireLoadKN`, el patinaje siempre es 0 y el análisis de patinaje es inútil).
4. **`torquePercent` por rueda no es medido:** es la carga global del motor redistribuida por peso ([Extensions.lua:442, 567](../../SHTelemetry/SHTelemetry_Extensions.lua#L442)). Etiquetarlo como "reparto estimado" en la UI y docs.
5. **`mrLastLongSlip` se guarda con `math.abs`**: se pierde el signo (patinaje vs. bloqueo de freno). Enviar también el valor con signo.
6. **Esquema versionado del payload** (`schemaVersion`) y un contrato documentado (JSON Schema) compartido por Lua, backend, mock y tests.
7. **Tests que faltan:** `isInVehicle`, `server.js` (endpoints con `supertest`/`fetch`), borrado/validación de rutas, dedupe del perfil con archivo creciente, JSON corrupto en `campo_profiles.json`, reconexión del cliente. El tests de UI no ejecutan `Dashboard`.
8. **Linting/CI:** ESLint + Prettier (JS), `ruff` (Python), `luacheck` (Lua) y un workflow de GitHub Actions que ejecute `run_tests.bat` equivalente en Linux.
9. **Idea de tu nota en `datos conjuntos tsw-tsc.txt`:** reutilizar los perfiles ya mapeados de TSW (`class323.tswprofile`) en TSC. Es un proyecto distinto (Train Sim); si se retoma, documentarlo en su propio archivo y no mezclarlo con TecnicFarming.

---

## 8. Plan de trabajo sugerido

Estado: fases 1 y 2 (excepto D4–D7) hechas; fase 3 casi completa; fase 4 en su mayor parte; fases 5 y 6 sin empezar.

| Fase | Contenido | Esfuerzo |
| --- | --- | --- |
| 1. Datos correctos | B1, B2, B3, B6, B7 | medio |
| 2. UI coherente | B4, B5, B8, B9, B10, B11, D4-D7 | medio |
| 3. Higiene | Sección 4, D8-D11, código muerto (§3) | bajo |
| 4. Seguridad y rendimiento | §5, §6 | medio |
| 5. Funcionalidad | §7.1, §7.2, §7.3 | alto |
| 6. Calidad | §7.7, §7.8, D12 | medio |

Siguiente paso recomendado: verificar la grabación con FS25 real, commitear por temas y seguir con D4–D7 (duplicados del frontend) y §7.1/§7.2 (campo automático y promedio al cerrar sesión).

## 9. Preguntas abiertas

- ¿Se usa `vehicleComponents` o algún otro dato "extra" desde SimHub? Si no, se puede quitar del mod.
- ¿`Data/campo_profiles.json` debe versionarse o es solo local?
- ~~¿Acceso desde otros equipos?~~ Decidido: solo local.
- ¿Se mantiene compatibilidad sin MoreRealistic o el proyecto lo da por obligatorio?
