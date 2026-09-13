/**
 * Simulador de Telemetría SHTelemetry
 * Se conecta a la Named Pipe del backend (como hace el mod en FS25) y envía JSON.
 *
 * Uso:
 *   1. Arranca el backend: cd Dashboard/backend && npm start
 *   2. En otra terminal: node Tests/mock_telemetry_provider.js
 */
import net from 'net';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { resolvePipeName } from '../Dashboard/backend/src/services/telemetry.js';

config({ path: join(dirname(fileURLToPath(import.meta.url)), '../Dashboard/backend/.env') });
const PIPE_NAME = resolvePipeName();
const RETRY_MS = 2000;

let rpm = 800;
let speed = 0;
let fuel = 100;
let direction = 1;
let interval = null;

function buildPayload() {
  rpm += (Math.random() - 0.5) * 100 + (10 * direction);
  if (rpm > 2200) direction = -1;
  if (rpm < 800) direction = 1;
  speed = ((rpm - 800) / 1400) * 50;
  fuel = Math.max(5, fuel - 0.001);

  return {
    telemetrySource: 'mock',
    rpm: Math.round(rpm),
    speed,
    fuelUsage: 8 + (rpm / 2200) * 20,
    fuelPercentage: fuel,
    fuelLevel: fuel * 2,
    fuelCapacity: 200,
    vehicleName: 'Fendt 724 (Simulado)',
    motorLoad: (rpm / 2200) * 100,
    accelerator: 50,
    gearName: '12',
    transmissionType: 'manual',
    workType: 'TRANSPORT',
    implementLowered: false,
    implementName: '',
    motorTemperature: 90,
    isMotorStarted: true,
    timestamp: Date.now(),
    mrPowerBandMinRpm: 1200,
    mrPowerBandMaxRpm: 1800,
    mrPeakPowerRpm: 1700,
    mrMinEcoRpm: 1400
  };
}

function connectAsGame() {
  console.log('=== SIMULADOR DE TELEMETRÍA FS25 ===');
  console.log(`Conectando a ${PIPE_NAME} (como cliente, igual que SHTelemetry.lua)...`);

  const socket = net.connect(PIPE_NAME, () => {
    console.log('✓ Conectado al backend — enviando telemetría simulada (~10 Hz)');
    if (interval) clearInterval(interval);
    interval = setInterval(() => {
      try {
        socket.write(`${JSON.stringify(buildPayload())}\n`);
      } catch (err) {
        console.error('Error enviando datos:', err.message);
        cleanup();
        scheduleReconnect();
      }
    }, 100);
  });

  socket.on('error', (err) => {
    console.error(`✗ No se pudo conectar (${err.message}). ¿Está el backend en marcha?`);
    cleanup();
    scheduleReconnect();
  });

  socket.on('end', () => {
    console.log('✗ Pipe cerrada por el backend');
    cleanup();
    scheduleReconnect();
  });

  socket.on('close', () => {
    cleanup();
  });
}

function cleanup() {
  if (interval) {
    clearInterval(interval);
    interval = null;
  }
}

function scheduleReconnect() {
  console.log(`Reintentando en ${RETRY_MS / 1000}s...`);
  setTimeout(connectAsGame, RETRY_MS);
}

connectAsGame();

process.on('SIGINT', () => {
  cleanup();
  process.exit(0);
});
