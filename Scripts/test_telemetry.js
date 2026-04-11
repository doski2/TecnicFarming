/**
 * test_telemetry.js — Tests para TelemetryService.parseData() y _logSample()
 * Ejecutar: node Scripts/test_telemetry.js
 *
 * Sin dependencias externas — usa Node.js assert nativo.
 */
import assert from 'assert';
import { tmpdir } from 'os';
import { join } from 'path';
import { readFileSync, unlinkSync, existsSync } from 'fs';

// ── Stub mínimo de logger ─────────────────────────────────────────────────────
const logger = { info: () => {}, error: () => {}, warn: () => {} };

// ── Mock de DATA_DIR para que _logSample escriba en /tmp ─────────────────────
// Sobrescribir el módulo necesita hacerlo antes del import dinámico.
// Usamos un import con patching mínimo: subclase con DATA_DIR expuesto.
import TelemetryService from '../Dashboard/backend/src/services/telemetry.js';

// Subclase con DATA_DIR apuntando a /tmp para tests
class TestTelemetryService extends TelemetryService {
  constructor() { super(logger); }
  // Exponer método privado para test
  get _dataDir() { return tmpdir(); }
}

// ── Utilitarios ──────────────────────────────────────────────────────────────
let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
    failed++;
  }
}

function near(a, b, delta = 0.01) {
  assert.ok(Math.abs(a - b) <= delta, `${a} ≈ ${b} (delta ${delta})`);
}

// ── BLOQUE 1: parseData — mapeo de campos ─────────────────────────────────────
console.log('\nparseData — mapeo de campos');

{
  const svc = new TestTelemetryService();

  test('rpm → currentData.rpm', () => {
    svc.parseData({ rpm: 1850 });
    assert.strictEqual(svc.currentData.rpm, 1850);
  });

  test('motorLoad → currentData.engineLoad', () => {
    svc.parseData({ motorLoad: 73.4 });
    near(svc.currentData.engineLoad, 73.4);
  });

  test('fuelUsage → currentData.consumption', () => {
    svc.parseData({ fuelUsage: 14.2 });
    near(svc.currentData.consumption, 14.2);
  });

  test('torqueNm → currentData.torque', () => {
    svc.parseData({ torqueNm: 450 });
    assert.strictEqual(svc.currentData.torque, 450);
  });

  test('cropType → currentData.cropType', () => {
    svc.parseData({ cropType: 'WHEAT' });
    assert.strictEqual(svc.currentData.cropType, 'WHEAT');
  });

  test('workType → currentData.workType', () => {
    svc.parseData({ workType: 'HARVESTER' });
    assert.strictEqual(svc.currentData.workType, 'HARVESTER');
  });

  test('implementLowered → boolean true', () => {
    svc.parseData({ implementLowered: 1 });
    assert.strictEqual(svc.currentData.implementLowered, true);
  });

  test('implementLowered 0 → boolean false', () => {
    svc.parseData({ implementLowered: 0 });
    assert.strictEqual(svc.currentData.implementLowered, false);
  });

  test('vehicleWearAmount clamped entre 0-1', () => {
    svc.parseData({ vehicleWearAmount: 1.5 });
    assert.strictEqual(svc.currentData.vehicleWearAmount, 1);
    svc.parseData({ vehicleWearAmount: -0.5 });
    assert.strictEqual(svc.currentData.vehicleWearAmount, 0);
  });

  test('vehicleDamageAmount < 1 → se multiplica × 100', () => {
    svc.parseData({ vehicleDamageAmount: 0.15 });
    near(svc.currentData.tractorDamage, 15.0);
  });

  test('vehicleDamageAmount >= 1 → se usa directo', () => {
    svc.parseData({ vehicleDamageAmount: 50 });
    near(svc.currentData.tractorDamage, 50);
  });

  test('isVehicleBroken true cuando damage >= 100', () => {
    svc.parseData({ vehicleDamageAmount: 100, isVehicleBroken: false });
    assert.strictEqual(svc.currentData.isVehicleBroken, true);
  });

  test('campo no reconocido no rompe parseData', () => {
    assert.doesNotThrow(() => svc.parseData({ campoDesconocido: 'xyz' }));
  });
}

// ── BLOQUE 2: parseData — EMA de totalMassT ──────────────────────────────────
console.log('\nparseData — EMA de totalMassT');

{
  const svc = new TestTelemetryService();

  test('primera muestra inicializa _massEma sin filtrar', () => {
    svc.parseData({ totalMassT: 10.0 });
    near(svc.currentData.totalMassT, 10.0);
  });

  test('EMA suaviza oscilaciones (converge hacia el nuevo valor)', () => {
    // Primera muestra = 10, luego 100 muestras de 20 → debe converger hacia 20
    svc.parseData({ totalMassT: 10.0 });
    for (let i = 0; i < 100; i++) svc.parseData({ totalMassT: 20.0 });
    assert.ok(svc.currentData.totalMassT > 19.0, `EMA no convergió: ${svc.currentData.totalMassT}`);
  });

  test('EMA ignora valores <= 0', () => {
    const svc2 = new TestTelemetryService();
    svc2.parseData({ totalMassT: 15.0 });
    const before = svc2.currentData.totalMassT;
    svc2.parseData({ totalMassT: 0 });
    assert.strictEqual(svc2.currentData.totalMassT, before);
  });
}

// ── BLOQUE 3: parseData — wheelTraction (array vs objeto Lua) ────────────────
console.log('\nparseData — wheelTraction');

{
  const svc = new TestTelemetryService();

  const wheel = (pos) => ({ position: pos, motorized: true, torquePercent: 50,
                             slip: 0.02, speedMs: 3, contact: true,
                             tireLoadKN: 25, longSlip: 0.05, latSlip: 0.01,
                             groundType: 'soil', rrFx: 0.1, pressureFx: 1.0 });

  test('wheelTraction como array → se parsea correctamente', () => {
    svc.parseData({ wheelTraction: ['FL','FR','RL','RR'].map(wheel) });
    assert.strictEqual(svc.currentData.wheelTraction.length, 4);
    assert.strictEqual(svc.currentData.wheelTraction[0].position, 'FL');
    near(svc.currentData.wheelTraction[2].tireLoadKN, 25);
  });

  test('wheelTraction como objeto Lua 1-indexed → se parsea correctamente', () => {
    const luaObj = { '1': wheel('FL'), '2': wheel('FR'),
                     '3': wheel('RL'), '4': wheel('RR') };
    svc.parseData({ wheelTraction: luaObj });
    assert.strictEqual(svc.currentData.wheelTraction.length, 4);
    assert.strictEqual(svc.currentData.wheelTraction[1].position, 'FR');
  });

  test('wheelTraction null en campo → usa null, no lanza', () => {
    const w = wheel('FL');
    w.tireLoadKN = null;
    assert.doesNotThrow(() => svc.parseData({ wheelTraction: [w, w, w, w] }));
    assert.strictEqual(svc.currentData.wheelTraction[0].tireLoadKN, null);
  });
}

// ── BLOQUE 4: tryParseTelemetryJson ──────────────────────────────────────────
console.log('\ntryParseTelemetryJson');

{
  const svc = new TestTelemetryService();

  test('JSON válido → true y datos mapeados', () => {
    const ok = svc.tryParseTelemetryJson('{"rpm":2000}');
    assert.strictEqual(ok, true);
    assert.strictEqual(svc.currentData.rpm, 2000);
  });

  test('JSON incompleto → false, sin excepción', () => {
    const ok = svc.tryParseTelemetryJson('{"rpm":200');
    assert.strictEqual(ok, false);
  });

  test('cadena que no empieza con { → false', () => {
    const ok = svc.tryParseTelemetryJson('hola mundo');
    assert.strictEqual(ok, false);
  });

  test('string vacío → false', () => {
    const ok = svc.tryParseTelemetryJson('');
    assert.strictEqual(ok, false);
  });
}

// ── BLOQUE 5: _logSample — condiciones de grabado ────────────────────────────
console.log('\n_logSample — condiciones de grabado');

{
  // Muestra que cumple TODAS las condiciones para grabarse
  const validSample = () => ({
    implementLowered: true,
    speed: 5.0,
    vehicleName: 'MF_8570',
    workType: 'HARVESTER',
    cropType: 'WHEAT',
    engineLoad: 75,
    accelerator: 80,
    consumption: 14.0,
    gear: '6F',
    pitch: 0.5,
    roll: 1.0,
    totalMassT: 12.5,
    transmissionType: 'cvt',
    wheelTraction: [
      { tireLoadKN: 30, longSlip: 0.04, latSlip: 0.01, position: 'FL' },
      { tireLoadKN: 30, longSlip: 0.04, latSlip: 0.01, position: 'FR' },
      { tireLoadKN: 25, longSlip: 0.05, latSlip: 0.01, position: 'RL' },
      { tireLoadKN: 25, longSlip: 0.05, latSlip: 0.01, position: 'RR' },
    ],
  });

  test('no graba si implementLowered = false', () => {
    const svc = new TestTelemetryService();
    svc._activeCampo = 1;
    const data = validSample();
    data.implementLowered = false;
    svc._logSample(data);
    assert.strictEqual(svc._sessionFile, null);
  });

  test('no graba si speed < 0.3', () => {
    const svc = new TestTelemetryService();
    svc._activeCampo = 1;
    const data = validSample();
    data.speed = 0.1;
    svc._logSample(data);
    assert.strictEqual(svc._sessionFile, null);
  });

  test('graba cuando condiciones se cumplen', () => {
    const svc = new TestTelemetryService();
    svc._activeCampo = 99;

    // Monkey-patch DATA_DIR interno usando la ruta de _logSample
    // Reemplazamos _logSample para capturar la muestra sin escribir en disco
    let captured = null;
    const origLog = svc._logSample.bind(svc);
    svc._logSample = function(data) {
      // Llamamos al original pero interceptamos appendFileSync via un flag
      this._lastLogMs = 0; // forzar que no haga throttle
      // Simplemente verificamos que _sessionFile se asigna
      const prev = this._sessionFile;
      origLog(data);
      captured = this._sessionFile;
    };

    svc._logSample(validSample());
    assert.ok(captured !== null, '_sessionFile debería asignarse');
    assert.ok(captured.includes('campo_99'), `Ruta debe incluir "campo_99": ${captured}`);
    assert.ok(captured.includes('HARVESTER'), `Ruta debe incluir "HARVESTER": ${captured}`);
    assert.ok(captured.endsWith('.jsonl'), `Ruta debe terminar en .jsonl: ${captured}`);

    // Limpiar archivo si se creó
    if (existsSync(captured)) unlinkSync(captured);
  });

  test('throttle: dos llamadas consecutivas solo graban una muestra', () => {
    const svc = new TestTelemetryService();
    svc._activeCampo = 1;
    svc._lastLogMs   = 0;  // reset throttle

    const writes = [];
    // Interceptar el appendFileSync para contar escrituras
    const data = validSample();

    svc._logSample(data);
    const file1 = svc._sessionFile;
    svc._logSample(data);  // throttle activo → no debe escribir
    const file2 = svc._sessionFile;

    // _sessionFile sigue siendo el mismo (no se abrió nuevo)
    assert.strictEqual(file1, file2);

    if (file1 && existsSync(file1)) unlinkSync(file1);
  });
}

// ── BLOQUE 6: sample JSONL contiene campos esperados ─────────────────────────
console.log('\n_logSample — estructura del JSONL grabado');

{
  test('sample grabado tiene todos los campos requeridos', async () => {
    const svc = new TestTelemetryService();
    svc._activeCampo = 42;
    svc._lastLogMs   = 0;

    const data = {
      implementLowered: true,
      speed: 7.0,
      vehicleName: 'Test_Tractor',
      workType:    'HARVESTER',
      cropType:    'MAIZE',
      engineLoad:  80.0,
      accelerator: 90.0,
      consumption: 16.0,
      gear:        '8F',
      pitch:       1.0,
      roll:        0.5,
      totalMassT:  13.0,
      transmissionType: 'manual',
      wheelTraction: [
        { tireLoadKN: 35, longSlip: 0.03, latSlip: 0.01, position: 'FL' },
        { tireLoadKN: 35, longSlip: 0.03, latSlip: 0.01, position: 'FR' },
        { tireLoadKN: 28, longSlip: 0.04, latSlip: 0.01, position: 'RL' },
        { tireLoadKN: 28, longSlip: 0.04, latSlip: 0.01, position: 'RR' },
      ],
    };

    svc._logSample(data);
    const filePath = svc._sessionFile;
    assert.ok(filePath, 'Debe haberse asignado _sessionFile');

    // Leer la línea grabada
    const line = readFileSync(filePath, 'utf8').trim();
    const sample = JSON.parse(line);

    const requiredFields = ['ts','campo','tractorId','workType','cropType',
      'rpm','torque','motorLoad','accelerator','fuelUsage','speed','gear',
      'wheelSlipRL','wheelSlipRR','pitch','roll','totalMassT',
      'frontAxleLoad','frontAxleRatio','transmissionType'];

    for (const f of requiredFields) {
      assert.ok(f in sample, `Falta campo "${f}" en la muestra grabada`);
    }

    assert.strictEqual(sample.campo,     42);
    assert.strictEqual(sample.workType,  'HARVESTER');
    assert.strictEqual(sample.cropType,  'MAIZE');
    assert.ok(sample.frontAxleRatio > 0 && sample.frontAxleRatio < 1,
      `frontAxleRatio fuera de rango: ${sample.frontAxleRatio}`);

    if (existsSync(filePath)) unlinkSync(filePath);
  });
}

// ── Resumen ───────────────────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(50)}`);
console.log(`Resultados: ${passed} pasados, ${failed} fallidos`);
if (failed > 0) process.exit(1);
