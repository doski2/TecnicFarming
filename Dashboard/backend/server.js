import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
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

// Logger simple
const logger = {
  info: (msg) => {
    const output = `[INFO] ${new Date().toISOString()} - ${msg}`;
    console.log(output);
    // También escribir a archivo para debug
    fs.appendFileSync(path.join(__dirname, 'logs', 'debug.log'), output + '\n', 'utf8');
  },
  error: (msg) => {
    const output = `[ERROR] ${new Date().toISOString()} - ${msg}`;
    console.error(output);
    fs.appendFileSync(path.join(__dirname, 'logs', 'debug.log'), output + '\n', 'utf8');
  },
  warn: (msg) => {
    const output = `[WARN] ${new Date().toISOString()} - ${msg}`;
    console.warn(output);
    fs.appendFileSync(path.join(__dirname, 'logs', 'debug.log'), output + '\n', 'utf8');
  }
};

// Crear carpeta logs si no existe
if (!fs.existsSync(path.join(__dirname, 'logs'))) {
  fs.mkdirSync(path.join(__dirname, 'logs'));
}

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
