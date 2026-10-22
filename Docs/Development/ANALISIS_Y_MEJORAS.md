# Análisis del proyecto: fallos, duplicados y mejoras

Fecha del análisis: 2026-10-20 · Rama `main` (commit `d2ee0a7`). **Revisión 2026-10-22** sobre `fe04116`: ver §10 (hallazgos nuevos N1–N16).

Alcance: mod Lua (`SHTelemetry/`), backend Node (`Dashboard/backend/`), frontend (`Dashboard/frontend/`),
scripts Python (`Scripts/`), tests, `.bat` y estructura del repo.

## Estado actual (actualizado 2026-10-22)

- **Corregidos B1–B11**, B12a y B12n, más la limpieza (§3, §4), la seguridad local (§5) y parte del rendimiento (§6). Re-verificado leyendo el código en `fe04116`: las correcciones siguen presentes (B1, B2, B4, B5, B6, B7, B8, B9, B10, B11).
- Tests ejecutados el 2026-10-22: backend 28/28, frontend 15/15 (`node Tests/frontend_logic.test.js`, tarda ~8 s), Python 23/23. Cada corrección de datos lleva su test, salvo B2, B6 y B7 (Lua y endpoint sin cobertura automática).
- **Verificado por el usuario** con el simulador: arranque, pestañas, indicador de grabación y reconexión. **Pendiente de verificar con FS25 real:** grabación durante el trabajo (contador a 1/s, parada al bajarse del tractor, análisis del perfil) y la reconexión del mod Lua.
- Los cambios ya están commiteados (`git status` limpio en `fe04116`).
- Su `.env` local sigue con `UPDATE_FREQUENCY_MS=16.66` (y variables que el código ya no lee: `BACKEND_PORT`, `LOG_*`, `NAMED_PIPE_TIMEOUT`…); cambiar a `33` para emitir a ~30 Hz.
- **Aplicado el 2026-10-22 (sin commitear):** N5 (lista blanca: solo se graba trabajo en campo), V1, V2, V4, V5 y V8 (§11), con MR primero y SDK de respaldo (§12). Tests: backend 30/30, frontend 16/16, Python 23/23. **Los cambios del Lua no se han podido ejecutar ni comprobar sintácticamente aquí** (no hay intérprete de Lua): cargar el mod en FS25 y revisar `log.txt` antes de dar por bueno. Comprobar en juego: que un tractor con remolque o contrapeso ya no grabe (sin `GRABANDO`), que una sembradora/cultivador sí, que `speedMs` de las ruedas cambie con la velocidad, y que el patinaje del dashboard coincida con el de MR.
- El test de frontend falló una vez con 16 tests y pasó en la siguiente ejecución sin cambios: posible test inestable (ver nota de temporizadores en §10).
- Quedan abiertos: B12b–B12m (excepto B12a y B12n), D1–D12, §7 (mejoras funcionales), los pendientes de §5 y §6, y los hallazgos nuevos de §10.

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
| B12k | [analyze_session.py](../../Scripts/analyze_session.py) | `avg_slip`/`peak_slip` solo usan `wheelSlipRL` (ignora RR). `duration_min = n/60` es correcto con 1 muestra/s, pero es tiempo *grabado*, no tiempo de sesión (las paradas con implemento subido no cuentan): rotularlo así. `wmean` trata `None` previo como 0 (sesga el promedio). Ver además N1 (peso del delta). |
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

Siguiente paso recomendado: verificar la grabación con FS25 real, corregir N1 (perfil sesgado), N2 (frame perdido por NaN) y N5 (qué se graba) por afectar a los datos, y seguir con D4–D7 (duplicados del frontend) y §7.1/§7.2 (campo automático y promedio al cerrar sesión). N3 y N4 requieren FS25 real para confirmarse.

## 9. Preguntas abiertas

- ¿Se usa `vehicleComponents` o algún otro dato "extra" desde SimHub? Si no, se puede quitar del mod.
- ¿`Data/campo_profiles.json` debe versionarse o es solo local?
- ~~¿Acceso desde otros equipos?~~ Decidido: solo local.
- ¿Se mantiene compatibilidad sin MoreRealistic o el proyecto lo da por obligatorio?
- ~~¿Se deben grabar los trabajos de tipo `TRANSPORT` y `UNKNOWN`?~~ Decidido: no, solo trabajo en campo (ver N5).

---

## 10. Hallazgos nuevos (revisión 2026-10-22)

Leyenda extra: **[confirmado]** = visto en el código o reproducido con los tests; **[a verificar]** = deducido del código, hace falta FS25 real para confirmarlo.

### Datos incorrectos o perdidos

| ID | Sev. | Estado | Dónde | Problema y arreglo |
| --- | --- | --- | --- | --- |
| N1 | 🟠 | [confirmado] | [analyze_session.py:87-108](../../Scripts/analyze_session.py#L87) | Cuando un archivo ya analizado sigue creciendo, `n` pasa a ser solo el delta, pero `result['avg_*']` es la media de **todo el archivo**. `wmean` pondera esa media global con el peso del delta, así que el perfil se sesga hacia el archivo activo. **Arreglo:** guardar en el perfil, por archivo, `{n, medias}` y recalcular el perfil como media ponderada de archivos; así el análisis repetido es idempotente. Test a añadir: analizar a 100 y a 200 muestras debe dar lo mismo que analizar una vez a 200. |
| N2 | 🟠 | [confirmado] | [SHTelemetry.lua:601-607](../../SHTelemetry/SHTelemetry.lua#L601) | `encode_number` hace `error()` con NaN/inf y el `pcall(encode…)` descarta **el frame entero** (solo imprime). Un único NaN congela el dashboard y se repite en cada tick (30 líneas/s en el log). **Arreglo:** codificar NaN/inf como `null` (o descartar solo ese campo) y registrar el nombre del campo una sola vez. |
| N3 | 🟠 | [a verificar] | [Extensions.lua:399-411](../../SHTelemetry/SHTelemetry_Extensions.lua#L399) | La posición de la rueda se asume por índice (`wheels[1..4]` = FL, FR, RL, RR). En vehículos con ruedas gemelas, 6+ ruedas u otro orden, "trasera" puede ser una delantera. El logger usa `wt[3]`/`wt[4]` como traseras para el patinaje y `wt[1..4]` para la carga por eje. **Arreglo:** calcular la posición con la coordenada local del nodo de la rueda respecto a `rootNode` (signo de x y z) y agrupar por eje. |
| N4 | 🟠 | [a verificar] | [SHTelemetry.lua:472-485](../../SHTelemetry/SHTelemetry.lua#L472) · [start.bat](../../start.bat) | La escritura al pipe es síncrona. En Windows, hacer clic en la consola `cmd /k npm start` (QuickEdit) **pausa** el proceso Node; si deja de leer, el buffer del pipe se llena y `write` puede bloquear el hilo principal de FS25. El payload es grande por `vehicleComponents` (§3). **Arreglo:** quitar `vehicleComponents` o enviarlo a menor frecuencia, desactivar QuickEdit al lanzar (o arrancar el backend minimizado) y documentarlo en `INSTALACION.md`. Prueba: pausar la consola 10 s con el juego en marcha. |
| N5 ✅ | 🟠 | [a verificar] | [Extensions.lua:152-158](../../SHTelemetry/SHTelemetry_Extensions.lua#L152) · [telemetry.js:420](../../Dashboard/backend/src/services/telemetry.js#L420) | Un implemento sin `getIsLowered` (contrapesos) se marca `implementLowered = true`, y `_logSample` graba mientras `speed ≥ 0.3`. Un tractor solo con contrapeso (`workType UNKNOWN`) o con remolque (`TRANSPORT`) genera muestras que ensucian los promedios y la UI muestra GRABANDO. **Decidido (2026-10-22):** el transporte no interesa, solo se graba trabajo en campo. **Arreglo:** lista blanca en `_logSample` (`HARVESTER`, `SOWER`, `CULTIVATOR`, `PLOW`, `MOWER`, `BALER`, `SPRAYER`, `FERTILIZER`, `FIELDWORK`) y excluir `TRANSPORT` y `UNKNOWN`; la UI debe mostrar "EN ESPERA" en esos casos (usar el mismo `_isRecording`). La causa de fondo está en V1 (§11). |
| N6 | 🟡 | [confirmado] | [dashboard.js:257-283](../../Dashboard/frontend/js/dashboard.js#L257) · [tachometer.html:223](../../Dashboard/frontend/sections/cards/tachometer.html#L223) · [bottom-strip.html:5](../../Dashboard/frontend/sections/bottom-strip.html#L5) | `updateStatusStrip` muestra `data.accelerator` (pedal) en los campos rotulados "Engine Load" y "Load". La carga real es `data.motorLoad`. **Arreglo:** decidir cuál se quiere ver y rotular en consecuencia. |
| N7 | 🟡 | [confirmado] | [telemetry-ui.js:29](../../Dashboard/frontend/js/modules/telemetry-ui.js#L29) | `Math.abs(raw) * (Math.abs(raw) <= 1 ? 100 : 1)`: un `longSlip` de 1.2 se muestra como 1 % y exactamente 1.0 como 100 %. Es el duplicado D5. **Arreglo:** que el backend envíe `slipRearPct` (0–100, con tope) y borrar la heurística. |
| N8 | 🟡 | [confirmado] | [telemetry.js:476-477](../../Dashboard/backend/src/services/telemetry.js#L476) | `wheelSlipRL/RR` del logger multiplica por 100 sin tope; con MR hay valores >1 en bloqueo y distorsionan `avg_slip`/`peak_slip`. Acotar a 0–100 (y ver §7.5 sobre el signo). |

### Robustez del backend y seguridad

| ID | Sev. | Dónde | Problema y arreglo |
| --- | --- | --- | --- |
| N9 | 🟡 | [server.js:196](../../Dashboard/backend/server.js#L196) | `GET /api/analyze` escribe `campo_profiles.json`. Cualquier página abierta en el navegador puede lanzarlo con una petición `no-cors` a `localhost:8080`. `POST`/`DELETE` con JSON no son vulnerables porque no hay CORS ni preflight válido. **Arreglo:** pasar a `POST` (ya apuntado en B3), comprobar `Origin`/`Host` esperados (frena también DNS rebinding) y separar "analizar" de "guardar perfil". |
| N10 | 🟡 | [analyze_session.py:268-273](../../Scripts/analyze_session.py#L268) · [server.js:261-272](../../Dashboard/backend/server.js#L261) | Los errores de Python salen como `{"error": …}` con código de salida 0 y el servidor los devuelve con HTTP 200. La UI lo maneja (`d.error`), pero cualquier otro cliente lo ve como éxito. **Arreglo:** `sys.exit(1)` en errores, o que el servidor mapee `result.error` a 4xx/5xx. |
| N11 | 🟡 | [telemetry.js:168-187](../../Dashboard/backend/src/services/telemetry.js#L168) | Al desconectarse el pipe, `currentData` conserva los últimos valores (solo se limpia `telemetrySource`) y el handler `error` no resetea `_massEma`. Ampliación de B12f. **Arreglo:** una función `_onDisconnect()` común para `end`, `error` y `close`. |
| N12 | 🟡 | [telemetry.js:210](../../Dashboard/backend/src/services/telemetry.js#L210) | `connectionRetryTimeout` no se declara en el constructor, y `ENOENT`/`EADDRINUSE` no reintentan nunca. Declararlo y reintentar con espera. |
| N13 | 🟡 | [server.js:121, 365](../../Dashboard/backend/server.js#L121) · [telemetry.js:37](../../Dashboard/backend/src/services/telemetry.js#L37) | `parseInt` en el servicio y en `LOG_EVERY`, `parseFloat` en el mensaje de arranque: con `16.66` se emite a 16 ms y se anuncia 16,66. `/api/config` devuelve cadena si viene de `.env` y número si es el valor por defecto, y el frontend no lo usa (ni `maxBufferSize`). Unificar en un `config.js` y borrar o usar `/api/config`. |
| N14 | 🟡 | [stop_dashboard.bat](../../stop_dashboard.bat) · [start.bat](../../start.bat) | Matan cualquier proceso que escuche en el puerto 8080 (`taskkill /F`) sin comprobar que sea el backend. **Arreglo:** guardar el PID al arrancar, o comprobar que es `node.exe` con `server.js`. |

### Frontend

| ID | Sev. | Dónde | Problema y arreglo |
| --- | --- | --- | --- |
| N15 | 🟡 | [telemetry-client.js:40-47](../../Dashboard/frontend/js/telemetry-client.js#L40) | En `disconnect` se escribe "Sin servidor" y a continuación `updateConnectionBadge` lo pisa con "Sin telemetría FS25": no se distingue backend caído de FS25 apagado. Dos módulos escriben `#connection-status` y `.status-dot`. **Arreglo:** un único módulo de estado con tres estados (sin servidor / sin FS25 / en vivo). |
| N16 | 🟡 | [dashboard.js:54](../../Dashboard/frontend/js/dashboard.js#L54) | `recordDyno` también guarda en `localStorage` las curvas de los vehículos simulados (`(Simulado)`), que gastan plazas de `MAX_VEHICLES`. Saltar si `telemetrySource === 'mock'`. |

### Mejoras pequeñas detectadas

- **Lua, spam en el log del juego:** `print` en cada tick ("getMotor() retornó nil", "Motor no disponible…", "Error en buildTelemetry") a 30 Hz. Limitar a una vez cada N segundos o al cambiar de estado.
- **Lua, vehículos sin diésel:** `getVehicleFuelLevelAndCapacity` devuelve `0, 0` y `fuelPercentage` queda en 0: la UI lo pinta como depósito vacío. Enviar `hasFuel = false` y ocultar la tarjeta.
- **Lua, código muerto:** el bloque `if false then … log(…)` ([Extensions.lua:142](../../SHTelemetry/SHTelemetry_Extensions.lua#L142)) y `targetRpm` ([SHTelemetry.lua:250-267](../../SHTelemetry/SHTelemetry.lua#L250)), que el backend no lee y que codifica umbrales fijos (1400/1700/1800 rpm) que no valen para todos los motores.
- **UI, fuera del vehículo:** el backend limpia rpm y velocidad al recibir `isInVehicle=false`, pero nombre, combustible y desgaste quedan del último vehículo sin indicarlo. Mostrar "FUERA DEL VEHÍCULO" en el badge.
- **Tests:** `node --test Tests/` (frontend) falla con `MODULE_NOT_FOUND`; solo funciona `node Tests/frontend_logic.test.js`. El archivo tarda ~8 s, probablemente por temporizadores reales (`mock.timers` o menos espera). Faltan tests de `server.js` (endpoints), del reinicio del pipe y de N1.
- **`ui-updater.js`:** `showNotification` no se invoca desde ningún sitio, y `setTheme`/`toggleFullscreen` solo se usan desde atajos del propio archivo. Candidatos a retirar junto a B12j/§3.

### Comprobado y correcto (no hace falta tocar)

- Todos los IDs del DOM que usa el JS existen en el HTML.
- `DELETE /api/session/file` y `GET /api/analyze?file=`: la validación por segmentos frena el path-traversal.
- `_save_profile`: escritura atómica, `.bak` ante JSON corrupto y archivos del formato antiguo sin recontar.
- `isInVehicle=false` limpia el estado antes de grabar (B1) y `isRecording` viene del backend (B8).

### Orden sugerido para trabajar

1. **Datos:** N1 → N2 → N5 → N3 (con FS25) → N8.
2. **Estabilidad en juego:** N4 (probar la pausa de consola) y el spam de `print`.
3. **Backend y seguridad:** N9 → N10 → N11 → N12 → N13 → N14.
4. **Frontend:** N6 → N7 (junto a D5) → N15 → N16.

---

## 11. Verificación de los Lua contra el SDK de FS25 y MoreRealistic (2026-10-22)

Fuentes comparadas: código del juego en `…\Farming Simulator 25\sdk\debugger\gameSource\dataS\scripts` y el mod de [MoreRealistic_FS25-main](../../MoreRealistic_FS25-main) (v0.26.10.15). Alcance: [SHTelemetry.lua](../../SHTelemetry/SHTelemetry.lua) y [SHTelemetry_Extensions.lua](../../SHTelemetry/SHTelemetry_Extensions.lua).

**Resultado:** las llamadas principales son correctas (ver lista al final). Hay una causa de fondo para N5, un dato erróneo y varios accesos a campos que no existen en FS25.

### Problemas

| ID | Sev. | Dónde | Problema y arreglo |
| --- | --- | --- | --- |
| V1 ✅ | 🟠 | [Extensions.lua:152-158](../../SHTelemetry/SHTelemetry_Extensions.lua#L152) | Causa de N5. `Attachable:getIsLowered(defaultIsLowered)` ([Attachable.lua:2219](file:///C:/Program%20Files%20(x86)/Steam/steamapps/common/Farming%20Simulator%2025/sdk/debugger/gameSource/dataS/scripts/vehicles/specializations/Attachable.lua)) devuelve `jointDesc.moveDown` solo si el enganche permite bajar; si no, devuelve el argumento. El Lua pasa `true`, así que cualquier implemento sobre un enganche fijo (remolques, contrapesos) cuenta como "bajado". **Arreglo:** pasar `false` y, para trabajo en campo, apoyarse en `getIsWorkAreaActive(workArea)` (ver V4). |
| V2 ✅ | 🟠 | [Extensions.lua:429-432](../../SHTelemetry/SHTelemetry_Extensions.lua#L429) | `wheel.physics.rotSpeed` es el parámetro de **dirección** (`rotSpeed` del XML, usado en `setSteeringValues`), no la velocidad de giro de la rueda. `speedMs = rotSpeed * radius` es una constante sin sentido. **Arreglo:** usar `wheel.physics.netInfo.xDriveSpeed` (rad/s, [WheelPhysics.lua:285](file:///C:/Program%20Files%20(x86)/Steam/steamapps/common/Farming%20Simulator%2025/sdk/debugger/gameSource/dataS/scripts/vehicles/wheels/WheelPhysics.lua)) multiplicado por `radius`, o retirar el campo si no se usa. |
| V3 | 🟡 | [SHTelemetry.lua:363-368](../../SHTelemetry/SHTelemetry.lua#L363) | `wearableSpec.isBroken` no existe en `Wearable.lua`; el flag real es `vehicle.isBroken` ([Vehicle.lua:2745](file:///C:/Program%20Files%20(x86)/Steam/steamapps/common/Farming%20Simulator%2025/sdk/debugger/gameSource/dataS/scripts/vehicles/Vehicle.lua)). Hoy `isVehicleBroken` solo salta con daño ≥ 1. **Arreglo:** `vehicle.isBroken == true or damage >= 1`. |
| V4 ✅ | 🟡 | [Extensions.lua:82-110, 195-209, 285-294](../../SHTelemetry/SHTelemetry_Extensions.lua#L82) | Nombres que no existen como especialización en FS25 (código inalcanzable): `spec_directSowingMachine`, `spec_fertilizer`, `spec_manureSpreader`, `spec_disc`, `spec_subsoiler`, `spec_rollerCultivator` (Disc y Subsoiler usan `spec_cultivator`; esparcidores y abonadoras usan `spec_sprayer`, por lo que `FERTILIZER` nunca se devuelve). Tampoco existen `spec_combine.isWorking`, `workArea.isActive` (la API es `vehicle:getIsWorkAreaActive(workArea)`) ni `spec_cylindered.currentLiters/capacity`. **Faltan** `spec_mulcher`, `spec_weeder`, `spec_roller`, `spec_stonePicker`, `spec_ridgeFormer`, `spec_fruitPreparer`, `spec_plowPacker`, `spec_fertilizingCultivator`, `spec_forageWagon`, `spec_pickup`, `spec_baleWrapper`: caen en `FIELDWORK` si tienen área de trabajo y en `UNKNOWN` si no. **Arreglo:** reescribir `detectWorkType` con los nombres reales, mapeando los que faltan; con la lista blanca de N5 los `UNKNOWN` dejan de grabarse. |
| V5 ✅ | 🟡 | [Extensions.lua:402-408](../../SHTelemetry/SHTelemetry_Extensions.lua#L402) | `wheel.tirePressure` y `wheel.tireWear` no existen en las ruedas de FS25 ni en MR; los campos `wheel_N_pressure/wear` nunca se envían. Quitarlos o buscar el origen real. |
| V6 | 🟡 | [SHTelemetry.lua:92-100](../../SHTelemetry/SHTelemetry.lua#L92) | `missionInfo.money/map/timeScale/playTime` y `environment.currentDay` no se pueden comprobar con el SDK (no incluye `Mission`/`Environment`; `currentHour` y `currentMinute` sí aparecen en `Lights.lua`). Si alguno es `nil`, `buildTelemetry` lanza error y se pierde el frame entero. Ninguno lo usa el backend. **Arreglo:** quitar esas líneas o leerlas dentro de un `pcall`. |
| V7 | 🟡 | [SHTelemetry.lua:184-190](../../SHTelemetry/SHTelemetry.lua#L184) | `Vehicle:getOperatingTimeText()` ya existe ([Vehicle.lua:4547](file:///C:/Program%20Files%20(x86)/Steam/steamapps/common/Farming%20Simulator%2025/sdk/debugger/gameSource/dataS/scripts/vehicles/Vehicle.lua)) con el mismo formato; el Lua lo reimplementa. Sustituir o quitar (el backend no lo usa). |
| V8 ✅ | 🟡 | [telemetry.js:534-545](../../Dashboard/backend/src/services/telemetry.js#L534) | MR ya calcula `spec_wheels.mrAvgDrivenWheelsSlip` (lo usa en [MR_WheelPhysics.lua:204](../../MoreRealistic_FS25-main/MoreRealistic/scripts/MR_WheelPhysics.lua#L204)). Se puede enviar tal cual desde el Lua y eliminar el cálculo duplicado del backend y del frontend (D5, N7), con el mismo criterio de "ruedas motrices" que usa MR en lugar de "ruedas 3 y 4". También resuelve N3 para el patinaje. |

### Comprobado y correcto

- `getGearInfoToDisplay()`: el orden de los 10 valores devueltos coincide con el Lua ([Motorized.lua:3192](file:///C:/Program%20Files%20(x86)/Steam/steamapps/common/Farming%20Simulator%2025/sdk/debugger/gameSource/dataS/scripts/vehicles/specializations/Motorized.lua)).
- `getTotalMass(onlyGivenVehicle)`: `true` = solo el vehículo, `false` = con implementos (override en `AttacherJoints.lua:3917`); `implementMassT = total − vehículo` es correcto.
- `getLastSpeed()` devuelve km/h (`lastSpeed * 3600`); `lastFuelUsage` está en L/h; el par está en kN·m (por eso `×1000` = Nm y `par × rotSpeed` = kW).
- Existen y se usan bien: `getMotor`, `getIsMotorStarted`, `getReverserDirection` (Drivable), `getConsumerFillUnitIndex` (Motorized), `getFillUnitFillLevel/Capacity`, `movingDirection`, `operatingTime`, `getFullName`, `spec_wearable.damage/totalAmount`, `getDamageAmount`, `getWearTotalAmount`, `spec_motorized.motorTemperature.value`, `motorFan.enabled`, `actualLoadPercentage`, `differentials[].diffIndex1/2IsWheel`, `engine.getMinRpm/getMaxRpm/getLastRealMotorRpm/getMotorAppliedTorque/getMotorAvailableTorque`, `lastAcceleratorPedal`, `peakMotorPower`, `peakMotorTorque`, `motorRotSpeed`, `lastMotorRpm`.
- Implementos: `spec_attacherJoints.attachedImplements[].object`, `spec_foldable.foldAnimTime`, `spec_combine.attachedCutters` (tabla hash) / `numAttachedCutters` / `lastValidInputFruitType`, `spec_cutter.isWorking`, `getFruitTypeByIndex`. Las sembradoras fijan `spec_sowingMachine.isWorking = getLastSpeed() > 0.5` ([FertilizingSowingMachine.lua:71](file:///C:/Program%20Files%20(x86)/Steam/steamapps/common/Farming%20Simulator%2025/sdk/debugger/gameSource/dataS/scripts/vehicles/specializations/FertilizingSowingMachine.lua)), es decir, por velocidad y no por trabajo real.
- Ruedas: `physics.hasGroundContact`, `radius`, `driveMode`, `densityType`, `groundDepth` existen.
- MoreRealistic: `mrLastLongSlip`, `mrLastLatSlip`, `mrLastTireLoadS`, `mrLastGroundType`, `mrLastRrFx`, `mrLastPressureFx`, `mrIsDriven` (en `wheel.physics`), `mrLastFuelUsageS` (en `spec_motorized`), `mrMinEcoRot` (rad/s, la conversión a rpm es correcta), `mrPowerBandMinRpm/MaxRpm`, `mrPeakPowerRpm`, `mrCvtRatioIncRate` (en el motor) y `mrIsMrVehicle` (en el vehículo).

### Orden sugerido

1. V1 + V4 + N5 juntos: detección de trabajo en campo y lista blanca de grabación (una sola corrección de datos, con test).
2. V2, V3, V5, V6, V7: limpieza del Lua, sin riesgo.
3. V8 con D5/N7: un solo cálculo de patinaje.

---

## 12. Criterio de fuentes de datos: MoreRealistic primero, SDK de respaldo (decidido 2026-10-22)

**Regla:** para cada dato del Lua se lee primero el valor de MoreRealistic (MR) cuando `isMoreRealistic` y el campo existe; si no, se usa el equivalente del SDK de FS25. Esto ya se hace en motor, carga de neumático, patinaje, suelo y combustible; falta aplicarlo al resto. Cada dato debe enviar de qué fuente viene (`dataSource: "mr" | "sdk"`) para que el análisis no mezcle valores con distinto significado.

### Dónde aplicar la regla en lo ya existente

| Dato | Hoy | Fuente MR (verificada en `MoreRealistic/scripts`) | Acción |
| --- | --- | --- | --- |
| Velocidad de rueda | `physics.rotSpeed × radius`, que es un parámetro de dirección (V2) | `wheel.physics.mrLastWheelSpeed` / `mrLastWheelSpeedS` ([MR_WheelPhysics.lua:504](../../MoreRealistic_FS25-main/MoreRealistic/scripts/MR_WheelPhysics.lua#L504)) | Usar MR; respaldo SDK `netInfo.xDriveSpeed × radius`. |
| Patinaje medio de ruedas motrices | Backend calcula con "ruedas 3 y 4" (V8) | `spec_wheels.mrAvgDrivenWheelsSlip` ([MR_WheelsUtil.lua:1050](../../MoreRealistic_FS25-main/MoreRealistic/scripts/MR_WheelsUtil.lua#L1050)) | Enviarlo desde el Lua; el backend y el frontend dejan de calcularlo. |
| Ruedas motrices | `mrIsDriven` si existe, si no diferenciales | `physics.mrIsDriven` | Ya correcto. |
| Transmisión CVT | `mrCvtRatioIncRate > 0` | `vehicle.mrTransmissionIsHydrostatic` y `mrTransmissionPowerRatio` ([MR_Vehicle.lua:90-91](../../MoreRealistic_FS25-main/MoreRealistic/scripts/MR_Vehicle.lua#L90)) | Contrastar los dos criterios con un CVT real y quedarse con el más fiable. |
| RPM eco | `mrMinEcoRot × 30/π` | `motor.mrMinEcoRpm` (ya calculado, [MR_VehicleMotor.lua](../../MoreRealistic_FS25-main/MoreRealistic/scripts/MR_VehicleMotor.lua)) | Leer directamente, sin convertir. |
| Carga del motor | Fórmula propia con `motorAppliedTorque`, con abs/max según marcha atrás | `spec_motorized.mrEngineIsBraking` indica freno motor | Usarlo en lugar de deducir por el signo del par (cuesta abajo = 0 %). |
| Tipo de trabajo | `detectWorkType` por especialización (V4) | `vehicle.mrStoreCategory`, `mrIsHeaderTrailer`, `mrPowerConsumerToolCategory` en el implemento | Valorar la categoría de MR como criterio principal de tipo de herramienta y la especialización del SDK como respaldo. |
| Implemento "trabajando" | Heurística de bajado + velocidad (V1) | `implement.mrLastForce`, `mrLastNeededPtoPower` (potencia/fuerza que realmente demanda) | Considerar "trabajando" cuando MR indica fuerza o potencia > umbral; respaldo `getIsWorkAreaActive`. |

### Datos de MR que hoy no se envían y aportan al análisis

| Dato | Campo MR | Para qué sirve |
| --- | --- | --- |
| Fuerza de tiro del implemento | `mrLastForce` ([MR_PowerConsumer.lua:70](../../MoreRealistic_FS25-main/MoreRealistic/scripts/MR_PowerConsumer.lua#L70)) | Medir el esfuerzo real del arado, cultivador o sembradora; mejor base que la carga del motor para recomendar velocidad. |
| Potencia de toma de fuerza | `motor.mrLastPtoPower` (kW), `mrLastNeededPtoPower`, `mrPtoCurrentRpm` | Cargas de TdF (empacadoras, esparcidores, trituradoras) que no se ven en la tracción. |
| Rendimiento de cosechadora | `mrCombineLastTonsPerHourAvg`, `mrCombineLitersPerSecondS2`, `mrCombineSpeedLimit` ([MR_Combine.lua](../../MoreRealistic_FS25-main/MoreRealistic/scripts/MR_Combine.lua)) | t/h reales y límite de velocidad por capacidad: lo principal para analizar cosecha. |
| Frenado | `wheel.physics.mrLastBrakeForce`, `mrLastEngineBrakeForce` | Detectar frenadas y freno motor en cuestas. |
| Fricción y suelo | `mrLastFrictionCoeff`, `mrLastGroundSubType` | Explicar el patinaje por tipo de suelo. |

### Normas de implementación

1. En el Lua, una función por dato: `local v = mrValue() ; if v == nil then v = sdkValue() end`, con `pcall` alrededor del acceso a MR (sus campos cambian entre versiones; el Lua ya cita "MR 0.26.03.25" y hoy es 0.26.10.15).
2. Registrar al arrancar la versión de MR detectada y qué campos faltan, una sola vez (no a 30 Hz).
3. Los campos nuevos de MR llegan al backend con prefijo `mr` y se guardan en el `.jsonl` solo si interesan al análisis (fuerza de tiro, potencia de TdF, t/h); añadir `schemaVersion` al muestreo (§7.6) antes de cambiar el formato.
4. Tests: payload con MR y payload sin MR para cada dato nuevo; el segundo debe seguir produciendo valores del SDK.
5. Pendiente de verificar con FS25: unidades de `mrLastForce` y `mrCombineLastTonsPerHourAvg` (se leen en el código de MR pero no se han contrastado en juego).
