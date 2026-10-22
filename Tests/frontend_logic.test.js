/**
 * Test de lógica del Frontend
 * Mocks básicos de DOM para validar cálculos de agujas y zonas.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GAUGE_JS_PATH = path.join(__dirname, '..', 'Dashboard', 'frontend', 'js', 'gauge.js');
const WORK_TYPES_PATH = path.join(__dirname, '..', 'Dashboard', 'frontend', 'js', 'modules', 'work-types.js');
const TELEMETRY_UI_PATH = path.join(__dirname, '..', 'Dashboard', 'frontend', 'js', 'modules', 'telemetry-ui.js');

// --- MOCK DOM ENVIRONMENT ---
const domElements = {};
global.document = {
  getElementById: (id) => {
    if (!domElements[id]) {
      domElements[id] = {
        id: id,
        textContent: '',
        attributes: {},
        setAttribute: function(name, val) { this.attributes[name] = val; }
      };
    }
    return domElements[id];
  }
};
global.window = {
  gaugeAnimator: null,
  speedGaugeAnimator: null
};
global.requestAnimationFrame = (callback) => {
  // No ejecutamos el loop infinito en tests
  return 1;
};

// Cargar el script de gauge.js
// Como es un script normal que asigna a window, lo leemos y evaluamos
const gaugeCode = fs.readFileSync(GAUGE_JS_PATH, 'utf8');
const evalGauge = () => {
  const evalCode = new Function('window', 'document', 'requestAnimationFrame', gaugeCode);
  evalCode(global.window, global.document, global.requestAnimationFrame);
};

const workTypesCode = fs.readFileSync(WORK_TYPES_PATH, 'utf8');
const evalWorkTypes = () => {
  const evalCode = new Function('window', workTypesCode);
  evalCode(global.window);
};

/** Extrae el ángulo de rotación del atributo transform SVG */
function parseRotateAngle(transform) {
  const match = transform.match(/rotate\(([-\d.]+)/);
  return match ? parseFloat(match[1]) : NaN;
}

describe('Frontend - Gauge Logic', () => {

  test('GaugeAnimator debe calcular ángulos correctamente', () => {
    evalGauge();

    const animator = global.window.gaugeAnimator;
    const needle = global.document.getElementById('needle-group');
    const originalRandom = Math.random;

    // El gauge añade jitter aleatorio a la aguja; fijamos random para ángulos deterministas
    Math.random = () => 0.5;

    try {
      // Test: 0 RPM -> -210 grados
      animator.targetRPM = 0;
      animator.currentRPM = 0;
      animator.animate();

      assert.strictEqual(parseRotateAngle(needle.attributes['transform']), -210, '0 RPM debe ser -210 grados');

      // Test: 8000 RPM (max) -> 30 grados (-210 + 240)
      animator.targetRPM = 8000;
      animator.currentRPM = 8000;
      animator.animate();
      assert.strictEqual(parseRotateAngle(needle.attributes['transform']), 30, '8000 RPM debe ser 30 grados');
    } finally {
      Math.random = originalRandom;
    }
  });

  test('updateZoneLines debe posicionar las marcas ECO/OPT', () => {
    const animator = global.window.gaugeAnimator;
    
    // Eco a 1000 RPM (1/8 de 8000)
    // -210 + (1/8 * 240) = -210 + 30 = -180
    animator.updateZoneLines(1000, 2000);
    
    const ecoLine = global.document.getElementById('eco-line-group');
    const optLine = global.document.getElementById('opt-line-group');
    
    assert.ok(ecoLine.attributes['transform'].includes('rotate(-180'), '1000 RPM ECO debe ser -180 grados');
    assert.ok(optLine.attributes['transform'].includes('rotate(-150'), '2000 RPM OPT debe ser -150 grados');
  });

  test('SpeedGaugeAnimator debe calcular ángulos de velocidad', () => {
    const speedAnimator = global.window.speedGaugeAnimator;
    
    // 0 km/h -> -210 grados
    speedAnimator.targetSpeed = 0;
    speedAnimator.currentSpeed = 0;
    speedAnimator.animate();
    
    const speedNeedle = global.document.getElementById('speed-needle-group');
    assert.ok(speedNeedle.attributes['transform'].includes('rotate(-210'), '0 km/h debe ser -210 grados');

    // 30 km/h (mitad de 60) -> -210 + 120 = -90 grados
    speedAnimator.targetSpeed = 30;
    speedAnimator.currentSpeed = 30;
    speedAnimator.animate();
    assert.ok(speedNeedle.attributes['transform'].includes('rotate(-90'), '30 km/h debe ser -90 grados');
  });
});

function evalTelemetryUI() {
  const code = fs.readFileSync(TELEMETRY_UI_PATH, 'utf8');
  const evalCode = new Function('window', code);
  evalCode(global.window);
}

describe('Frontend - TelemetryUI', () => {
  test('formatGearDisplay CVT y grupo+marcha', () => {
    evalTelemetryUI();
    const ui = global.window.TelemetryUI;

    assert.strictEqual(ui.formatGearDisplay({ transmissionType: 'cvt' }), 'CVT');
    assert.strictEqual(
      ui.formatGearDisplay({ gearGroupName: 'A', currentGear: '3' }),
      'A3'
    );
    assert.strictEqual(
      ui.formatGearDisplay({ gearGroupName: 'A', currentGear: 'A1' }),
      'A1'
    );
  });

  test('isRecording requiere implemento bajado y velocidad', () => {
    evalTelemetryUI();
    const ui = global.window.TelemetryUI;

    assert.strictEqual(ui.isRecording({ implementLowered: true, speed: 1 }), true);
    assert.strictEqual(ui.isRecording({ implementLowered: true, speed: 0.1 }), false);
    assert.strictEqual(ui.isRecording({ implementLowered: false, speed: 10 }), false);
  });

  test('isRecording prioriza el valor calculado por el backend', () => {
    evalTelemetryUI();
    const ui = global.window.TelemetryUI;

    // Con simulador el backend dice false aunque implemento+velocidad cumplan
    assert.strictEqual(ui.isRecording({ isRecording: false, implementLowered: true, speed: 5 }), false);
    assert.strictEqual(ui.isRecording({ isRecording: true }), true);
  });

  test('slipPercent prioriza el patinaje de MoreRealistic', () => {
    evalTelemetryUI();
    const ui = global.window.TelemetryUI;
    assert.strictEqual(ui.slipPercent({ mrAvgDrivenWheelsSlip: 0.18, wheelTraction: [{}, {}, { longSlip: 0.5 }, { longSlip: 0.5 }] }), 18);
    assert.strictEqual(ui.slipPercent({ mrAvgDrivenWheelsSlip: 3 }), 100);
  });

  test('slipPercent usa longSlip trasero', () => {
    evalTelemetryUI();
    const ui = global.window.TelemetryUI;

    const pct = ui.slipPercent({
      wheelTraction: [
        {}, {},
        { longSlip: 0.10 },
        { longSlip: 0.20 }
      ]
    });
    assert.strictEqual(pct, 15);
  });
});

describe('Frontend - WorkTypes', () => {
  test('getLabel devuelve etiquetas label, short y profile', () => {
    evalWorkTypes();
    const wt = global.window.WorkTypes;

    assert.strictEqual(wt.getLabel('HARVESTER', 'label'), 'Cosechadora');
    assert.strictEqual(wt.getLabel('HARVESTER', 'short'), 'Cosecha');
    assert.strictEqual(wt.getLabel('HARVESTER', 'profile'), 'COSECHA');
    assert.strictEqual(wt.getLabel('SOWER', 'short'), 'Siembra');
  });

  test('HARVESTING y HARVESTER comparten etiquetas', () => {
    evalWorkTypes();
    const wt = global.window.WorkTypes;

    assert.strictEqual(wt.getLabel('HARVESTING', 'profile'), wt.getLabel('HARVESTER', 'profile'));
    assert.strictEqual(wt.getLabel('HARVESTING', 'label'), wt.getLabel('HARVESTER', 'label'));
  });

  test('código desconocido devuelve el código original', () => {
    evalWorkTypes();
    const wt = global.window.WorkTypes;

    assert.strictEqual(wt.getLabel('CUSTOM_MOD', 'label'), 'CUSTOM_MOD');
    assert.strictEqual(wt.getLabel(null, 'short'), '—');
  });
});

describe('Frontend - DynoChart', () => {
  const DYNO_PATH = path.join(__dirname, '..', 'Dashboard', 'frontend', 'js', 'modules', 'dyno-chart.js');
  const dynoCode = fs.readFileSync(DYNO_PATH, 'utf8');

  /** Evalúa dyno-chart.js con un localStorage simulado y devuelve { DynoChart, store } */
  function loadDyno(initial) {
    const store = Object.assign({}, initial);
    const localStorage = {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
    };
    const DynoChart = new Function('localStorage', 'document', 'window', dynoCode + '\nreturn DynoChart;')(
      localStorage, {}, {}
    );
    return { DynoChart, store };
  }

  test('record acumula pico y curva aplicada por bucket de 25 rpm', () => {
    const { DynoChart } = loadDyno();
    const d = new DynoChart();
    d.record('T1', 1500, 900, 400);
    d.record('T1', 1510, 900, 450);
    assert.strictEqual(d.curves.T1.max[1500], 450);
    assert.ok(d.curves.T1.applied[1500] > 0);
  });

  test('record ignora rpm bajas y transitorios', () => {
    const { DynoChart } = loadDyno();
    const d = new DynoChart();
    d.record('T1', 300, 0, 500);
    assert.strictEqual(d.curves.T1, undefined);

    const realNow = Date.now;
    let t = 1000;
    Date.now = () => t;
    try {
      d.record('T1', 1500, 0, 400);
      t += 100;
      d.record('T1', 2500, 0, 900); // 10000 rpm/s → transitorio
      assert.strictEqual(d.curves.T1.max[2500], undefined);
    } finally { Date.now = realNow; }
  });

  test('reset borra solo el vehículo indicado y persiste', () => {
    const { DynoChart, store } = loadDyno();
    const d = new DynoChart();
    d.record('A', 1500, 0, 400);
    d.record('B', 1500, 0, 400);
    d.reset('A');
    assert.strictEqual(d.curves.A, undefined);
    assert.ok(d.curves.B);
    assert.ok(!JSON.parse(store.dyno_curves_v4).A);
  });

  test('_load descarta datos corruptos y valida valores', () => {
    const bad = JSON.stringify({ X: 'basura', Y: { max: { '1500': 'abc', '1600': 300 }, applied: null } });
    const { DynoChart } = loadDyno({ dyno_curves_v4: bad });
    const d = new DynoChart();
    assert.strictEqual(d.curves.X, undefined);
    assert.deepStrictEqual(d.curves.Y.max, { 1600: 300 });
    assert.doesNotThrow(() => d._computeScales('Y'));
  });

  test('persistencia limita el número de vehículos', () => {
    const { DynoChart, store } = loadDyno();
    const d = new DynoChart();
    for (let i = 0; i < 35; i++) {
      d.curves['V' + i] = { max: { 1500: 100 }, applied: {}, t: i + 1 };
    }
    d._flush();
    const saved = JSON.parse(store.dyno_curves_v4);
    assert.strictEqual(Object.keys(saved).length, 30);
    assert.ok(saved.V34 && !saved.V0);
  });
});
