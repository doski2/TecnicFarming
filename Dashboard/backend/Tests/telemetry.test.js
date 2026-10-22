import { test, describe } from 'node:test';
import assert from 'node:assert';
import { readFileSync, unlinkSync, existsSync } from 'fs';
import TelemetryService, { resolvePipeName } from '../src/services/telemetry.js';

const { computeMrAvgDrivenWheelsSlip } = TelemetryService;

const mockLogger = {
  info: () => {},
  error: () => {},
  warn: () => {}
};

function near(a, b, delta = 0.01) {
  assert.ok(Math.abs(a - b) <= delta, `${a} ≈ ${b} (delta ${delta})`);
}

function wheel(pos) {
  return {
    position: pos,
    motorized: true,
    torquePercent: 50,
    slip: 0.02,
    speedMs: 3,
    contact: true,
    tireLoadKN: 25,
    longSlip: 0.05,
    latSlip: 0.01,
    groundType: 'soil',
    rrFx: 0.1,
    pressureFx: 1.0
  };
}

function validLogSample() {
  return {
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
    wheelTraction: ['FL', 'FR', 'RL', 'RR'].map(wheel)
  };
}

describe('TelemetryService', () => {
  test('debe inicializarse con valores por defecto', () => {
    const service = new TelemetryService(mockLogger);
    assert.strictEqual(service.isConnected, false);
    assert.strictEqual(service.currentData.rpm, 0);
    assert.strictEqual(service.currentData.driveType, '4WD');
  });

  test('parseData debe mapear correctamente campos básicos', () => {
    const service = new TelemetryService(mockLogger);
    service.parseData({
      rpm: 1500,
      fuelUsage: 25.5,
      speed: 30,
      vehicleName: 'Fendt 724'
    });

    assert.strictEqual(service.currentData.rpm, 1500);
    assert.strictEqual(service.currentData.consumption, 25.5);
    assert.strictEqual(service.currentData.speed, 30);
    assert.strictEqual(service.currentData.vehicleName, 'Fendt 724');
  });

  test('parseData debe manejar campos específicos de MoreRealistic', () => {
    const service = new TelemetryService(mockLogger);
    service.parseData({
      mrPowerBandMinRpm: 1200,
      mrPowerBandMaxRpm: 1800,
      mrPeakPowerRpm: 1700,
      motorLoad: 85.5
    });

    assert.strictEqual(service.currentData.mrPowerBandMinRpm, 1200);
    assert.strictEqual(service.currentData.mrPowerBandMaxRpm, 1800);
    assert.strictEqual(service.currentData.mrPeakPowerRpm, 1700);
    assert.strictEqual(service.currentData.engineLoad, 85.5);
  });

  test('EMA para totalMassT debe suavizar cambios', () => {
    const service = new TelemetryService(mockLogger);
    service.parseData({ totalMassT: 10 });
    assert.strictEqual(service.currentData.totalMassT, 10);
    service.parseData({ totalMassT: 20 });
    assert.strictEqual(service.currentData.totalMassT, 10.4);
    service.parseData({ totalMassT: 20 });
    assert.strictEqual(service.currentData.totalMassT, 10.78);
  });

  test('handleData debe procesar chunks divididos por saltos de línea', () => {
    const service = new TelemetryService(mockLogger);
    let parsedCount = 0;
    service.parseData = () => { parsedCount++; };
    service.handleData('{"rpm":1000}\n{"rpm":1100}\n');
    assert.strictEqual(parsedCount, 2);
    assert.strictEqual(service.buffer, '');
  });

  test('handleData debe manejar JSON parcial en el buffer', () => {
    const service = new TelemetryService(mockLogger);
    let parsedCount = 0;
    service.parseData = () => { parsedCount++; };
    service.handleData('{"rpm":1000');
    assert.strictEqual(parsedCount, 0);
    assert.strictEqual(service.buffer, '{"rpm":1000');
    service.handleData('}\n');
    assert.strictEqual(parsedCount, 1);
    assert.strictEqual(service.buffer, '');
  });

  test('mapeo de tracción de ruedas debe ser robusto', () => {
    const service = new TelemetryService(mockLogger);
    service.parseData({
      driveType: 'AWD',
      wheelTraction: {
        '1': { position: 'FL', motorized: true, torquePercent: 25 },
        '2': { position: 'FR', motorized: true, torquePercent: 25 },
        '3': { position: 'RL', motorized: true, torquePercent: 25 },
        '4': { position: 'RR', motorized: true, torquePercent: 25 }
      }
    });

    assert.strictEqual(service.currentData.driveType, 'AWD');
    assert.strictEqual(service.currentData.wheelTraction.length, 4);
    assert.strictEqual(service.currentData.wheelTraction[0].position, 'FL');
    assert.strictEqual(service.currentData.wheelTraction[0].torquePercent, 25);
  });
});

describe('parseData — mapeo extendido', () => {
  test('mapea torque, cropType, workType, transmissionType e implementLowered', () => {
    const svc = new TelemetryService(mockLogger);
    svc.parseData({
      torqueNm: 450,
      cropType: 'WHEAT',
      workType: 'HARVESTER',
      implementLowered: 1,
      transmissionType: 'cvt'
    });
    assert.strictEqual(svc.currentData.torque, 450);
    assert.strictEqual(svc.currentData.cropType, 'WHEAT');
    assert.strictEqual(svc.currentData.workType, 'HARVESTER');
    assert.strictEqual(svc.currentData.transmissionType, 'cvt');
    assert.strictEqual(svc.currentData.implementLowered, true);
    svc.parseData({ implementLowered: 0 });
    assert.strictEqual(svc.currentData.implementLowered, false);
  });

  test('vehicleWearAmount clamped entre 0-1', () => {
    const svc = new TelemetryService(mockLogger);
    svc.parseData({ vehicleWearAmount: 1.5 });
    assert.strictEqual(svc.currentData.vehicleWearAmount, 1);
    svc.parseData({ vehicleWearAmount: -0.5 });
    assert.strictEqual(svc.currentData.vehicleWearAmount, 0);
  });

  test('vehicleDamageAmount y isVehicleBroken', () => {
    const svc = new TelemetryService(mockLogger);
    svc.parseData({ vehicleDamageAmount: 0.15 });
    near(svc.currentData.tractorDamage, 15.0);
    svc.parseData({ vehicleDamageAmount: 50 });
    near(svc.currentData.tractorDamage, 50);
    svc.parseData({ vehicleDamageAmount: 100, isVehicleBroken: false });
    assert.strictEqual(svc.currentData.isVehicleBroken, true);
  });

  test('campo no reconocido no rompe parseData', () => {
    const svc = new TelemetryService(mockLogger);
    assert.doesNotThrow(() => svc.parseData({ campoDesconocido: 'xyz' }));
  });
});

describe('parseData — EMA de totalMassT', () => {
  test('EMA converge y ignora valores <= 0', () => {
    const svc = new TelemetryService(mockLogger);
    svc.parseData({ totalMassT: 10.0 });
    for (let i = 0; i < 100; i++) svc.parseData({ totalMassT: 20.0 });
    assert.ok(svc.currentData.totalMassT > 19.0);

    const svc2 = new TelemetryService(mockLogger);
    svc2.parseData({ totalMassT: 15.0 });
    const before = svc2.currentData.totalMassT;
    svc2.parseData({ totalMassT: 0 });
    assert.strictEqual(svc2.currentData.totalMassT, before);
  });
});

describe('parseData — wheelTraction', () => {
  test('array y objeto Lua 1-indexed', () => {
    const svc = new TelemetryService(mockLogger);
    svc.parseData({ wheelTraction: ['FL', 'FR', 'RL', 'RR'].map(wheel) });
    assert.strictEqual(svc.currentData.wheelTraction[0].position, 'FL');
    near(svc.currentData.wheelTraction[2].tireLoadKN, 25);

    const luaObj = { '1': wheel('FL'), '2': wheel('FR'), '3': wheel('RL'), '4': wheel('RR') };
    svc.parseData({ wheelTraction: luaObj });
    assert.strictEqual(svc.currentData.wheelTraction[1].position, 'FR');
  });
});

describe('tryParseTelemetryJson', () => {
  test('JSON válido, incompleto o inválido', () => {
    const svc = new TelemetryService(mockLogger);
    assert.strictEqual(svc.tryParseTelemetryJson('{"rpm":2000}'), true);
    assert.strictEqual(svc.currentData.rpm, 2000);
    assert.strictEqual(svc.tryParseTelemetryJson('{"rpm":200'), false);
    assert.strictEqual(svc.tryParseTelemetryJson('hola mundo'), false);
    assert.strictEqual(svc.tryParseTelemetryJson(''), false);
  });
});

describe('emisión al dashboard', () => {
  test('callback emite aunque isRealData sea false', async () => {
    const svc = new TelemetryService(mockLogger);
    let count = 0;
    svc.startCollecting(() => { count += 1; });
    await new Promise((resolve) => setTimeout(resolve, 40));
    assert.ok(count > 0, 'debe emitir estado inicial sin esperar al juego');
    svc.stop();
  });
});

describe('toClientPayload', () => {
  test('expone aliases para el dashboard', () => {
    const svc = new TelemetryService(mockLogger);
    svc.parseData({ rpm: 1800, motorLoad: 70, fuelUsage: 12.5, torqueNm: 400 });
    const payload = svc.getCurrentData();
    assert.strictEqual(payload.engineSpeed, 1800);
    assert.strictEqual(payload.motorLoad, 70);
    assert.strictEqual(payload.fuelUsagePerHour, 12.5);
    assert.strictEqual(payload.motorTorque, 400);
    assert.strictEqual(payload.wheelTraction.length, 4);
  });
});

describe('_logSample', () => {
  test('no graba sin implemento bajado o con speed baja', () => {
    const svc = new TelemetryService(mockLogger);
    svc._activeCampo = 1;
    const data = validLogSample();
    data.implementLowered = false;
    svc._logSample(data);
    assert.strictEqual(svc._sessionFile, null);

    data.implementLowered = true;
    data.speed = 0.1;
    svc._logSample(data);
    assert.strictEqual(svc._sessionFile, null);
  });

  test('graba JSONL con campos requeridos', () => {
    const svc = new TelemetryService(mockLogger);
    svc._activeCampo = 42;
    svc._lastLogMs = 0;
    svc._logSample(validLogSample());
    const filePath = svc._sessionFile;
    assert.ok(filePath);
    assert.ok(filePath.includes('campo_42'));
    assert.ok(filePath.endsWith('.jsonl'));

    const sample = JSON.parse(readFileSync(filePath, 'utf8').trim());
    const required = ['ts', 'campo', 'tractorId', 'workType', 'cropType', 'rpm', 'motorLoad',
      'accelerator', 'fuelUsage', 'speed', 'gear', 'wheelSlipRL', 'wheelSlipRR', 'pitch', 'roll',
      'totalMassT', 'frontAxleLoad', 'frontAxleRatio', 'transmissionType'];
    for (const field of required) {
      assert.ok(field in sample, `Falta campo "${field}"`);
    }
    assert.strictEqual(sample.campo, 42);
    assert.strictEqual(sample.workType, 'HARVESTER');

    if (existsSync(filePath)) unlinkSync(filePath);
  });
});

describe('computeMrAvgDrivenWheelsSlip', () => {
  test('media de longSlip trasero', () => {
    const slip = computeMrAvgDrivenWheelsSlip([
      { slip: 0.1 },
      { slip: 0.1 },
      { longSlip: 0.12 },
      { longSlip: 0.08 }
    ]);
    assert.ok(Math.abs(slip - 0.1) < 0.001);
  });

  test('sin datos traseros devuelve 0', () => {
    assert.strictEqual(computeMrAvgDrivenWheelsSlip([]), 0);
  });
});

describe('resolvePipeName', () => {
  const expected = '\\\\.\\pipe\\SHTelemetry';

  test('nombre simple desde .env', () => {
    process.env.NAMED_PIPE_NAME = 'SHTelemetry';
    assert.strictEqual(resolvePipeName(), expected);
  });

  test('ruta completa con escapes duplicados (bug .env antiguo)', () => {
    process.env.NAMED_PIPE_NAME = '\\\\.\\pipe\\SHTelemetry';
    assert.strictEqual(resolvePipeName(), expected);
  });

  test('sin variable de entorno', () => {
    delete process.env.NAMED_PIPE_NAME;
    assert.strictEqual(resolvePipeName(), expected);
  });
});

describe('isInVehicle (B1)', () => {
  test('al salir del vehículo se limpia el estado y no se graba', () => {
    const svc = new TelemetryService(mockLogger);
    svc.parseData({ rpm: 1800, speed: 8, implementLowered: true, implementWorking: true, workType: 'HARVESTER' });
    assert.strictEqual(svc.currentData.implementLowered, true);

    svc.parseData({ isInVehicle: false });
    assert.strictEqual(svc.currentData.isInVehicle, false);
    assert.strictEqual(svc.currentData.rpm, 0);
    assert.strictEqual(svc.currentData.speed, 0);
    assert.strictEqual(svc.currentData.implementLowered, false);
    assert.strictEqual(svc.currentData.implementWorking, false);
  });

  test('_logSample no graba si isInVehicle es false', () => {
    const svc = new TelemetryService(mockLogger);
    svc._logSample({ ...validLogSample(), isInVehicle: false });
    assert.strictEqual(svc._sessionFile, null);
  });

  test('al volver a un vehículo se restablece isInVehicle', () => {
    const svc = new TelemetryService(mockLogger);
    svc.parseData({ isInVehicle: false });
    svc.parseData({ isInVehicle: true, rpm: 1200 });
    assert.strictEqual(svc.currentData.isInVehicle, true);
    assert.strictEqual(svc.currentData.rpm, 1200);
  });
});

describe('isRecording y sessionSamples (B4/B8)', () => {
  test('grabando solo con datos reales (no mock) y dentro del vehículo', () => {
    const svc = new TelemetryService(mockLogger);
    svc.isRealData = true;
    svc.parseData({ speed: 5, implementLowered: true, workType: 'SOWER', telemetrySource: 'fs25' });
    assert.strictEqual(svc.getCurrentData().isRecording, true);

    svc.parseData({ telemetrySource: 'mock' });
    assert.strictEqual(svc.getCurrentData().isRecording, false);
  });

  test('no graba transporte ni tipo desconocido (solo trabajo en campo)', () => {
    const svc = new TelemetryService(mockLogger);
    svc.isRealData = true;
    svc._activeCampo = 1;
    svc.parseData({ speed: 5, implementLowered: true, telemetrySource: 'fs25' });
    ['TRANSPORT', 'UNKNOWN', ''].forEach((workType) => {
      svc.parseData({ workType });
      assert.strictEqual(svc.getCurrentData().isRecording, false, workType);
      svc._logSample({ ...validLogSample(), workType });
      assert.strictEqual(svc._sessionFile, null, workType);
    });
    ['HARVESTER', 'SOWER', 'CULTIVATOR', 'PLOW', 'MOWER', 'BALER', 'SPRAYER', 'FERTILIZER', 'FIELDWORK'].forEach((workType) => {
      svc.parseData({ workType });
      assert.strictEqual(svc.getCurrentData().isRecording, true, workType);
    });
  });

  test('usa el patinaje de MoreRealistic si llega y calcula el propio si no', () => {
    const svc = new TelemetryService(mockLogger);
    svc.parseData({ mrAvgDrivenWheelsSlip: 0.12 });
    assert.strictEqual(svc.getCurrentData().mrAvgDrivenWheelsSlip, 0.12);
    const svc2 = new TelemetryService(mockLogger);
    svc2.parseData({ wheelTraction: [{}, {}, { longSlip: 0.2 }, { longSlip: 0.4 }] });
    assert.ok(Math.abs(svc2.getCurrentData().mrAvgDrivenWheelsSlip - 0.3) < 1e-9);
  });

  test('payload incluye sessionSamples', () => {
    const svc = new TelemetryService(mockLogger);
    svc._sessionSamples = 7;
    assert.strictEqual(svc.getCurrentData().sessionSamples, 7);
  });
});
