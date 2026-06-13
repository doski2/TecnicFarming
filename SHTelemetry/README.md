# SHTelemetry - Mod de Telemetría para Farming Simulator 2025

## 📋 Descripción

SHTelemetry es un mod para Farming Simulator 2025 que captura datos de telemetría en tiempo real del vehículo y los envía a través de una Named Pipe (Windows) para ser procesados por el backend Node.js y visualizados en el dashboard HTML.

**Versión actual:** 2.2  
**Estado:** ✅ Producción  
**Compatibilidad:** FS 2025, Windows 7+

## 🎯 Características

### Datos capturados automáticamente

- ✅ Velocidad (m/s y km/h)
- ✅ RPM del motor
- ✅ Marcha actual
- ✅ Nivel de combustible
- ✅ Temperatura del motor
- ✅ Daño del vehículo
- ✅ Estado de luces (intermitentes, balizas)
- ✅ Control de crucero
- ✅ Posición XYZ
- ✅ Rotación XYZ
- ✅ Tiempo de operación

### Soporte para mods adicionales

- ✅ **MoreRealistic_FS25**: Consumo, desgaste, temperaturas
- ✅ Extensible a otros mods

## 📁 Estructura de archivos

```
SHTelemetry/
├── modDesc.xml                    ← Manifiesto del mod
├── SHTelemetry.lua               ← Lógica principal (Lua)
├── SHTelemetry_Extensions.lua     ← Capturas extendidas (v2.2+)
└── simhub.dds                     ← Icono del mod
```

## 🚀 Instalación

1. **Descarga el mod**

   ```
    Copiar o renombrar como `SHTelemetry.zip` en:
   C:\Users\[Usuario]\Documents\My Games\FarmingSimulator2025\mods\
   ```

2. **Inicia Farming Simulator 2025**

3. **Activa el mod** en el gestor de mods

4. **Inicia el servidor Node.js**

   ```bash
    cd c:\Users\doski\TecnicFarming\Dashboard\backend
   npm start
   ```

5. **Abre el dashboard**
   ```
    Abre: http://localhost:8080
   ```

## 📊 Cómo funciona

### Flujo de datos

```
Juego (FS25)
    ↓ (Lua: SHTelemetry.lua + SHTelemetry_Extensions.lua)
Named Pipe: \\.\pipe\SHTelemetry
    ↓ (JSON línea por línea)
Backend Node.js (TelemetryService)
    ↓ (Socket.io / WebSocket)
Dashboard HTML (Vanilla JS)
    ↓
Visualización en vivo + grabación JSONL
```

### Ciclo de captura

1. **Cada 10ms** el mod captura datos del vehículo
2. **Serializa** a JSON
3. **Envía** a Named Pipe
4. **Servidor lee** y broadcast por WebSocket
5. **Dashboard recibe** y renderiza

## 🔧 Configuración

### archivo: `modDesc.xml`

```xml
<?xml version="1.0" encoding="utf-8" standalone="no" ?>
<modDesc descVersion="92">
    <author>wotever</author>
    <version>1.0.0.0</version>
    <title>
        <en>SimHub Telemetry Interface</en>
    </title>
    <extraSourceFiles>
        <sourceFile filename="SHTelemetry.lua"/>
        <sourceFile filename="SHTelemetry_Extensions.lua"/>
    </extraSourceFiles>
</modDesc>
```

**Variables importantes:**

- `pipeName`: `\\.\pipe\SHTelemetry` (configurable)
- `updateFrequency`: ~100ms entre envíos

## 📖 Desarrollo

### Agregar nuevos datos

**Paso 1:** Edita `SHTelemetry_Extensions.lua`

```lua
function SHTelemetry:captureMyModData(vehicle, telemetry)
    if vehicle.spec_mymod ~= nil then
        local spec = vehicle.spec_mymod
        telemetry.mymod_customValue = spec.customValue
    end
end
```

**Paso 2:** Llámalo en `captureExtendedData()`

```lua
pcall(function()
    SHTelemetry:captureMyModData(vehicle, telemetry)
end)
```

**Paso 3:** Reinicia el juego

### Probar sin abrir el juego

Desde la raíz del proyecto TecnicFarming:

```bat
node Tests\mock_telemetry_provider.js
```

Inicia un simulador que crea la Named Pipe y envía telemetría falsa. Luego arranca el backend con `npm start`.

### Debugging

Abre la consola del juego (F10) y ejecuta:

```lua
-- Ver especificaciones disponibles
local vehicle = g_currentMission.controlledVehicle
for specName, specData in pairs(vehicle) do
    if string.match(tostring(specName), "^spec_") then
        print(specName)
    end
end

-- Ver datos de MoreRealistic
if vehicle.spec_moreRealistic then
    for k, v in pairs(vehicle.spec_moreRealistic) do
        print(k, "=", v)
    end
end
```

## 📚 Documentación

Documentación del proyecto TecnicFarming:

- **[README principal](../README.md)** — Visión general
- **[Guía de datos](../Docs/GUIA_DATOS_TELEMETRIA.md)** — Campos JSONL y flujo
- **[Guía de tests](../Docs/Setup/TESTING.md)** — Simulador y suite de tests
- **[Tracción de ruedas](../Docs/Development/TRACCION_RUEDAS.md)** — Datos extendidos v2.2+

## 🐛 Troubleshooting

### "La telemetría no aparece en el dashboard"

1. ¿Está el mod activado en el gestor de mods?
2. ¿Está el servidor Node.js corriendo? (`npm start`)
3. ¿El dashboard está abierto en <http://localhost:8080>?
4. Verifica los logs en F10 (consola del juego) y en `Dashboard/backend/logs/`

### "spec_moreRealistic es nil"

- El mod MoreRealistic_FS25 NO está instalado
- O NO está cargado antes que SHTelemetry
- Verifica el orden de carga en `modDesc.xml`

### "Error: EPIPE o escritura a pipe fallida"

- El servidor Node.js no está corriendo
- O la Named Pipe no fue creada correctamente
- Reinicia el juego y el servidor

## 🤝 Soporte

Para reportar bugs o sugerir features:

1. Abre una issue en GitHub
2. Adjunta:
   - Versión del juego
   - Mods instalados
   - Logs (F10 en juego)
   - Logs del servidor (`npm start`)

## 📝 Licencia

Este mod se distribuye bajo la misma licencia que el original de SimHub.

## 🔗 Enlaces útiles

- [SimHub Official](https://www.simhubdash.com)
- [MoreRealistic_FS25](https://github.com/quadural/MoreRealistic_FS25)
- [GIANTS Engine Documentation](https://gdn.giants-software.com/)
- [Farming Simulator Forums](https://www.farming-simulator.com/)

---

**Última actualización:** 13 de junio de 2026  
**Versión:** 2.2  
**Autor original:** wotever  
**Mantenedor actual:** [tu nombre aquí]
