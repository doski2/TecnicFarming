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
