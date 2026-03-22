/**
 * Telemetry Client Module
 * Handles WebSocket connection and telemetry data reception
 */

class TelemetryClient {
  constructor() {
    this.socket = null;
    this.connected = false;
    this.dataCallbacks = [];
    this.reconnectInterval = 5000;
    
    this.init();
  }

  /**
   * Initialize socket connection
   */
  init() {
    try {
      // Connect to WebSocket server on /telemetry namespace
      this.socket = io('/telemetry', {
        reconnection: true,
        reconnectionDelay: this.reconnectInterval,
        reconnectionDelayMax: 10000,
        reconnectionAttempts: 10
      });

      this.setupListeners();
    } catch (error) {
      console.error('Failed to initialize telemetry client:', error);
      this.handleConnectionError();
    }
  }

  /**
   * Setup socket event listeners
   */
  setupListeners() {
    this.socket.on('connect', () => {
      console.log('Connected to telemetry server');
      this.connected = true;
      this.updateConnectionStatus(true);
    });

    this.socket.on('disconnect', () => {
      console.log('Disconnected from telemetry server');
      this.connected = false;
      this.updateConnectionStatus(false);
    });

    this.socket.on('telemetry', (data) => {
      this.handleTelemetryData(data);
    });

    this.socket.on('error', (error) => {
      console.error('Socket error:', error);
      this.handleConnectionError();
    });

    this.socket.on('connect_error', (error) => {
      console.error('Connection error:', error);
      this.updateConnectionStatus(false);
    });
  }

  /**
   * Handle incoming telemetry data
   * @param {object} data - Raw telemetry data from server
   */
  handleTelemetryData(data) {
    // Parse and normalize telemetry data
    const normalizedData = this.normalizeTelemetryData(data);

    // Execute all registered callbacks
    this.dataCallbacks.forEach(callback => {
      try {
        callback(normalizedData);
      } catch (error) {
        console.error('Error in telemetry callback:', error);
      }
    });
  }

  /**
   * Normalize telemetry data from various sources
   * @param {object} data - Raw telemetry data
   * @returns {object} Normalized data
   */
  normalizeTelemetryData(data) {
    return {
      // Engine data - PRIMERO busca nombres backend (rpm, engineLoad, consumption)
      engineSpeed: data.rpm !== undefined ? data.rpm : (data.engineSpeed || data.motorRpm || 0),
      motorTorque: data.torque !== undefined ? data.torque : (data.motorTorque || 0),
      maxTorqueNm: data.maxTorqueNm !== undefined ? data.maxTorqueNm : 0,
      powerKW: data.powerKW !== undefined ? data.powerKW : 0,
      powerHP: (data.powerKW !== undefined ? data.powerKW : 0) * 1.35962,
      vehicleName: data.vehicleName || '',
      motorLoad: data.engineLoad !== undefined ? data.engineLoad : (data.motorLoad || data.load || 0),
      accelerator: data.accelerator !== undefined ? data.accelerator : (data.throttle || data.accel || data.motorLoad || 0),
      motorTemperature: data.temperature !== undefined ? data.temperature : (data.motorTemperature || data.engineTemp || 20),
      // Lua siempre envía fuelUsage ya en L/h (MR directo, vainilla ×3600 en Lua)
      fuelUsagePerHour: data.consumption !== undefined ? data.consumption : (data.fuelUsagePerHour || 0),
      fuelPercentage: data.fuelLevel !== undefined ? data.fuelLevel : (data.fuelPercentage || 100),
      fuelLiters:       data.fuelLiters    || 0,
      fuelCapacity:     data.fuelCapacity  || 0,
      // Vehicle data
      speed: data.speed || data.velocity || 0,
      currentGear: data.gear || data.currentGear || 'N',
      gearGroupName: data.gearGroupName || '',

      // Implement data
      implementsAttached: data.implementsAttached || false,
      implementLowered: data.implementLowered || false,
      implementWorking: data.implementWorking || false,
      mrAvgDrivenWheelsSlip: data.mrAvgDrivenWheelsSlip || data.wheelSlip?.[0] || 0,

      // Terrain data
      pitch: data.pitch || data.vehicleWorldXRot || 0,
      roll: data.roll || data.vehicleWorldZRot || 0,

      // Damage: solo el daño físico del motor/vehículo (vehicleDamageAmount)
      // vehicleWearAmount es desgaste acumulado de uso, se muestra en otras tarjetas separadas
      tractorDamage: data.tractorDamage !== undefined
        ? data.tractorDamage
        : (data.vehicleDamageAmount !== undefined
            ? (data.vehicleDamageAmount > 0 && data.vehicleDamageAmount < 1 ? data.vehicleDamageAmount * 100 : data.vehicleDamageAmount)
            : 0),
      isVehicleBroken: data.isVehicleBroken || false,

      // MR power band + ECO/peak
      mrPowerBandMinRpm: data.mrPowerBandMinRpm || 0,
      mrPowerBandMaxRpm: data.mrPowerBandMaxRpm || 0,
      mrPeakPowerRpm:    data.mrPeakPowerRpm    || 0,
      mrMinEcoRpm:       data.mrMinEcoRpm       || 0,

      // Motor RPM range
      minRpm: data.minRpm || 0,
      maxRpm: data.maxRpm || 0,

      // Transmission type detected in Lua
      transmissionType: data.transmissionType || 'manual',

      // Masa real del vehículo y tren (toneladas, 0 = sin datos)
      vehicleMassT:   data.vehicleMassT   || 0,
      implementMassT: data.implementMassT || 0,
      totalMassT:     data.totalMassT     || 0,

      // Wheel traction (captureWheelData)
      driveType:     data.driveType     || '4WD',
      wheelTraction: (data.wheelTraction || []).map((w, idx) => {
        const pos = ['FL','FR','RL','RR'][idx] || w?.position || '?';
        return {
          position:     w?.position     ?? pos,
          motorized:    w?.motorized    ?? true,
          torquePercent:w?.torquePercent ?? 0,
          slip:         w?.slip         ?? 0,
          speedMs:      w?.speedMs      ?? 0,
          contact:      w?.contact      ?? false,
          tireLoadKN:   w?.tireLoadKN   ?? null,
          longSlip:     w?.longSlip     ?? null,
          latSlip:      w?.latSlip      ?? null,
          groundType:   w?.groundType   ?? null
        };
      }).concat(
        // Garantizar siempre 4 ruedas aunque lleguen menos
        Array.from({length: Math.max(0, 4 - (data.wheelTraction?.length || 0))},
          (_, i) => {
            const pos = ['FL','FR','RL','RR'][i + (data.wheelTraction?.length || 0)];
            return { position: pos, motorized: true, torquePercent: 0, slip: 0,
                     speedMs: 0, contact: false, tireLoadKN: null, longSlip: null,
                     latSlip: null, groundType: null };
          })
      ).slice(0, 4),


      // Engine state
      isMotorStarted: data.isMotorStarted || false,

      // Connection info
      isRealData: data.isRealData || false,

      // Timestamp
      timestamp: data.timestamp || Date.now(),

      // Raw data fallback
      raw: data
    };
  }

  /**
   * Register callback for telemetry updates
   * @param {function} callback - Function to call with telemetry data
   */
  onTelemetry(callback) {
    if (typeof callback === 'function') {
      this.dataCallbacks.push(callback);
    }
  }

  /**
   * Handle connection errors
   */
  handleConnectionError() {
    console.warn('Telemetry connection error - dashboard is waiting for FS25 data');
    this.updateConnectionStatus(false);
  }

  /**
   * Update connection status indicator
   * @param {boolean} connected - Is connected
   */
  updateConnectionStatus(connected) {
    const statusDot = document.querySelector('.status-dot');
    const statusText = document.getElementById('connection-status');
    const bottomStatus = document.getElementById('bottom-status');
    
    if (statusDot) {
      statusDot.style.background = connected ? '#a8ff3e' : '#ff4466';
      statusDot.style.animation = connected ? 'blink 1s ease-in-out infinite' : 'none';
    }

    if (statusText) {
      statusText.textContent = connected ? 'FS25 CONNECTED' : 'Esperando FS25';
      statusText.style.color = connected ? 'var(--lime)' : 'var(--red)';
    }

    if (bottomStatus) {
      bottomStatus.textContent = connected ? '● Connected' : '● Waiting';
      bottomStatus.style.color = connected ? 'var(--lime)' : 'var(--red)';
    }
  }

  /**
   * Send command to server
   * @param {string} command - Command name
   * @param {object} params - Command parameters
   */
  sendCommand(command, params = {}) {
    if (this.socket && this.connected) {
      this.socket.emit(command, params);
    } else {
      console.warn('Socket not connected, cannot send command:', command);
    }
  }

  /**
   * Disconnect socket
   */
  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.connected = false;
      this.updateConnectionStatus(false);
    }
  }
}

// Create global telemetry client instance
window.telemetryClient = new TelemetryClient();

// Connect telemetry to dashboard updates - Esperar a que dashboard esté disponible
window.telemetryClient.onTelemetry((data) => {
  // Esperar dinámicamente a que dashboard esté disponible
  if (window.dashboard) {
    window.dashboard.updateTelemetry(data);
  } else {
    // Si dashboard no existe aún, esperar y reintentar
    setTimeout(() => {
      if (window.dashboard) {
        window.dashboard.updateTelemetry(data);
      }
    }, 500);
  }
});
