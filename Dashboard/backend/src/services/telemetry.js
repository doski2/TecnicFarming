import net from 'net';
import { appendFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
// __dirname = Dashboard/backend/src/services/  → 4 niveles arriba = raíz del proyecto
const DATA_DIR = join(__dirname, '..', '..', '..', '..', 'Data', 'sessions');

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
    this._lastLogMs = 0;   // throttle logger a 1 muestra/s
    this._sessionFile = null; // ruta del .jsonl activo
    this._activeCampo = -1;   // campo seleccionado desde el frontend (-1 = sin campo)
    this._massEma = null;     // EMA de totalMassT — filtra oscilaciones dinámicas de carga de rueda
    
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
      vehicleWearAmount: 0,
      isVehicleBroken: false,
      implementsAttached: 0,
      implementName: '',
      implementLowered: false,
      implementWorking: false,
      workType: 'TRANSPORT',
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
          this._massEma = null; // resetear EMA al desconectar (puede ser otro vehículo)
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
          const d = this.getCurrentData();
          this.updateCallback(d);
          this._logSample(d);
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
    // tractorDamage = daño físico por accidente (vehicleDamageAmount, casi siempre 0)
    // vehicleWearAmount = desgaste de uso normal (0.0-1.0); es lo que cambia con el uso
    if (obj.vehicleDamageAmount !== undefined) this.currentData.tractorDamage = Math.min(100, (obj.vehicleDamageAmount > 0 && obj.vehicleDamageAmount < 1 ? obj.vehicleDamageAmount * 100 : obj.vehicleDamageAmount));
    if (obj.vehicleWearAmount !== undefined) this.currentData.vehicleWearAmount = Math.max(0, Math.min(1, obj.vehicleWearAmount));
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
    if (obj.totalMassT !== undefined) {
      const raw = obj.totalMassT;
      if (raw > 0) {
        // EMA α=0.04: ventana efectiva ~25 muestras (~1.5s a 60fps)
        // Estabiliza oscilaciones de carga dinámica de rueda sin retrasar demasiado
        if (this._massEma === null) {
          this._massEma = raw;  // primera muestra: inicializar sin filtrar
        } else {
          this._massEma = this._massEma + 0.04 * (raw - this._massEma);
        }
        this.currentData.totalMassT = +this._massEma.toFixed(2);
      }
    }
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
            groundType:   (w && w.groundType)  || null,
            rrFx:         (w && w.rrFx        != null) ? w.rrFx        : null,
            pressureFx:   (w && w.pressureFx  != null) ? w.pressureFx  : null
          };
        });
      }
    }
    for (var wi = 1; wi <= 4; wi++) {
      if (obj['wheel_' + wi + '_pressure'] !== undefined) this.currentData['wheel_' + wi + '_pressure'] = obj['wheel_' + wi + '_pressure'];
      if (obj['wheel_' + wi + '_wear']     !== undefined) this.currentData['wheel_' + wi + '_wear']     = obj['wheel_' + wi + '_wear'];
    }

    // Implement fields (captureWorkData en SHTelemetry_Extensions.lua)
    if (obj.implementsAttached !== undefined) this.currentData.implementsAttached = obj.implementsAttached;
    if (obj.implementName      !== undefined) this.currentData.implementName      = obj.implementName  || '';
    if (obj.implementLowered   !== undefined) this.currentData.implementLowered   = !!obj.implementLowered;
    if (obj.implementWorking   !== undefined) this.currentData.implementWorking   = !!obj.implementWorking;
    if (obj.workType           !== undefined) this.currentData.workType           = obj.workType      || 'TRANSPORT';

    this.currentData.timestamp = Date.now();
  }

  /**
   * Logger JSONL — graba 1 muestra/s cuando la herramienta está trabajando
   */
  _logSample(data) {
    // Grabar cuando el implemento está bajado Y el vehículo se mueve (> 0.3 km/h)
    // No dependemos de implementWorking (detección Lua podría ser conservadora)
    const speed = Math.abs(data.speed || 0);
    if (!data.implementLowered || speed < 0.3) return;

    const now = Date.now();
    if (now - this._lastLogMs < 1000) return;
    this._lastLogMs = now;

    // Construir ruta: Data/sessions/campo_3/YYYY-MM-DD_Vehiculo_WorkType.jsonl
    const today     = new Date().toISOString().slice(0, 10);
    const safeName  = (data.vehicleName || 'unknown').replace(/[^a-zA-Z0-9_\-]/g, '_');
    const workType  = (data.workType    || 'UNKNOWN');
    const campoDir  = this._activeCampo > 0 ? `campo_${this._activeCampo}` : 'sin_campo';
    const sessionDir = join(DATA_DIR, campoDir);
    const fileName  = `${today}_${safeName}_${workType}.jsonl`;
    const filePath  = join(sessionDir, fileName);

    if (this._sessionFile !== filePath) {
      this._sessionFile = filePath;
      try {
        if (!existsSync(sessionDir)) mkdirSync(sessionDir, { recursive: true });
      } catch (err) {
        this.logger.error(`Logger: no se pudo crear directorio ${sessionDir}: ${err.message}`);
        return;
      }
      this.logger.info(`Logger: grabando en ${campoDir}/${fileName}`);
    }

    // Campos derivados de carga de ejes
    const wt = data.wheelTraction || [];
    const flKN = (wt[0]?.tireLoadKN) || 0;
    const frKN = (wt[1]?.tireLoadKN) || 0;
    const rlKN = (wt[2]?.tireLoadKN) || 0;
    const rrKN = (wt[3]?.tireLoadKN) || 0;
    const totalKN = flKN + frKN + rlKN + rrKN;
    const frontKN = flKN + frKN;

    const sample = {
      ts:             Math.floor(now / 1000),
      campo:          this._activeCampo > 0 ? this._activeCampo : null,
      tractorId:      data.vehicleName   || '',
      workType:       data.workType      || 'UNKNOWN',
      implementName:  data.implementName || '',
      rpm:            data.rpm           || 0,
      torque:         data.torque        || 0,
      motorLoad:      +((data.engineLoad  || 0).toFixed(1)),  // engineLoad ya es 0-100
      accelerator:    +((data.accelerator || 0).toFixed(1)),  // 0-100%
      fuelUsage:      +(data.consumption || 0).toFixed(2),
      speed:          +(Math.abs(data.speed || 0)).toFixed(2),
      gear:           data.gear          || 'N',
      wheelSlipRL:    +((((wt[2]?.longSlip) || 0) * 100).toFixed(1)),
      wheelSlipRR:    +((((wt[3]?.longSlip) || 0) * 100).toFixed(1)),
      pitch:          +(data.pitch        || 0).toFixed(2),
      roll:           +(data.roll         || 0).toFixed(2),
      totalMassT:     totalKN > 0 ? +(totalKN / 9.81).toFixed(2) : (data.totalMassT || 0),
      frontAxleLoad:  +frontKN.toFixed(2),
      frontAxleRatio: totalKN > 0 ? +(frontKN / totalKN).toFixed(3) : 0.5,
      transmissionType: data.transmissionType || 'manual'
    };

    try {
      appendFileSync(filePath, JSON.stringify(sample) + '\n', 'utf8');
    } catch (err) {
      this.logger.error(`Logger: error escribiendo muestra: ${err.message}`);
    }
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
