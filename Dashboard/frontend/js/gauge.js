/**
 * Gauge Module
 * Handles SVG tachometer needle animation and line calculations
 */

class GaugeAnimator {
  constructor() {
    this.targetRPM = 0;
    this.currentRPM = 0;
    this.maxRPM = 8000; // 8 on gauge = 8000 RPM (×1000)
    this.animationId = null;
    this.lastUpdateTime = Date.now();
    
    // SVG elements
    this.needleGroup = document.getElementById('needle-group');
    this.ecoLineGroup = document.getElementById('eco-line-group');
    this.optLineGroup = document.getElementById('opt-line-group');
    this.rpmDisplay = document.getElementById('rpm-display');
    
    this.setup();
  }

  setup() {
    // Start animation loop
    this.animate();
  }

  animate() {
    this.lastUpdateTime = Date.now();

    // Smooth needle movement
    const difference = this.targetRPM - this.currentRPM;
    const acceleration = 0.15; // Tune this for needle responsiveness
    
    if (Math.abs(difference) > 1) {
      this.currentRPM += difference * acceleration;
    } else {
      this.currentRPM = this.targetRPM;
    }

    // Add slight jitter to needle for realism
    const jitter = (Math.random() - 0.5) * 20;
    const displayRPM = this.currentRPM + jitter;

    // Calculate needle rotation (240° sweep: -210° at 0 RPM → +30° at maxRPM)
    const rpm = Math.max(0, Math.min(displayRPM, this.maxRPM));
    const percentage = rpm / this.maxRPM;
    const angle = -210 + (percentage * 240);

    // Rotate needle (SVG center is 160,160)
    const translateX = 160;
    const translateY = 160;
    this.needleGroup.setAttribute('transform', `rotate(${angle} ${translateX} ${translateY})`);

    // Update RPM display
    this.rpmDisplay.textContent = Math.round(this.currentRPM).toString();

    this.animationId = requestAnimationFrame(() => this.animate());
  }

  setRPM(rpm) {
    this.targetRPM = Math.max(0, Math.min(rpm, this.maxRPM));
  }

  /**
   * Update efficiency zone visual lines
   * @param {number} ecoRPM - ECO zone RPM
   * @param {number} optimalRPM - OPTIMAL zone RPM
   */
  updateZoneLines(ecoRPM, optimalRPM) {
    const ecoPercentage = ecoRPM / this.maxRPM;
    const optimalPercentage = optimalRPM / this.maxRPM;

    const ecoAngle = -210 + (ecoPercentage * 240);
    const optAngle = -210 + (optimalPercentage * 240);

    const translateX = 160;
    const translateY = 160;

    this.ecoLineGroup.setAttribute('transform', `rotate(${ecoAngle} ${translateX} ${translateY})`);
    this.optLineGroup.setAttribute('transform', `rotate(${optAngle} ${translateX} ${translateY})`);

    // Update zone displays
    document.getElementById('zone-eco').textContent = ecoRPM.toString();
    document.getElementById('zone-opt').textContent = optimalRPM.toString();
  }
}

// Create global gauge instance
window.gaugeAnimator = new GaugeAnimator();

// ─── Speed Gauge Animator ────────────────────────────────────────────────────
class SpeedGaugeAnimator {
  constructor() {
    this.targetSpeed  = 0;
    this.currentSpeed = 0;
    this.maxSpeed     = 60; // km/h — escala del reloj de velocidad
    this.animationId  = null;

    this.needleGroup  = document.getElementById('speed-needle-group');
    this.speedDisplay = document.getElementById('speed-display');

    this.animate();
  }

  animate() {

    const diff = this.targetSpeed - this.currentSpeed;
    if (Math.abs(diff) > 0.05) {
      this.currentSpeed += diff * 0.15;
    } else {
      this.currentSpeed = this.targetSpeed;
    }

    const spd = Math.max(0, Math.min(this.currentSpeed, this.maxSpeed));
    const angle = -210 + (spd / this.maxSpeed) * 240;

    if (this.needleGroup) {
      this.needleGroup.setAttribute('transform', 'rotate(' + angle.toFixed(2) + ' 160 160)');
    }
    if (this.speedDisplay) {
      this.speedDisplay.textContent = spd.toFixed(1);
    }

    this.animationId = requestAnimationFrame(() => this.animate());
  }

  setSpeed(speed) {
    this.targetSpeed = Math.max(0, Math.min(Math.abs(speed || 0), this.maxSpeed));
  }
}

// Create global speed gauge instance
window.speedGaugeAnimator = new SpeedGaugeAnimator();
