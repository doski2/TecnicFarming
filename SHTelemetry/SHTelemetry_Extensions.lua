--
-- SHTelemetry - Extensiones para capturar datos adicionales
-- Soporte para MoreRealistic_FS25 y otros mods
-- 
-- Este archivo contiene funciones para capturar datos extendidos
-- del vehículo cuando estén disponibles en mods instalados.
--

-- ============================================================================
-- FUNCIÓN GENÉRICA PARA DESCUBRIR SPECS DISPONIBLES
-- ============================================================================

function SHTelemetry:discoverAvailableSpecs(vehicle, telemetry)
	if vehicle == nil then return end
	
	-- Iterar sobre todas las specs disponibles en el vehículo
	for specName, specData in pairs(vehicle) do
		-- Solo procesar specs (comienzan con "spec_")
		if type(specName) == "string" and string.sub(specName, 1, 5) == "spec_" then
			-- Crear una sección en telemetry para cada spec
			local specKey = string.sub(specName, 6) -- Remover "spec_"
			
			-- Buscar datos numerables en cada spec
			if type(specData) == "table" then
				for dataKey, dataValue in pairs(specData) do
					-- Solo incluir valores numéricos y booleanos (evitar funciones y tablas complejas)
					if type(dataValue) == "number" or type(dataValue) == "boolean" then
						local fullKey = "spec_" .. specKey .. "_" .. dataKey
						telemetry[fullKey] = dataValue
					end
				end
			end
		end
	end
end

-- ============================================================================
-- CAPTURA EXTENDIDA DE POSICIÓN Y ROTACIÓN
-- ============================================================================

function SHTelemetry:captureVehiclePositionAndRotation(vehicle, telemetry)
	if vehicle == nil or vehicle.rootNode == nil then return end
	
	-- Posición global del vehículo
	local x, y, z = getWorldTranslation(vehicle.rootNode)
	telemetry.vehiclePositionX = x
	telemetry.vehiclePositionY = y
	telemetry.vehiclePositionZ = z
	
	-- Rotación bruta del vehículo (reservada para referencia, NO usar para pitch/roll)
	local rx, ry, rz = getWorldRotation(vehicle.rootNode)
	telemetry.vehicleRotationX = rx
	telemetry.vehicleRotationY = ry
	telemetry.vehicleRotationZ = rz

	-- Pitch y Roll CORRECTOS: extraídos de los ejes locales del vehículo proyectados
	-- al espacio mundial. Este método es inmune al giro (yaw) del vehículo.
	--
	-- PITCH: proyectar el eje "adelante" local (0,0,1) al mundo.
	--   La componente Y del vector resultante = seno(pitch).
	--   Positivo = subiendo cuesta adelante. Negativo = bajando.
	local fdx, fdy, fdz = localDirectionToWorld(vehicle.rootNode, 0, 0, 1)
	local pitchRad = math.asin(math.max(-1.0, math.min(1.0, fdy)))
	telemetry.pitch = math.deg(pitchRad)

	-- ROLL: proyectar el eje "derecha" local (1,0,0) al mundo.
	--   La componente Y del vector resultante = seno(roll).
	--   Positivo = lado derecho más alto. Negativo = lado izquierdo más alto.
	local rdx, rdy, rdz = localDirectionToWorld(vehicle.rootNode, 1, 0, 0)
	local rollRad = math.asin(math.max(-1.0, math.min(1.0, rdy)))
	telemetry.roll = math.deg(rollRad)
	
	-- Velocidad en km/h (getLastSpeed() ya retorna km/h en FS25)
	telemetry.speedKmh = math.max(0, vehicle:getLastSpeed())
end

-- ============================================================================
-- CAPTURA DE CARGA DE TRABAJO (IMPLEMENT USAGE)
-- ============================================================================

function SHTelemetry:captureWorkData(vehicle, telemetry)
	if vehicle == nil then return end
	
	-- Buscar implementos acoplados
	-- SDK AttacherJoints.lua: spec.attachedImplements = {} (línea 458); implement.object ~= nil si hay acoplado
	if vehicle.spec_attacherJoints ~= nil then
		local attachedImplements = vehicle.spec_attacherJoints.attachedImplements
		telemetry.implementsAttached = 0
		
		if attachedImplements ~= nil then
			for _, implement in ipairs(attachedImplements) do
				if implement.object ~= nil then
					telemetry.implementsAttached = telemetry.implementsAttached + 1
				end
			end
		end
	end
	
	-- Buscar datos de trabajo (si existen spec_cylindered, spec_sprayer, etc.)
	if vehicle.spec_cylindered ~= nil then
		local spec = vehicle.spec_cylindered
		if spec.currentLiters ~= nil and spec.capacity ~= nil then
			telemetry.cylinderCurrentLiters = spec.currentLiters
			telemetry.cylinderCapacity = spec.capacity
			if spec.capacity > 0 then
				telemetry.cylinderFillPercentage = (spec.currentLiters / spec.capacity) * 100
			end
		end
	end
end

-- ============================================================================
-- CAPTURA DE DATOS DE RUEDAS Y SUSPENSIÓN
-- ============================================================================

function SHTelemetry:captureWheelData(vehicle, telemetry)
	if vehicle == nil or vehicle.spec_wheels == nil then return end

	local spec_wheels    = vehicle.spec_wheels
	local spec_motorized = vehicle.spec_motorized
	telemetry.wheelCount = 0

	-- Inicializar array de tracción (4 ruedas: FL, FR, RL, RR)
	telemetry.wheelTraction = {
		{ position = "FL", motorized = false, torquePercent = 0, slip = 0, speedMs = 0, contact = false },
		{ position = "FR", motorized = false, torquePercent = 0, slip = 0, speedMs = 0, contact = false },
		{ position = "RL", motorized = false, torquePercent = 0, slip = 0, speedMs = 0, contact = false },
		{ position = "RR", motorized = false, torquePercent = 0, slip = 0, speedMs = 0, contact = false }
	}

	-- ================================================================
	-- PASO 1: Detectar ruedas motorizadas desde los diferenciales
	-- FS25 SDK usa diffIndex1/diffIndex2 + diffIndex1IsWheel/diffIndex2IsWheel
	-- para identificar si el extremo del diferencial es una rueda (true)
	-- o un sub-diferencial (false)
	-- ================================================================
	local motorizedWheelIndices = {}

	if spec_motorized ~= nil and spec_motorized.differentials ~= nil then
		for _, diff in ipairs(spec_motorized.differentials) do
			-- Formato oficial FS25: diffIndex1 + diffIndex1IsWheel
			if diff.diffIndex1IsWheel and diff.diffIndex1 ~= nil then
				motorizedWheelIndices[diff.diffIndex1] = true
			end
			if diff.diffIndex2IsWheel and diff.diffIndex2 ~= nil then
				motorizedWheelIndices[diff.diffIndex2] = true
			end
			-- Fallback: formatos alternativos encontrados en mods
			if diff.wheelIndex ~= nil then
				motorizedWheelIndices[diff.wheelIndex] = true
			end
			if diff.leftWheelIndex ~= nil then
				motorizedWheelIndices[diff.leftWheelIndex] = true
			end
			if diff.rightWheelIndex ~= nil then
				motorizedWheelIndices[diff.rightWheelIndex] = true
			end
		end
	end

	-- Fallback por driveMode por rueda (algunos builds de FS25)
	if spec_wheels.wheels ~= nil then
		for i, wheel in ipairs(spec_wheels.wheels) do
			if wheel.driveMode ~= nil and wheel.driveMode ~= 0 then
				motorizedWheelIndices[i] = true
			end
		end
	end

	-- Fallback final: si hay motor pero no se detectó ningún índice,
	-- marcar las 4 primeras ruedas (tractor estándar 4WD)
	if spec_motorized ~= nil and next(motorizedWheelIndices) == nil then
		for i = 1, math.min(4, spec_wheels.wheels and #spec_wheels.wheels or 4) do
			motorizedWheelIndices[i] = true
		end
	end

	-- ================================================================
	-- PASO 2: Torque del motor como señal global de respaldo
	-- motorLoad (confirmado funcional: activa el flash rojo) = carga aplicada en %.
	-- Se refina con torqueNm/maxTorqueNm si ambos están disponibles.
	-- ================================================================
	local motor          = spec_motorized ~= nil and spec_motorized.motor or nil
	local motorTorquePct = math.max(0, math.min(100, telemetry.motorLoad or 0))

	local tNm  = telemetry.torqueNm  or 0
	local tMax = telemetry.maxTorqueNm or 0
	-- peakTorq en kN·m: usado como referencia en PASO 3 si wheel.physics.torque existe
	local peakTorq = (motor and motor.peakMotorTorque) or (tMax > 0 and tMax / 1000 or 1.0)
	if peakTorq <= 0 then peakTorq = 1.0 end
	if tMax > 0 and tNm > 0 then
		-- Ratio más preciso cuando el main Lua capturó ambos valores
		motorTorquePct = math.max(0, math.min(100, math.abs(tNm) / tMax * 100))
	end

	-- ================================================================
	-- PASO 3: Recorrer ruedas y capturar todos los datos disponibles
	-- ================================================================
	if spec_wheels.wheels ~= nil then
		for i, wheel in ipairs(spec_wheels.wheels) do
			telemetry.wheelCount = telemetry.wheelCount + 1

			-- Presión y desgaste (disponibles en FS25 con neumáticos opcionales)
			if wheel.tirePressure ~= nil then
				telemetry["wheel_" .. i .. "_pressure"] = wheel.tirePressure
			end
			if wheel.tireWear ~= nil then
				telemetry["wheel_" .. i .. "_wear"] = wheel.tireWear
			end

			if i <= 4 then
				local wt  = telemetry.wheelTraction[i]
				local ph  = wheel.physics

				-- ── Detección de rueda motorizada ─────────────────────────
				-- Prioridad: mrIsDriven de MR (más fiable) > índices de diferencial
				local isMotorized
				if ph ~= nil and ph.mrIsDriven ~= nil then
					isMotorized = ph.mrIsDriven
				else
					isMotorized = motorizedWheelIndices[i] or false
				end
				wt.motorized = isMotorized

				-- ── Slip por rueda ────────────────────────────────────────
				wt.slip = 0

				-- ── Velocidad de rueda [m/s] ───────────────────────────────
				local spd = 0
				if ph ~= nil and ph.rotSpeed ~= nil and ph.radius ~= nil then
					spd = ph.rotSpeed * ph.radius
				end
				wt.speedMs = math.abs(spd)

				-- ── Contacto con el suelo ──────────────────────────────────
				if ph ~= nil then
					wt.contact = (ph.hasGroundContact == true)
				end

				-- ── Torque por rueda ───────────────────────────────────────
				-- ph.torque existe en FS25 pero siempre es 0.0 (non-nil): no usarlo.
				-- MR tampoco expone torque individual. Usar la carga global del motor.
				if isMotorized then
					wt.torquePercent = motorTorquePct
				end

				-- ================================================================
				-- CAMPOS EXCLUSIVOS DE MOREALISTIC_FS25
				-- ================================================================
				if ph ~= nil then

					-- Carga de neumático en KN (peso distribuido sobre esta rueda)
					-- mrLastTireLoadS = versión suavizada (0.99/0.01) → distribución TRQ más estable
					if ph.mrLastTireLoadS ~= nil then
						wt.tireLoadKN = ph.mrLastTireLoadS
					elseif ph.mrLastTireLoad ~= nil then
						wt.tireLoadKN = ph.mrLastTireLoad
					end

					-- Slip longitudinal MR (más preciso que netInfo.slip)
					-- Positivo = tracción hacia adelante, negativo = bloqueo de freno
					if ph.mrLastLongSlip ~= nil then
						wt.longSlip = math.abs(ph.mrLastLongSlip)
					end

					-- Slip lateral MR (derrape en curva)
					-- 0 = recto, valores altos = derrapando en curva
					if ph.mrLastLatSlip ~= nil then
						wt.latSlip = math.abs(ph.mrLastLatSlip)
					end

					-- Tipo de suelo bajo esta rueda (MR)
					-- Usar las constantes WheelsUtil.GROUND_* directamente, igual que MR,
					-- en lugar de números hardcodeados cuyos valores son opacos.
					if ph.mrLastGroundType ~= nil then
						local gt = ph.mrLastGroundType
						if     gt == WheelsUtil.GROUND_FIELD        then wt.groundType = "FIELD"
						elseif gt == WheelsUtil.GROUND_SOFT_TERRAIN then wt.groundType = "SOFT"
						elseif gt == WheelsUtil.GROUND_HARD_TERRAIN then wt.groundType = "HARD"
						elseif gt == WheelsUtil.GROUND_ROAD         then wt.groundType = "ROAD"
						end
					end

					-- Resistencia a la rodadura MR (factor compuesto: presión + humedad + tipo suelo)
					-- 1.0 = sin resistencia (asfalto seco), >1 = mayor resistencia (campo húmedo)
					if ph.mrLastRrFx ~= nil then
						wt.rrFx = ph.mrLastRrFx
					end

					-- Factor de presión del neumático MR (NUEVO en MR 0.26.03.25)
					-- Refleja cuánto se "hunde" el neumático por la carga (presión suelo/neumático)
					-- Valores altos = más hundimiento = más resistencia a la rodadura en campo
					if ph.mrLastPressureFx ~= nil then
						wt.pressureFx = ph.mrLastPressureFx
					end

					-- MR driven detection: ya aplicado antes del cálculo de torque

					-- Fallback vanilla FS25: si MR no asignó ground type,
					-- estimar usando densityType (campo ≠ 0) y groundDepth
					if wt.groundType == nil then
						-- densityType ~= 0 = rueda sobre terreno de campo (cultivado, sembrado, etc.)
						if ph.densityType ~= nil and ph.densityType ~= 0 then
							wt.groundType = "FIELD"
						elseif ph.groundDepth ~= nil then
							if     ph.groundDepth >= 0.8 then wt.groundType = "SOFT"
							elseif ph.groundDepth >= 0.1 then wt.groundType = "HARD"
							else                              wt.groundType = "ROAD"
							end
						end
					end
				end
			end
		end
	end

	-- ================================================================
	-- PASO 4: Determinar driveType
	-- Si MR está activo y mrIsDriven está disponible, usarlo directamente
	-- (resultado más fidedigno que la detección por índices de diferencial)
	-- ================================================================
	local useMrDriven = false
	if vehicle.mrIsMrVehicle and spec_wheels.wheels ~= nil then
		local frontDriven = false
		local rearDriven  = false
		for i, wheel in ipairs(spec_wheels.wheels) do
			if wheel.physics ~= nil and wheel.physics.mrIsDriven ~= nil then
				useMrDriven = true
				if i <= 2 and wheel.physics.mrIsDriven then frontDriven = true end
				if i >= 3 and wheel.physics.mrIsDriven then rearDriven  = true end
			end
		end
		if useMrDriven then
			if frontDriven and rearDriven then
				telemetry.driveType = "4WD"
			elseif frontDriven then
				telemetry.driveType = "FWD"
			elseif rearDriven then
				telemetry.driveType = "RWD"
			else
				telemetry.driveType = "2WD"
			end
		end
	end

	if not useMrDriven then
		-- Fallback: índices de diferencial resueltos en PASO 1
		local frontMotorized = motorizedWheelIndices[1] or motorizedWheelIndices[2] or false
		local rearMotorized  = motorizedWheelIndices[3] or motorizedWheelIndices[4] or false

		if frontMotorized and rearMotorized then
			telemetry.driveType = "4WD"
		elseif frontMotorized then
			telemetry.driveType = "FWD"
		elseif rearMotorized then
			telemetry.driveType = "RWD"
		else
			telemetry.driveType = (spec_motorized ~= nil) and "4WD" or "2WD"
		end
	end

	-- ================================================================
	-- PASO 5: Redistribuir torque por rueda según peso real (mrLastTireLoad)
	-- motorTorquePct es global → cada rueda recibe proporcionalmente a su carga
	-- Ruedas traseras trasladadas de carga (campo con tiro) → más TRQ visualizado
	-- Solo aplica cuando MR reporta tireLoadKN para al menos 2 ruedas driven
	-- ================================================================
	if motorTorquePct > 0 then
		local totalDrivenLoad = 0
		local nDriven         = 0
		for i = 1, 4 do
			local wt = telemetry.wheelTraction[i]
			if wt.motorized then
				nDriven = nDriven + 1
				if wt.tireLoadKN ~= nil then
					totalDrivenLoad = totalDrivenLoad + wt.tireLoadKN
				end
			end
		end
		-- Solo redistribuir si tenemos carga real de MR; si no, dejar motorTorquePct igual para todas
		if totalDrivenLoad > 0 and nDriven > 0 then
			local avgLoad = totalDrivenLoad / nDriven
			for i = 1, 4 do
				local wt = telemetry.wheelTraction[i]
				if wt.motorized and wt.tireLoadKN ~= nil then
					-- ratio > 1 → rueda más cargada → más TRQ; ratio < 1 → menos TRQ
					local ratio = wt.tireLoadKN / avgLoad
					wt.torquePercent = math.max(0, math.min(100, motorTorquePct * ratio))
				end
			end
		end
	end
end



-- ============================================================================
-- FUNCIÓN PRINCIPAL: CAPTURAR TODAS LAS EXTENSIONES
-- ============================================================================

function SHTelemetry:captureExtendedData(vehicle, telemetry)
	if vehicle == nil then return end
	
	-- Intentar capturar datos de cada extensión
	-- Usar pcall para evitar errores si algo falla
	
	pcall(function()
		SHTelemetry:captureVehiclePositionAndRotation(vehicle, telemetry)
	end)
	
	pcall(function()
		SHTelemetry:captureWorkData(vehicle, telemetry)
	end)
	
	pcall(function()
		SHTelemetry:captureWheelData(vehicle, telemetry)
	end)
	
	-- Descubrimiento genérico (comentado por defecto ya que puede ser verboso)
	-- pcall(function()
	--    SHTelemetry:discoverAvailableSpecs(vehicle, telemetry)
	-- end)
end

--
-- CÓMO USAR ESTE ARCHIVO:
--
-- 1. Incluir al principio de SHTelemetry.lua:
--    dofile(g_currentMission:getModDirectory() .. "SHTelemetry_Extensions.lua")
--
-- 2. Llamar en la función buildTelemetry() después de capturar datos básicos:
--    SHTelemetry:captureExtendedData(vehicle, SHTelemetry.Telemetry)
--
-- 3. Para activar el descubrimiento genérico descomenta la línea dentro de
--    captureExtendedData() si necesitas depurar nuevos mods
--
-- NOTAS:
-- - Los nombres de las specs varían según la versión del juego
-- - Algunos mods pueden no estar disponibles siempre
-- - El descubrimiento genérico puede generar muchos datos
--
