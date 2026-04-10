import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { spawn } from 'child_process';
import TelemetryService from './src/services/telemetry.js';

// Cargar variables de entorno
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Inicializar Express
const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: process.env.CORS_ORIGIN || '*',
    methods: ['GET', 'POST']
  }
});

// Middleware
app.use(express.static(path.join(__dirname, '../frontend')));
app.use(express.json());

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

// Logger simple
const logger = {
  info: (msg) => {
    const output = `[INFO] ${new Date().toISOString()} - ${msg}`;
    console.log(output);
    fs.appendFileSync(LOG_FILE, output + '\n', 'utf8');
  },
  error: (msg) => {
    const output = `[ERROR] ${new Date().toISOString()} - ${msg}`;
    console.error(output);
    fs.appendFileSync(LOG_FILE, output + '\n', 'utf8');
  },
  warn: (msg) => {
    const output = `[WARN] ${new Date().toISOString()} - ${msg}`;
    console.warn(output);
    fs.appendFileSync(LOG_FILE, output + '\n', 'utf8');
  }
};

// RUTAS
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

app.get('/api/config', (req, res) => {
  res.json({
    updateFrequency: process.env.UPDATE_FREQUENCY_MS || 16.66,
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

// Manejar conexiones en el namespace
nsp.on('connection', (socket) => {
  logger.info(`✓ Cliente conectado a ${telemetryNamespace}: ${socket.id}`);

  socket.on('disconnect', () => {
    logger.info(`✗ Cliente desconectado de ${telemetryNamespace}: ${socket.id}`);
  });

  // Echo test para verificar conexión
  socket.on('ping', () => {
    socket.emit('pong', { timestamp: Date.now() });
  });
});

// Iniciar recolección de datos
logger.info('Iniciando recolección de datos...');
let emissionCount = 0;
telemetryService.startCollecting((data) => {
  // Emitir datos a todos los clientes conectados en el namespace
  emissionCount++;
  // Obtener número real de clientes conectados
  const clientCount = nsp.sockets ? nsp.sockets.size || Object.keys(nsp.sockets).length || 0 : 0;
  if (emissionCount % 60 === 0) { // Log cada 1 segundo (60 FPS)
    logger.info(`✓ Conectado a FS25: RPM=${Math.round(data.rpm)}, Fuel=${Math.round(data.fuelLevel)}%, Clients=${clientCount}`);
  }
  nsp.emit('telemetry', data);
});
logger.info('✓ Recolección iniciada - ESPERANDO CONEXIÓN A FS25');

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
  telemetryService._activeCampo = campo;
  // Forzar nuevo archivo al cambiar de campo (la próxima muestra abrirá uno nuevo)
  telemetryService._sessionFile = null;
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

app.get('/api/analyze', (req, res) => {
  // Prioridad: sesión activa del servicio; fallback: ?file=nombre.jsonl
  let targetFile = telemetryService._sessionFile || null;

  if (!targetFile && req.query.file) {
    // Validar: acepta "campo_3/filename.jsonl" o solo "filename.jsonl"
    // Cada segmento se valida por separado para evitar path-traversal
    const raw      = req.query.file;
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
  }

  if (!targetFile || !fs.existsSync(targetFile)) {
    return res.status(404).json({ error: 'No hay sesión activa. Espera tener ~100 muestras antes de analizar.' });
  }

  const scriptPath = path.join(SCRIPTS_DIR, 'analyze_session.py');
  if (!fs.existsSync(scriptPath)) {
    return res.status(500).json({ error: 'Script de análisis no encontrado: ' + scriptPath });
  }

  let stdout = '';
  let stderr = '';
  const py = spawn('python', [scriptPath, targetFile]);

  py.stdout.on('data', d => { stdout += d.toString(); });
  py.stderr.on('data', d => { stderr += d.toString(); });

  py.on('close', code => {
    if (code !== 0 || !stdout.trim()) {
      logger.error(`analyze_session.py stderr: ${stderr}`);
      return res.status(500).json({ error: 'Error ejecutando análisis: ' + (stderr || 'sin salida') });
    }
    try {
      const result = JSON.parse(stdout.trim());
      result.sessionFile = path.basename(targetFile);
      res.json(result);
    } catch (e) {
      res.status(500).json({ error: 'Respuesta Python inválida: ' + stdout.slice(0, 200) });
    }
  });

  py.on('error', err => {
    res.status(500).json({ error: 'No se pudo ejecutar Python: ' + err.message });
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

  if (telemetryService._sessionFile === filePath) {
    telemetryService._sessionFile = null;
  }

  try {
    fs.unlinkSync(filePath);
    logger.info(`Archivo eliminado: ${dir}/${fileName}`);
    res.json({ ok: true, deleted: dir + '/' + fileName });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/campo-profile?campo=3&workType=HARVESTING  → perfil acumulado de un campo+operación
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
const SOCKET_IO_PORT = process.env.SOCKET_IO_PORT || 8080;

httpServer.listen(SOCKET_IO_PORT, '0.0.0.0', () => {
  logger.info(`═════════════════════════════════════════════════════`);
  logger.info(`🚀 Dashboard FS25 Backend - INICIADO`);
  logger.info(`═════════════════════════════════════════════════════`);
  logger.info(`✓ HTTP/WebSocket escuchando en: http://localhost:${SOCKET_IO_PORT}`);
  logger.info(`✓ Socket.io namespace: /telemetry`);
  logger.info(`✓ Servidor TCP esperando SHTelemetry: localhost:9000`);
  logger.info(`✓ Update frequency: ${process.env.UPDATE_FREQUENCY_MS}ms (${Math.round(1000 / process.env.UPDATE_FREQUENCY_MS)} FPS)`);
  logger.info(`✓ Environment: ${process.env.NODE_ENV || 'development'}`);
  logger.info(`═════════════════════════════════════════════════════`);
  logger.info(`📍 Dashboard en: http://localhost:${SOCKET_IO_PORT}`);
  logger.info(`═════════════════════════════════════════════════════`);
});

export { app, httpServer, io, logger };
