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
