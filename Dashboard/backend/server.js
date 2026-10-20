import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { spawn } from 'child_process';
import TelemetryService, { resolvePipeName } from './src/services/telemetry.js';

// Cargar variables de entorno
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Inicializar Express
// Solo acceso local por defecto (HOST=0.0.0.0 en .env para abrirlo a la red)
const HOST = process.env.HOST || '127.0.0.1';
const PORT = process.env.SOCKET_IO_PORT || 8080;

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: process.env.CORS_ORIGIN || `http://localhost:${PORT}`,
    methods: ['GET', 'POST']
  }
});

// Middleware
app.use(express.static(path.join(__dirname, '../frontend')));
app.use(express.json({ limit: '10kb' }));

// Crear carpeta logs + rotar al arrancar (debug.log → debug.prev.log)
const LOGS_DIR = path.join(__dirname, 'logs');
const LOG_FILE = path.join(LOGS_DIR, 'debug.log');
const LOG_PREV = path.join(LOGS_DIR, 'debug.prev.log');

if (!fs.existsSync(LOGS_DIR)) {
  fs.mkdirSync(LOGS_DIR);
}
if (fs.existsSync(LOG_FILE)) {
  try { fs.renameSync(LOG_FILE, LOG_PREV); } catch (_) { /* sin permisos, continuar */ }
}

// Logger simple (escritura en stream: no bloquea el event loop)
const logStream = fs.createWriteStream(LOG_FILE, { flags: 'a', encoding: 'utf8' });
logStream.on('error', () => { /* sin permisos de escritura: seguir solo con consola */ });

const logger = {
  info: (msg) => {
    const output = `[INFO] ${new Date().toISOString()} - ${msg}`;
    console.log(output);
    logStream.write(output + '\n');
  },
  error: (msg) => {
    const output = `[ERROR] ${new Date().toISOString()} - ${msg}`;
    console.error(output);
    logStream.write(output + '\n');
  },
  warn: (msg) => {
    const output = `[WARN] ${new Date().toISOString()} - ${msg}`;
    console.warn(output);
    logStream.write(output + '\n');
  }
};

// RUTAS
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

app.get('/api/config', (req, res) => {
  res.json({
    updateFrequency: process.env.UPDATE_FREQUENCY_MS || 33,
    maxBufferSize: process.env.MAX_BUFFER_SIZE || 1000
  });
});

// Instancia del servicio de telemetría
logger.info('Creando instancia de TelemetryService...');
const telemetryService = new TelemetryService(logger);
logger.info('✓ TelemetryService creado');

// Obtener namespace /telemetry
const telemetryNamespace = process.env.SOCKET_IO_NAMESPACE || '/telemetry';
logger.info(`Configurando namespace: ${telemetryNamespace}`);
const nsp = io.of(telemetryNamespace);
logger.info('✓ Namespace configurado');

app.get('/api/telemetry/status', (req, res) => {
  const data = telemetryService.getCurrentData();
  res.json({
    pipeConnected: telemetryService.isConnected,
    isRealData: data.isRealData,
    rpm: data.engineSpeed || data.rpm || 0,
    speed: data.speed || 0,
    vehicleName: data.vehicleName || '',
    telemetrySource: data.telemetrySource || '',
    websocketClients: nsp.sockets ? nsp.sockets.size : 0
  });
});

// Manejar conexiones en el namespace
nsp.on('connection', (socket) => {
  logger.info(`✓ Cliente conectado a ${telemetryNamespace}: ${socket.id}`);
  socket.emit('telemetry', telemetryService.getCurrentData());

  socket.on('disconnect', () => {
    logger.info(`✗ Cliente desconectado de ${telemetryNamespace}: ${socket.id}`);
  });

  socket.on('ping', () => {
    socket.emit('pong', { timestamp: Date.now() });
  });
});

// Telemetría: se inicia tras enlazar HTTP (evita bucle si el puerto 8080 está ocupado)
let emissionCount = 0;
const LOG_EVERY = Math.max(1, Math.round(1000 / (parseInt(process.env.UPDATE_FREQUENCY_MS) || 33)));

function startTelemetryCollection() {
  logger.info('Iniciando recolección de datos...');
  telemetryService.startCollecting((data) => {
    emissionCount++;
    const clientCount = nsp.sockets ? nsp.sockets.size : 0;
    if (emissionCount % LOG_EVERY === 0 && data.isRealData) {
      logger.info(`✓ FS25 activo: RPM=${Math.round(data.engineSpeed || data.rpm)}, Fuel=${Math.round(data.fuelPercentage ?? data.fuelLevel)}%, Clients=${clientCount}`);
    }
    if (clientCount > 0) {
      nsp.emit('telemetry', data);
    }
  });
  logger.info('✓ Recolección iniciada - ESPERANDO CONEXIÓN A FS25');
}

// ── ENDPOINT: Análisis de sesión ───────────────────────────────────────────
// GET /api/analyze          → analiza la sesión activa (archivo .jsonl actual)
// GET /api/analyze/sessions → lista archivos .jsonl disponibles
// Nota: la ruta del archivo viene del servicio, no del cliente (sin riesgo de path-traversal)

const SCRIPTS_DIR    = path.join(__dirname, '..', '..', 'Scripts');
const DATA_DIR_API   = path.join(__dirname, '..', '..', 'Data', 'sessions');
const PROFILES_PATH  = path.join(__dirname, '..', '..', 'Data', 'campo_profiles.json');

// Establecer campo activo desde el frontend
app.post('/api/session/campo', (req, res) => {
  const campo = parseInt(req.body.campo, 10);
  if (isNaN(campo) || campo < -1 || campo > 99) {
    return res.status(400).json({ error: 'Número de campo inválido (rango: -1 a 99)' });
  }
  // Fuerza nuevo archivo al cambiar de campo (la próxima muestra abrirá uno nuevo)
  telemetryService.setActiveCampo(campo);
  logger.info(`Campo activo cambiado a: ${campo === -1 ? 'Sin campo' : 'Campo ' + campo}`);
  res.json({ ok: true, campo });
});

app.get('/api/analyze/sessions', (req, res) => {
  try {
    if (!fs.existsSync(DATA_DIR_API)) {
      return res.json({ files: [] });
    }

    const campoParam = req.query.campo;  // ej: "3" o undefined para listar todo

    // Obtener lista de subcarpetas (campo_N / sin_campo)
    const subDirs = fs.readdirSync(DATA_DIR_API).filter(d => {
      try { return fs.statSync(path.join(DATA_DIR_API, d)).isDirectory(); }
      catch { return false; }
    });

    const files = [];
    subDirs.forEach(dir => {
      // Si se filtra por campo cortar los que no correspondan
      if (campoParam != null) {
        const expected = campoParam === '-1' ? 'sin_campo' : `campo_${campoParam}`;
        if (dir !== expected) return;
      }
      const dirPath = path.join(DATA_DIR_API, dir);
      fs.readdirSync(dirPath).filter(f => f.endsWith('.jsonl')).forEach(f => {
        const stat = fs.statSync(path.join(dirPath, f));
        files.push({ name: f, relPath: dir + '/' + f, dir, size: stat.size, mtime: stat.mtime });
      });
    });

    files.sort((a, b) => b.mtime - a.mtime);
    res.json({ files });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

let analyzing = false;

app.get('/api/analyze', (req, res) => {
  // Prioridad: ?file= explícito; fallback: sesión activa del servicio
  let targetFile = null;

  if (req.query.file) {
    // Validar: acepta "campo_3/filename.jsonl" o solo "filename.jsonl"
    // Cada segmento se valida por separado para evitar path-traversal
    const raw      = String(req.query.file);
    const parts    = raw.split('/');
    if (parts.length > 2) {
      return res.status(400).json({ error: 'Ruta de archivo inválida' });
    }
    const fileName = path.basename(parts[parts.length - 1]);
    if (!/^[\w\-. ]+\.jsonl$/.test(fileName)) {
      return res.status(400).json({ error: 'Nombre de archivo inválido' });
    }
    if (parts.length === 2) {
      const subDir = parts[0];
      if (!/^(campo_\d{1,2}|sin_campo)$/.test(subDir)) {
        return res.status(400).json({ error: 'Subcarpeta inválida' });
      }
      targetFile = path.join(DATA_DIR_API, subDir, fileName);
    } else {
      targetFile = path.join(DATA_DIR_API, fileName);
    }
  } else {
    targetFile = telemetryService.getSessionFile();
  }

  if (!targetFile || !fs.existsSync(targetFile)) {
    return res.status(404).json({ error: 'No hay sesión activa. Espera tener ~100 muestras antes de analizar.' });
  }

  const scriptPath = path.join(SCRIPTS_DIR, 'analyze_session.py');
  if (!fs.existsSync(scriptPath)) {
    return res.status(500).json({ error: 'Script de análisis no encontrado: ' + scriptPath });
  }

  // Un solo análisis a la vez: cada petición lanza un proceso Python
  if (analyzing) {
    return res.status(429).json({ error: 'Ya hay un análisis en curso, espera unos segundos.' });
  }
  analyzing = true;

  let stdout = '';
  let stderr = '';
  let finished = false;
  let killTimer = null;
  const done = (status, body) => {
    if (finished) return;
    finished = true;
    analyzing = false;
    clearTimeout(killTimer);
    res.status(status).json(body);
  };
  const py = spawn('python', [scriptPath, targetFile]);
  killTimer = setTimeout(() => {
    py.kill();
    done(504, { error: 'El análisis tardó demasiado (timeout 20 s).' });
  }, 20000);

  py.stdout.on('data', d => { stdout += d.toString(); });
  py.stderr.on('data', d => { stderr += d.toString(); });

  py.on('close', code => {
    if (code !== 0 || !stdout.trim()) {
      logger.error(`analyze_session.py stderr: ${stderr}`);
      return done(500, { error: 'Error ejecutando análisis: ' + (stderr || 'sin salida') });
    }
    try {
      const result = JSON.parse(stdout.trim());
      result.sessionFile = path.basename(targetFile);
      done(200, result);
    } catch (e) {
      done(500, { error: 'Respuesta Python inválida: ' + stdout.slice(0, 200) });
    }
  });

  py.on('error', err => {
    done(500, { error: 'No se pudo ejecutar Python: ' + err.message });
  });
});

// DELETE /api/session/file  → elimina un archivo .jsonl concreto
// Body: { dir: "campo_3", file: "2026-04-11_MF_HARVESTING.jsonl" }
app.delete('/api/session/file', (req, res) => {
  const { dir, file } = req.body || {};

  if (!dir || !/^(campo_\d{1,2}|sin_campo)$/.test(dir)) {
    return res.status(400).json({ error: 'Subcarpeta inválida' });
  }
  const fileName = path.basename(String(file || ''));
  if (!fileName || !/^[\w\-. ]+\.jsonl$/.test(fileName)) {
    return res.status(400).json({ error: 'Nombre de archivo inválido' });
  }

  const filePath = path.join(DATA_DIR_API, dir, fileName);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Archivo no encontrado' });
  }

  telemetryService.releaseSessionFile(filePath);

  try {
    fs.unlinkSync(filePath);
    logger.info(`Archivo eliminado: ${dir}/${fileName}`);
    res.json({ ok: true, deleted: dir + '/' + fileName });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/campo-profile?campo=3&workType=HARVESTER  → perfil acumulado de un campo+operación
// GET /api/campo-profile?campo=3                      → todos los perfiles de ese campo
// GET /api/campo-profile                              → todos los perfiles existentes
app.get('/api/campo-profile', (req, res) => {
  try {
    if (!fs.existsSync(PROFILES_PATH)) {
      return res.json({ profiles: {}, profile: null });
    }
    const profiles = JSON.parse(fs.readFileSync(PROFILES_PATH, 'utf8'));
    const { campo, workType } = req.query;

    if (campo != null && workType) {
      const key = campo + '_' + workType;
      return res.json({ profile: profiles[key] || null });
    }
    if (campo != null) {
      const result = {};
      Object.entries(profiles).forEach(([k, v]) => {
        if (String(v.campo) === String(campo)) result[k] = v;
      });
      return res.json({ profiles: result });
    }
    res.json({ profiles });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// Manejo de errores
process.on('uncaughtException', (err) => {
  logger.error(`Excepción no capturada: ${err.message}`);
  logger.error(err.stack);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error(`Promesa rechazada no manejada: ${reason}`);
});

// INICIAR SERVIDOR
const SOCKET_IO_PORT = PORT;

httpServer.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    logger.error(`Puerto ${SOCKET_IO_PORT} ya en uso. Cierra la otra ventana del backend o ejecuta stop_dashboard.bat`);
    process.exit(1);
  }
  logger.error(`Error HTTP: ${err.message}`);
  process.exit(1);
});

httpServer.listen(SOCKET_IO_PORT, HOST, () => {
  logger.info(`═════════════════════════════════════════════════════`);
  logger.info(`🚀 Dashboard FS25 Backend - INICIADO`);
  logger.info(`═════════════════════════════════════════════════════`);
  logger.info(`✓ HTTP/WebSocket escuchando en: http://${HOST}:${SOCKET_IO_PORT}`);
  logger.info(`✓ Socket.io namespace: /telemetry`);
  const updateMs = parseFloat(process.env.UPDATE_FREQUENCY_MS) || 33;
  logger.info(`✓ Named Pipe SHTelemetry: ${resolvePipeName()}`);
  logger.info(`✓ Update frequency: ${updateMs}ms (${Math.round(1000 / updateMs)} FPS)`);
  logger.info(`✓ Environment: ${process.env.NODE_ENV || 'development'}`);
  logger.info(`═════════════════════════════════════════════════════`);
  logger.info(`📍 Dashboard en: http://localhost:${SOCKET_IO_PORT}`);
  logger.info(`═════════════════════════════════════════════════════`);
  startTelemetryCollection();
});

export { app, httpServer, io, logger };
