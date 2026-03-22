import net from 'net';

/**
 * Servicio de Telemetría - Servidor TCP
 * 
 * Arquitectura:
 * SHTelemetry (Lua mod) --TCP--> localhost:9000 --> TelemetryService
 * 
 * El mod envía datos JSON línea por línea
 */
export default class TelemetryService {
  constructor(logger) {
    this.logger = logger;
    this.tcpPort = parseInt(process.env.TELEMETRY_PORT) || 9000;
    this.server = null;
    this.currentClient = null;
    this.updateCallback = null;
    this.isConnected = false;
    this.isRealData = false;
    this.updateInterval = parseInt(process.env.UPDATE_FREQUENCY_MS) || 16.66;
    this.clientCount = 0;
    this.buffer = '';
    this.pendingObject = '';
    
    // Datos actuales
    this.currentData = {
      rpm: 0,
      consumption: 0,
      torque: 0,
      maxTorqueNm: 0,
      powerKW: 0,
      engineLoad: 0,
      accelerator: 0,
      speed: 0,
      gear: 0,
      gearGroupName: '',
      temperature: 0,
      fuelLevel: 0,
      fuelLiters: 0,
      fuelCapacity: 0,
      vehicleName: '',
      pitch: 0,
      roll: 0,
      driveType: '4WD',
      wheelTraction: [
        { position: 'FL', motorized: true,  torquePercent: 0, slip: 0, speedMs: 0, contact: false, tireLoadKN: null, longSlip: null, latSlip: null, groundType: null },
        { position: 'FR', motorized: true,  torquePercent: 0, slip: 0, speedMs: 0, contact: false, tireLoadKN: null, longSlip: null, latSlip: null, groundType: null },
        { position: 'RL', motorized: true,  torquePercent: 0, slip: 0, speedMs: 0, contact: false, tireLoadKN: null, longSlip: null, latSlip: null, groundType: null },
        { position: 'RR', motorized: true,  torquePercent: 0, slip: 0, speedMs: 0, contact: false, tireLoadKN: null, longSlip: null, latSlip: null, groundType: null }
      ],

      mrPowerBandMinRpm: 0,
      mrPowerBandMaxRpm: 0,
      mrPeakPowerRpm: 0,
      mrMinEcoRpm: 0,
      minRpm: 0,
      maxRpm: 0,
      vehicleMassT: 0,
      implementMassT: 0,
      totalMassT: 0,
      tractorDamage: 0,
      isVehicleBroken: false,
      isMotorStarted: false,
      transmissionType: 'manual',
      timestamp: Date.now()
    };
  }

  /**
   * Iniciar servidor de Named Pipe
   */
  startCollecting(callback) {
    this.updateCallback = callback;
    this.isConnected = false;
    this.isRealData = false;

    try {
      // IMPORTANTE: En Windows, Node.js puede escuchar en Named Pipes directamente
      // El pipeName debe ser: \\\\.\\pipe\\NOMBRE (escapado correctamente)
      const pipeName = '\\\\.\\pipe\\SHTelemetry';
      
      this.server = net.createServer((socket) => {
        this.clientCount++;
        const clientId = this.clientCount;

        this.logger.info(`✓ SHTelemetry conectado a Named Pipe (cliente #${clientId})`);
        this.currentClient = socket;
        this.isConnected = true;
        this.isRealData = true;
        this.buffer = '';
        this.pendingObject = '';

        // Recibir datos línea por línea
        socket.on('data', (chunk) => {
          try {
            this.handleData(chunk.toString());
          } catch (err) {
            this.logger.error(`Error procesando datos: ${err.message}`);
          }
        });

        socket.on('end', () => {
          this.logger.warn(`✗ SHTelemetry desconectado (cliente #${clientId})`);
          if (this.currentClient === socket) {
            this.currentClient = null;
          }
          this.isConnected = false;
          this.isRealData = false;
        });

        socket.on('error', (err) => {
          this.logger.error(`Error socket: ${err.message}`);
          if (this.currentClient === socket) {
            this.currentClient = null;
          }
          this.isConnected = false;
          this.isRealData = false;
        });
      });

      // Manejar errores del servidor
      this.server.on('error', (err) => {
        this.logger.error(`Error servidor Named Pipe: ${err.message}`);
        this.isConnected = false;
        this.isRealData = false;
        
        // Reintentar en 2 segundos si hay error EADDRINUSE o similar
        if (!this.connectionRetryTimeout) {
          this.connectionRetryTimeout = setTimeout(() => {
            this.connectionRetryTimeout = null;
            if (!this.isConnected) {
              this.logger.info(`Reintentando conexión a Named Pipe...`);
              this.startCollecting(this.updateCallback);
            }
          }, 2000);
        }
      });

      // Escuchar en Named Pipe
      this.server.listen(pipeName, () => {
        this.logger.info(`✓ Servidor escuchando en Named Pipe: ${pipeName}`);
      });

      // Emitir datos a intervalos regulares
      setInterval(() => {
        if (this.updateCallback && this.isRealData) {
          this.updateCallback(this.getCurrentData());
        }
      }, this.updateInterval);

      this.logger.info(`✓ Recolección de datos iniciada (${Math.round(1000 / this.updateInterval)} FPS) - Esperando SHTelemetry en Named Pipe...`);

    } catch (err) {
      this.logger.error(`Error iniciando servidor: ${err.message}`);
    }
  }

  /**
   * Procesar datos JSON del mod
   */
  handleData(chunk) {
    this.buffer += chunk;

    // Primero intentar parseo por líneas
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() || '';

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;
      if (this.tryParseTelemetryJson(line)) {
        continue;
      }
    }

    // Fallback: si el emisor no manda saltos de línea, extraer el objeto JSON raíz completo.
    // Usar indexOf (primer '{') para obtener el objeto raíz, no un sub-objeto interior.
    if (this.buffer.includes('{') && this.buffer.includes('}')) {
      const candidate = this.buffer;
      const firstOpen  = candidate.indexOf('{');
      const lastClose  = candidate.lastIndexOf('}');

      if (firstOpen !== -1 && lastClose > firstOpen) {
        const jsonText = candidate.slice(firstOpen, lastClose + 1).trim();
        if (this.tryParseTelemetryJson(jsonText)) {
          this.buffer = candidate.slice(lastClose + 1);
        }
      }
    }
  }

  tryParseTelemetryJson(text) {
    if (!text || text[0] !== '{') {
      return false;
    }

    try {
      const obj = JSON.parse(text);
      this.parseData(obj);
      return true;
    } catch (err) {
      // JSON incompleto (chunk parcial): ignorar silenciosamente, se completará en el siguiente chunk
      return false;
    }
  }

  /**
   * Parsear datos del JSON de SHTelemetry
   */
  parseData(obj) {
    // Mapeo directo
    if (obj.rpm !== undefined) this.currentData.rpm = obj.rpm;
    if (obj.fuelUsage !== undefined) this.currentData.consumption = obj.fuelUsage;
    if (obj.torqueNm !== undefined) this.currentData.torque = obj.torqueNm;
    if (obj.maxTorqueNm !== undefined) this.currentData.maxTorqueNm = obj.maxTorqueNm;
    if (obj.powerKW !== undefined) this.currentData.powerKW = obj.powerKW;
    if (obj.vehicleName !== undefined) this.currentData.vehicleName = obj.vehicleName;
    if (obj.motorLoad !== undefined) this.currentData.engineLoad = obj.motorLoad;
    if (obj.accelerator !== undefined) this.currentData.accelerator = obj.accelerator;
    if (obj.speed !== undefined) this.currentData.speed = obj.speed;
    if (obj.gearName !== undefined) this.currentData.gear = obj.gearName;
    if (obj.gearGroupName !== undefined) this.currentData.gearGroupName = obj.gearGroupName || '';
    if (obj.motorTemperature !== undefined) this.currentData.temperature = obj.motorTemperature;
    if (obj.fuelPercentage !== undefined) this.currentData.fuelLevel = obj.fuelPercentage;
    if (obj.fuelLevel    !== undefined) this.currentData.fuelLiters   = obj.fuelLevel;
    if (obj.fuelCapacity !== undefined) this.currentData.fuelCapacity = obj.fuelCapacity;
    // tractorDamage = solo daño del motor/vehículo (vehicleDamageAmount)
    // vehicleWearAmount se mantiene separado (desgaste de uso, no daño físico)
    if (obj.vehicleDamageAmount !== undefined) this.currentData.tractorDamage = Math.min(100, (obj.vehicleDamageAmount > 0 && obj.vehicleDamageAmount < 1 ? obj.vehicleDamageAmount * 100 : obj.vehicleDamageAmount));
    if (obj.isVehicleBroken !== undefined) this.currentData.isVehicleBroken = !!obj.isVehicleBroken;
    if (!this.currentData.isVehicleBroken && this.currentData.tractorDamage >= 100) this.currentData.isVehicleBroken = true;
    if (obj.isMotorStarted  !== undefined) this.currentData.isMotorStarted  = !!obj.isMotorStarted;
    // pitch/roll: captureVehiclePositionAndRotation siempre los calcula vía localDirectionToWorld
    if (obj.pitch !== undefined) this.currentData.pitch = obj.pitch;
    if (obj.roll  !== undefined) this.currentData.roll  = obj.roll;
    if (obj.mrPowerBandMinRpm !== undefined) this.currentData.mrPowerBandMinRpm = obj.mrPowerBandMinRpm;
    if (obj.mrPowerBandMaxRpm !== undefined) this.currentData.mrPowerBandMaxRpm = obj.mrPowerBandMaxRpm;
    if (obj.mrPeakPowerRpm    !== undefined) this.currentData.mrPeakPowerRpm    = obj.mrPeakPowerRpm;
    if (obj.mrMinEcoRpm       !== undefined) this.currentData.mrMinEcoRpm       = obj.mrMinEcoRpm;
    if (obj.minRpm            !== undefined) this.currentData.minRpm            = obj.minRpm;
    if (obj.maxRpm            !== undefined) this.currentData.maxRpm            = obj.maxRpm;
    // Masa real del vehículo (en toneladas, enviada por SHTelemetry.lua via getTotalMass)
    if (obj.vehicleMassT   !== undefined) this.currentData.vehicleMassT   = obj.vehicleMassT;
    if (obj.implementMassT !== undefined) this.currentData.implementMassT = obj.implementMassT;
    if (obj.totalMassT     !== undefined) this.currentData.totalMassT     = obj.totalMassT;
    // Wheel traction (from captureWheelData in SHTelemetry_Extensions)
    if (obj.driveType !== undefined) this.currentData.driveType = obj.driveType;
    // Lua sends wheelTraction as a 1-indexed table → JSON may be array or {"1":{},"2":{}...}
    if (obj.wheelTraction !== undefined) {
      var wt = obj.wheelTraction;
      var arr = Array.isArray(wt) ? wt : [wt['1'], wt['2'], wt['3'], wt['4']];
      if (arr && arr.length >= 4) {
        this.currentData.wheelTraction = arr.map(function(w) {
          return {
            position:     (w && w.position)     || '?',
            motorized:    !!(w && w.motorized),
            torquePercent:(w && w.torquePercent) || 0,
            slip:         (w && w.slip)          || 0,
            speedMs:      (w && w.speedMs)       || 0,
            contact:      !!(w && w.contact),
            tireLoadKN:   (w && w.tireLoadKN  != null) ? w.tireLoadKN  : null,
            longSlip:     (w && w.longSlip    != null) ? w.longSlip    : null,
            latSlip:      (w && w.latSlip     != null) ? w.latSlip     : null,
            groundType:   (w && w.groundType)  || null
          };
        });
      }
    }
    for (var wi = 1; wi <= 4; wi++) {
      if (obj['wheel_' + wi + '_pressure'] !== undefined) this.currentData['wheel_' + wi + '_pressure'] = obj['wheel_' + wi + '_pressure'];
      if (obj['wheel_' + wi + '_wear']     !== undefined) this.currentData['wheel_' + wi + '_wear']     = obj['wheel_' + wi + '_wear'];
    }

    this.currentData.timestamp = Date.now();
  }

  /**
   * Obtener datos actuales
   */
  getCurrentData() {
    return {
      ...this.currentData,
      isRealData: this.isRealData,
      isConnected: this.isConnected
    };
  }

  /**
   * Detener servidor
   */
  stop() {
    if (this.currentClient) {
      try {
        this.currentClient.destroy();
      } catch (err) {
        // ignore
      }
      this.currentClient = null;
    }

    if (this.server) {
      try {
        this.server.close();
      } catch (err) {
        // ignore
      }
      this.server = null;
    }

    this.isConnected = false;
    this.isRealData = false;
  }
}
