--
-- Mod de telemetría para SimHub
-- 2020 - Wotever
-- Este mod puede modificarse libremente siempre que se siga usando en conjunto con SimHub
-- SimHub detectará automáticamente cualquier dato de telemetría nuevo añadido a la salida
--
-- Versión 2.2: Soporte para capturas extendidas (MoreRealistic_FS25, posición, ruedas, etc.)
-- SHTelemetry_Extensions.lua es cargado automáticamente por FS25 via modDesc extraSourceFiles
--
local encode

SHTelemetry = {}
SHTelemetry.Context = {}
SHTelemetry.Context.isLoaded = false
SHTelemetry.Context.updateCount = 0
SHTelemetry.Context.pipeName = "\\\\.\\pipe\\SHTelemetry"
SHTelemetry.Context.UpdateDt = 0
SHTelemetry.Context.CumulatedDt = 0
SHTelemetry.Context.pipeAvailable = false

SHTelemetry.Telemetry = {}

-- Callback llamado por el engine cuando se carga el mod
function SHTelemetry:loadedMission()
	print("[SHTelemetry] Misión cargada")
end

function SHTelemetry:initPipe(dt)
	-- Si ya hay conexión activa, no hacer nada
	if SHTelemetry.Context.shfile ~= nil then return end

	-- Intentar reconectar cada 300 ciclos (~3s), sin límite de reintentos.
	-- Así el dashboard puede arrancarse en cualquier momento mientras se juega.
	if SHTelemetry.Context.updateCount == 0 then
		local success, result = pcall(function()
			return io.open(SHTelemetry.Context.pipeName, "w")
		end)

		if success and result ~= nil then
			SHTelemetry.Context.shfile = result
			SHTelemetry.Context.pipeAvailable = true
			print("[SHTelemetry] Pipe conectada correctamente")
		end
		-- Si falla, simplemente esperamos al próximo ciclo (sin bloquear)
	end

	SHTelemetry.Context.updateCount = SHTelemetry.Context.updateCount + 1
	if SHTelemetry.Context.updateCount == 300 then
		SHTelemetry.Context.updateCount = 0
	end
end

function SHTelemetry:getCurrentPlayer()
	-- FS25: g_localPlayer es el global directo (igual que MR_VehicleDebug.lua)
	if g_localPlayer ~= nil then
		return g_localPlayer
	end
	-- Fallback para versiones antiguas del API
	if g_minModDescVersion >= 90 then
		return g_currentMission.playerSystem.playersByUserId[g_currentMission.playerUserId]
	end
	return g_currentMission.player
end

function SHTelemetry:getCurrentVehicle()
	-- FS25: g_localPlayer:getCurrentVehicle() — patrón de MR
	if g_localPlayer ~= nil then
		return g_localPlayer:getCurrentVehicle()
	end
	-- Fallback para versiones antiguas del API
	if g_minModDescVersion >= 90 then
		return SHTelemetry:getCurrentPlayer():getCurrentVehicle()
	end
	return g_currentMission.controlledVehicle
end

function SHTelemetry:clamp(val, min, max)
	if val < min then
		val = min
	elseif val > max then
		val = max
	end
	return val
end

function SHTelemetry:buildTelemetry(telemetryDt)
	local mission = g_currentMission

	SHTelemetry.Telemetry = {}
	SHTelemetry.Telemetry.pluginVersion = "2.1"

	SHTelemetry.Telemetry.money = mission.missionInfo.money
	SHTelemetry.Telemetry.dayTime = mission.environment.currentHour * 3600 + mission.environment.currentMinute * 60
	SHTelemetry.Telemetry.day = mission.environment.currentDay
	SHTelemetry.Telemetry.mapTitle = mission.missionInfo.map.title
	SHTelemetry.Telemetry.mapId = mission.missionInfo.map.id
	SHTelemetry.Telemetry.timeScale = mission.missionInfo.timeScale
	SHTelemetry.Telemetry.timeScaleMultiplier = mission.missionInfo.timeScaleMultiplier
	SHTelemetry.Telemetry.playTime = mission.missionInfo.playTime
	SHTelemetry.Telemetry.currentPhysicsTime = SHTelemetry.Context.CumulatedDt

	local vehicle = self:getCurrentVehicle()

	SHTelemetry.Telemetry.isInVehicle = vehicle ~= nil

	if vehicle ~= nil and vehicle.getMotor ~= nil then
		local engine = vehicle:getMotor()
		local level, capacity = self:getVehicleFuelLevelAndCapacity(vehicle)
			
			-- DEBUG: Log si engine es nil (para diagnosticar problemas de captura)
			if engine == nil then
				print("[SHTelemetry] WARN: getMotor() retornó nil para vehículo: " .. (vehicle:getFullName() or "Unknown"))
			end
		SHTelemetry.Telemetry.vehicleName = vehicle:getFullName()
		SHTelemetry.Telemetry.isMoreRealistic = (g_modIsLoaded ~= nil and g_modIsLoaded["MoreRealistic"]) or (g_modNameToDirectory ~= nil and g_modNameToDirectory["MoreRealistic"] ~= nil)
		SHTelemetry.Telemetry.fuelLevel = level
		SHTelemetry.Telemetry.fuelCapacity = capacity
		if capacity ~= nil and capacity > 0 then
			SHTelemetry.Telemetry.fuelPercentage = (level / capacity) * 100
		else
			SHTelemetry.Telemetry.fuelPercentage = (level or 0) > 0 and 100 or 0
		end

		-- Masa del vehículo y tren (en toneladas)
		-- getTotalMass en FS25 devuelve TONELADAS directamente (no kg)
		-- pcall para evitar crash si el vehículo no tiene spec_attacherJoints
		if vehicle.getTotalMass ~= nil then
			local okV, vMassT = pcall(function() return vehicle:getTotalMass(true)  or 0 end)
			local okT, tMassT = pcall(function() return vehicle:getTotalMass(false) or 0 end)
			if okV and okT then
				SHTelemetry.Telemetry.vehicleMassT   = vMassT
				SHTelemetry.Telemetry.implementMassT = tMassT - vMassT
				SHTelemetry.Telemetry.totalMassT     = tMassT
			end
		end

		-- Condición del vehículo (SDK FS25 Wearable.lua)
		-- IMPORTANTE: Inicializar siempre para que el JSON encoder no omita el campo.
		-- spec_wearable.damage (0-1): daño mecánico. 0=nuevo, 1=roto.
		-- El juego muestra condición como (1-damage)*100 en el HUD y tienda.
		SHTelemetry.Telemetry.vehicleDamageAmount = 0
		SHTelemetry.Telemetry.vehicleWearAmount   = 0
		local wearableSpec = vehicle.spec_wearable
		if wearableSpec ~= nil then
			SHTelemetry.Telemetry.vehicleDamageAmount = wearableSpec.damage or 0
			SHTelemetry.Telemetry.vehicleWearAmount   = wearableSpec.totalAmount or 0
		elseif vehicle.getDamageAmount ~= nil then
			SHTelemetry.Telemetry.vehicleDamageAmount = vehicle:getDamageAmount() or 0
			SHTelemetry.Telemetry.vehicleWearAmount   = (vehicle.getWearTotalAmount ~= nil and vehicle:getWearTotalAmount()) or 0
		end

		if vehicle.spec_motorized ~= nil then
			local spec_motorized = vehicle.spec_motorized
			local motorFan = spec_motorized.motorFan
			local motorTemperature = spec_motorized.motorTemperature

			-- Datos de marchas
			local gearName, gearGroupName, gearsAvailable, isAutomatic, prevGearName, nextGearName, prevPrevGearName, nextNextGearName, isGearChanging, showNeutralWarning =
				vehicle:getGearInfoToDisplay()
			SHTelemetry.Telemetry.gearName = gearName
			SHTelemetry.Telemetry.gearGroupName = gearGroupName
			SHTelemetry.Telemetry.gearsAvailable = gearsAvailable
			SHTelemetry.Telemetry.isAutomatic = isAutomatic
			SHTelemetry.Telemetry.prevGearName = prevGearName

			-- Tipo de transmisión: "cvt" | "automatic" | "manual"
			-- CVT con MoreRealistic: mrCvtRatioIncRate > 0 sólo en motores CVT hidrostáticos
			local transType = "manual"
			if isAutomatic then
				transType = "automatic"
				if SHTelemetry.Telemetry.isMoreRealistic and engine ~= nil
					and engine.mrCvtRatioIncRate ~= nil and engine.mrCvtRatioIncRate > 0 then
					transType = "cvt"
				end
			end
			SHTelemetry.Telemetry.transmissionType = transType
			SHTelemetry.Telemetry.nextGearName = nextGearName
			SHTelemetry.Telemetry.prevPrevGearName = prevPrevGearName
			SHTelemetry.Telemetry.nextNextGearName = nextNextGearName
			SHTelemetry.Telemetry.isGearChanging = isGearChanging
			SHTelemetry.Telemetry.showNeutralWarning = showNeutralWarning

			-- Tiempo de operación
			local minutes = vehicle.operatingTime / (1000 * 60)
			local hours = math.floor(minutes / 60)
			minutes = math.floor(minutes - hours * 60)

			SHTelemetry.Telemetry.vehicleOperatingTimeText =
				string.format(g_i18n:getText("shop_operatingTime"), hours, minutes)
			SHTelemetry.Telemetry.vehicleOperatingTime = vehicle.operatingTime


-- Movimiento y datos básicos del motor
			-- SDK: getIsMotorStarted() = motorState == MotorState.ON
			SHTelemetry.Telemetry.isMotorStarted = vehicle:getIsMotorStarted()
			-- isReverseDirection: verdadero cuando el REVERSOR está puesto en marcha atrás.
			-- Usa getReverserDirection()==-1 como señal primaria (activa desde que se mete la marcha,
			-- incluso antes de que el vehículo empiece a moverse → fix para load=0 al arrancar en reversa).
			-- OR movingDirection==-1 como red de seguridad para deslizamientos con marcha adelante.
			local _revDir = (vehicle.getReverserDirection ~= nil) and vehicle:getReverserDirection() or 1
			SHTelemetry.Telemetry.isReverseDirection = (_revDir == -1) or (vehicle.movingDirection == -1)

			if engine ~= nil then
				if engine.getMaxRpm ~= nil then
					SHTelemetry.Telemetry.maxRpm = engine:getMaxRpm()
				end
				if engine.getMinRpm ~= nil then
					SHTelemetry.Telemetry.minRpm = engine:getMinRpm()
				end
				if engine.getLastRealMotorRpm ~= nil then
					SHTelemetry.Telemetry.rpm = engine:getLastRealMotorRpm()
				end

				-- Capturar motor load (carga del motor) avanzada
				local mLoad = 0
			if SHTelemetry.Telemetry.isMoreRealistic and engine.motorAppliedTorque ~= nil and engine.peakMotorPower ~= nil then
					-- Fórmula de MoreRealistic: (Torque * RPM / 9.55) / PotenciaMáxima
					-- En REVERSA: motorAppliedTorque negativo = esfuerzo real hacia atrás → usar abs
					-- Hacia ADELANTE cuesta abajo: motorAppliedTorque negativo = freno motor (absorbe energía)
					--   → NO usar abs: el motor NO está sobrecargado, está frenando → mostrar 0%
					local curRpm = engine.lastMotorRpm or (engine.motorRotSpeed * 9.5493)
					local rawTorque = engine.motorAppliedTorque
					local effectiveTorque
					if SHTelemetry.Telemetry.isReverseDirection then
						effectiveTorque = math.abs(rawTorque) -- reversa: torque negativo = esfuerzo real
					else
						effectiveTorque = math.max(0, rawTorque) -- adelante: torque negativo = freno motor = 0% carga
					end
					local curPower = effectiveTorque * (curRpm * math.pi / 30)
					mLoad = curPower / engine.peakMotorPower
				else
					-- Fallback estándar FS25: spec_motorized.actualLoadPercentage (0-1)
					-- En reversa puede ser negativo (tracción inversa) → abs correcto
					-- Cuesta abajo: FS25 devuelve 0 en este fallback (no hay freno motor negativo aquí)
					local rawLoad = spec_motorized.actualLoadPercentage or 0
					if SHTelemetry.Telemetry.isReverseDirection then
						mLoad = math.abs(rawLoad)
					else
						mLoad = math.max(0, rawLoad)
					end
				end
				-- Fallback extra en reversa: si load sigue a 0 pero hay pedal de acelerador,
				-- usar el pedal como proxy del esfuerzo del motor
				if mLoad == 0 and SHTelemetry.Telemetry.isReverseDirection
					and engine.lastAcceleratorPedal ~= nil then
					mLoad = engine.lastAcceleratorPedal or 0
				end
				SHTelemetry.Telemetry.motorLoad = self:clamp(mLoad * 100, 0, 125) -- MR permite hasta 125% en picos

				-- Lógica de Eficiencia (Target RPM para Manual/CVT)
				-- Basado en mantener el motor en la zona óptima según la carga
				local tRpm = engine:getMinRpm() or 800
				local mLoadPct = SHTelemetry.Telemetry.motorLoad
				if mLoadPct > 5 then
					if mLoadPct < 30 then
						-- Carga baja: Modo Eco (RPM mínimas + 200)
						tRpm = (engine:getMinRpm() or 800) + (mLoadPct / 30) * 200
					elseif mLoadPct < 85 then
						-- Carga media: Zona de Torque (1400 - 1700)
						tRpm = 1400 + ((mLoadPct - 30) / 55) * 300
					else
						-- Carga alta: Zona de Potencia (1800 - Max)
						local maxR = engine:getMaxRpm() or 2200
						tRpm = 1800 + ((mLoadPct - 85) / 15) * (maxR - 1800)
					end
				end
				SHTelemetry.Telemetry.targetRpm = tRpm

				-- Datos de rendimiento (Torque) - FS25 SDK forensic
				-- engine.motorAppliedTorque es el torque real aplicado
				local appliedTorque = engine.motorAppliedTorque or 0
				if engine.getMotorAppliedTorque ~= nil then
					appliedTorque = engine:getMotorAppliedTorque()
				end

				-- engine.motorAvailableTorque es el torque MÁXIMO posible a estas RPM (La Curva de Par)
				-- Fallback: peakMotorTorque (par nominal de placa) → mejor que usar appliedTorque
				local availableTorque = engine.motorAvailableTorque or engine.peakMotorTorque or appliedTorque
				if engine.getMotorAvailableTorque ~= nil then
					availableTorque = engine:getMotorAvailableTorque()
				end
				
				-- Convertir kN a Nm para el dashboard
				SHTelemetry.Telemetry.torqueNm = appliedTorque * 1000
				SHTelemetry.Telemetry.maxTorqueNm = availableTorque * 1000

				-- Potencia (Power) - FS25 SDK forensic
				-- En FS25: P (kW) = AppliedTorque (kN) * MotorRotSpeed (rad/s)
				local rotSpeed = engine.motorRotSpeed or 0
				local pKW = appliedTorque * rotSpeed
				
				SHTelemetry.Telemetry.powerKW = pKW
				SHTelemetry.Telemetry.powerHP = pKW * 1.35962 -- Factor oficial DIN de kW a CV (PS)

				-- Campos exclusivos de MoreRealistic: zona de potencia y RPM eco
				-- Solo disponibles si el mod MR está cargado y ha inicializado el motor
				if SHTelemetry.Telemetry.isMoreRealistic then
					if engine.mrPowerBandMinRpm ~= nil then
						SHTelemetry.Telemetry.mrPowerBandMinRpm = engine.mrPowerBandMinRpm
					end
					if engine.mrPowerBandMaxRpm ~= nil then
						SHTelemetry.Telemetry.mrPowerBandMaxRpm = engine.mrPowerBandMaxRpm
					end
					if engine.mrPeakPowerRpm ~= nil then
						SHTelemetry.Telemetry.mrPeakPowerRpm = engine.mrPeakPowerRpm
					end
					-- mrMinEcoRot está en rad/s, convertir a RPM
					if engine.mrMinEcoRot ~= nil and engine.mrMinEcoRot > 0 then
						SHTelemetry.Telemetry.mrMinEcoRpm = engine.mrMinEcoRot * 30 / math.pi
					end
				end
			end

			-- FS25: getLastSpeed() devuelve km/h directamente (NO m/s)
			local rawSpeed = vehicle:getLastSpeed()
			
			-- Lógica de dirección de movimiento de FS25:
			-- vehicle.movingDirection == 1 (adelante), -1 (atrás), 0 (quieto)
			-- Útil para detectar en qué dirección se desplaza FÍSICAMENTE el vehículo (con o sin acelerar)
			local movingDirection = vehicle.movingDirection
			
			-- Detección de reversa real (independiente de aceleración)
			-- Umbral reducido a 0.01 km/h para capturar cambios rápidos de marcha
			local isActuallyReversing = false
			if rawSpeed > 0.01 then  -- Umbral más sensible para transiciones rápidas
				if movingDirection == -1 then
					isActuallyReversing = true
				end
			end

			if isActuallyReversing then
				SHTelemetry.Telemetry.speed = -rawSpeed
				SHTelemetry.Telemetry.isReverseDriving = true
			else
				SHTelemetry.Telemetry.speed = rawSpeed
				SHTelemetry.Telemetry.isReverseDriving = false
			end

			-- Acelerador (0-100%) con múltiples fallbacks
			local acceleratorPedal = 0
			if engine ~= nil then
				-- Intento 1: lastAcceleratorPedal (disponible en la mayoría de versiones)
				acceleratorPedal = engine.lastAcceleratorPedal
				-- Intento 2: getAcceleratorPedal() si está disponible
				if acceleratorPedal == nil and engine.getAcceleratorPedal ~= nil then
					acceleratorPedal = engine:getAcceleratorPedal()
				end
				-- Intento 3: lastInputValues (algunas versiones)
				if acceleratorPedal == nil and engine.lastInputValues ~= nil then
					acceleratorPedal = engine.lastInputValues.accelerator
				end
				-- Default
				if acceleratorPedal == nil then
					acceleratorPedal = 0
				end
			end
			-- lastAcceleratorPedal es negativo en reversa (input * reverserDirection).
			-- Usar abs() para mostrar la magnitud del pedal sin importar la dirección.
			SHTelemetry.Telemetry.accelerator = math.min(100, math.abs(acceleratorPedal) * 100)

			-- isVehicleBroken: usa el mismo spec_wearable ya leído para vehicleDamageAmount.
			-- Fallback: desgaste >= 100% (wearTotalAmount >= 1)
			if wearableSpec ~= nil then
				SHTelemetry.Telemetry.isVehicleBroken = (wearableSpec.isBroken == true)
					or (SHTelemetry.Telemetry.vehicleDamageAmount >= 1.0)
			else
				SHTelemetry.Telemetry.isVehicleBroken = (SHTelemetry.Telemetry.vehicleDamageAmount >= 1.0)
			end

			-- Consumo de combustible
			-- SDK: spec_motorized.lastFuelUsage = used / dt * 1000 * 60 * 60 → L/h
			-- MR: mrLastFuelUsageS = versión suavizada (0.99/0.01) de lastFuelUsage → más estable
			-- El campo lastFuelUsage vive en spec_motorized, NO en VehicleMotor.
			local fuelUsage = spec_motorized.lastFuelUsage or 0
			if SHTelemetry.Telemetry.isMoreRealistic then
				-- MR: usar valor suavizado para evitar picos del cálculo instantáneo
				SHTelemetry.Telemetry.fuelUsage = spec_motorized.mrLastFuelUsageS or fuelUsage
			else
				-- SDK FS25: lastFuelUsage = used / dt * 1000 * 60 * 60 → ya está en L/h
				SHTelemetry.Telemetry.fuelUsage = fuelUsage
			end

		-- Temperaturas
			SHTelemetry.Telemetry.motorTemperature = motorTemperature.value
			SHTelemetry.Telemetry.motorFanEnabled = motorFan.enabled
		else
			-- ⚠️ Motor no disponible (posible cambio de marcha)
			-- Aún así capturar velocidad y acelerador del vehículo
			print("[SHTelemetry] Motor no disponible, capturando solo velocidad básica")
			
			-- Velocidad (siempre disponible desde el vehículo)
			local rawSpeed = vehicle:getLastSpeed()
			local movingDirection = vehicle.movingDirection
			
			local isActuallyReversing = false
			if rawSpeed > 0.01 then
				if movingDirection == -1 then
					isActuallyReversing = true
				end
			end
			
			if isActuallyReversing then
				SHTelemetry.Telemetry.speed = -rawSpeed
				SHTelemetry.Telemetry.isReverseDriving = true
			else
				SHTelemetry.Telemetry.speed = rawSpeed
				SHTelemetry.Telemetry.isReverseDriving = false
			end
			
			-- Acelerador desde spec_motorized.motor (lastAcceleratorPedal vive en VehicleMotor)
			local acceleratorPedal = 0
			if vehicle.spec_motorized ~= nil and vehicle.spec_motorized.motor ~= nil
				and vehicle.spec_motorized.motor.lastAcceleratorPedal ~= nil then
				acceleratorPedal = vehicle.spec_motorized.motor.lastAcceleratorPedal
			end
			-- lastAcceleratorPedal es negativo en reversa (input * reverserDirection).
			-- Usar abs() para mostrar la magnitud del pedal sin importar la dirección.
			SHTelemetry.Telemetry.accelerator = math.min(100, math.abs(acceleratorPedal) * 100)
			SHTelemetry.Telemetry.rpm = 0  -- Sin motor, RPM es 0
			SHTelemetry.Telemetry.motorLoad = 0
		end
		-- Posiciones
		SHTelemetry.Telemetry.vehicleComponents = {}
		if not vehicle.isBroken then
			for k, component in ipairs(vehicle.components) do
				local nodeData = {}
				local angularVelocityX, angularVelocityY, angularVelocityZ = getAngularVelocity(component.node)
				nodeData.angularVelocityX = angularVelocityX
				nodeData.angularVelocityY = angularVelocityY
				nodeData.angularVelocityZ = angularVelocityZ

				local linearVelocityX, linearVelocityY, linearVelocityZ = getLinearVelocity(component.node)
				nodeData.linearVelocityX = linearVelocityX
				nodeData.linearVelocityY = linearVelocityY
				nodeData.linearVelocityZ = linearVelocityZ

				local worldTranslationX, worldTranslationY, worldTranslationZ = getWorldTranslation(component.node)
				nodeData.worldTranslationX = worldTranslationX
				nodeData.worldTranslationY = worldTranslationY
				nodeData.worldTranslationZ = worldTranslationZ

				local qx, qy, qz, qw = getQuaternion(component.node)
				nodeData.quaternionX = qx
				nodeData.quaternionY = qy
				nodeData.quaternionZ = qz
				nodeData.quaternionW = qw

				SHTelemetry.Telemetry.vehicleComponents[k] = nodeData
		
			end
		end
		
		-- Capturar datos extendidos (MoreRealistic_FS25, posición, ruedas, etc.)
		if SHTelemetry.captureExtendedData ~= nil then
			pcall(function()
				SHTelemetry:captureExtendedData(vehicle, SHTelemetry.Telemetry)
			end)
		end
	else
		SHTelemetry.Telemetry.isInVehicle = false
	end

	local ok, res = pcall(encode, SHTelemetry.Telemetry)
	if not ok then
		print("[SHTelemetry] Error encoding telemetry: " .. tostring(res))
		return
	end
	if SHTelemetry.Context.shfile ~= nil then
		pcall(function()
			SHTelemetry.Context.shfile:write(res .. "\n")
			SHTelemetry.Context.shfile:flush()
		end)
	end
end

function SHTelemetry:getVehicleFuelLevelAndCapacity(vehicle)
	local fuelFillType = vehicle:getConsumerFillUnitIndex(FillType.DIESEL)
	local level = vehicle:getFillUnitFillLevel(fuelFillType)
	local capacity = vehicle:getFillUnitCapacity(fuelFillType)

	return level, capacity
end

function SHTelemetry:update(dt)
	SHTelemetry.Context.UpdateDt = SHTelemetry.Context.UpdateDt + dt
	SHTelemetry.Context.CumulatedDt = SHTelemetry.Context.CumulatedDt + dt

	-- 33ms = ~30Hz. El juego corre a 60fps (dt≈16ms), con 10ms buildTelemetry()
	-- se ejecutaba en CADA frame. 33ms lo reduce a ~2 frames → mitad de carga en Lua.
	-- Para un tractor agrícola 30Hz es más que suficiente (el estado cambia cada 50-200ms).
	if SHTelemetry.Context.UpdateDt >= 33 then
		local telemetryDt = SHTelemetry.Context.UpdateDt
		SHTelemetry.Context.UpdateDt = 0
		-- Init file
		self:initPipe(dt)

		-- If pipe is ready
		if SHTelemetry.Context.shfile ~= nil then
			self:buildTelemetry(telemetryDt)
		end
	end
end

-------------------- JSON ----------------------
-------------------------------------------------
-------------------------------------------------

-------------------------------------------------------------------------------
-- Codificar
-------------------------------------------------------------------------------

local escape_char_map = {
	["\\"] = "\\",
	['"'] = '"',
	["\b"] = "b",
	["\f"] = "f",
	["\n"] = "n",
	["\r"] = "r",
	["\t"] = "t",
}

local escape_char_map_inv = { ["/"] = "/" }
for k, v in pairs(escape_char_map) do
	escape_char_map_inv[v] = k
end

local function escape_char(c)
	return "\\" .. (escape_char_map[c] or string.format("u%04x", c:byte()))
end

local function encode_nil(val)
	return "null"
end

local function encode_table(val, stack)
	local res = {}
	stack = stack or {}

	-- ¿Referencia circular?
	if stack[val] then
		error("circular reference")
	end

	stack[val] = true

	if rawget(val, 1) ~= nil or next(val) == nil then
		-- Tratar como array -- verificar que las claves sean válidas y que no sea esparcido
		local n = 0
		for k in pairs(val) do
			if type(k) ~= "number" then
				error("invalid table: mixed or invalid key types")
			end
			n = n + 1
		end
		if n ~= #val then
			error("invalid table: sparse array")
		end
		-- Codificar elementos
		for i, v in ipairs(val) do
			table.insert(res, encode(v, stack))
		end
		stack[val] = nil
		return "[" .. table.concat(res, ",") .. "]"
	else
		-- Tratar como un objeto
		for k, v in pairs(val) do
			if type(k) ~= "string" then
				error("invalid table: mixed or invalid key types")
			end
			table.insert(res, encode(k, stack) .. ":" .. encode(v, stack))
		end
		stack[val] = nil
		return "{" .. table.concat(res, ",") .. "}"
	end
end

local function encode_string(val)
	return '"' .. val:gsub('[%z\1-\31\\"]', escape_char) .. '"'
end

local function encode_number(val)
	-- Comprobar NaN, -inf e inf
	if val ~= val or val <= -math.huge or val >= math.huge then
		error("unexpected number value '" .. tostring(val) .. "'")
	end
	return string.format("%.14g", val)
end

local type_func_map = {
	["nil"] = encode_nil,
	["table"] = encode_table,
	["string"] = encode_string,
	["number"] = encode_number,
	["boolean"] = tostring,
}

encode = function(val, stack)
	local t = type(val)
	local f = type_func_map[t]
	if f then
		return f(val, stack)
	end
	error("unexpected type '" .. t .. "'")
end

-------------------------------------------------
-------------------------------------------------
-------------------------------------------------
-------------------------------------------------
-------------------------------------------------

-- Las extensiones se cargarán en el primer update() cuando g_currentMission esté disponible
addModEventListener(SHTelemetry)
