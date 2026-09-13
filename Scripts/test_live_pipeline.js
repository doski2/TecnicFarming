/**
 * Prueba pipeline telemetría (sin navegador).
 * Ejecutar: node Scripts/test_live_pipeline.js
 */
import assert from 'node:assert';
import TelemetryService from '../Dashboard/backend/src/services/telemetry.js';

const logger = { info: () => {}, error: () => {}, warn: () => {} };

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  console.log('\nPipeline telemetría\n');

  const svc = new TelemetryService(logger);
  let emissions = 0;
  svc.startCollecting((d) => { emissions += 1; });
  await wait(60);
  assert.ok(emissions > 0, 'debe emitir al dashboard aun sin FS25');

  svc.parseData({ rpm: 1650, fuelUsage: 12.5, speed: 18, motorLoad: 62 });
  const payload = svc.getCurrentData();
  assert.strictEqual(payload.engineSpeed, 1650);
  assert.strictEqual(payload.motorLoad, 62);
  assert.strictEqual(payload.fuelUsagePerHour, 12.5);
  svc.stop();

  console.log('  ✓ emisión continua + aliases WebSocket');
  console.log('\nPara probar en el navegador:');
  console.log('  1. cd Dashboard/backend && npm start');
  console.log('  2. node Tests/mock_telemetry_provider.js   (otra terminal)');
  console.log('  3. http://localhost:8080  → pestaña Dashboard o Trabajo\n');
}

main().catch((err) => {
  console.error('FALLO:', err.message);
  process.exit(1);
});
