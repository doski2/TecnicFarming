/**
 * DynoChart — curvas de par motor estilo FS25
 *
 * Eje X dinámico: de minRPM datos hasta maxRPM datos (usa toda la pantalla)
 * Eje Y dinámico: escala al par máximo real + 15% headroom
 * Curvas suaves mediante Catmull-Rom → Cubic Bézier
 *
 * Ámbar (sólida) = maxTorqueNm  — par DISPONIBLE (capacidad del motor)
 * Teal  (sólida) = appliedTorque — par APLICADO promedio (demanda real)
 * Barra verde     = carga actual en eje izquierdo
 */
var DynoChart = (function() {
  var STORAGE_KEY = 'dyno_curves_v3';
  var BUCKET = 25;
  var EMA_A  = 0.35;
  var W = 280;
  var H = 160;

  // Escalas dinámicas — actualizadas en cada render(), single-thread safe
  var _minRpm    = 0;
  var _maxRpm    = 3000;
  var _maxTorque = 1000;

  function DynoChart() {
    this.curves     = this._load();
    this._saveTimer = null;
  }

  DynoChart.prototype._load = function() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; } catch(e) { return {}; }
  };

  DynoChart.prototype._scheduleSave = function() {
    if (this._saveTimer) clearTimeout(this._saveTimer);
    var self = this;
    this._saveTimer = setTimeout(function() {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(self.curves)); } catch(e) {}
    }, 8000);
  };

  DynoChart.prototype._ensureVehicle = function(name) {
    if (!this.curves[name]) { this.curves[name] = { max: {}, applied: {} }; return; }
    if (!this.curves[name].max) { var old = this.curves[name]; this.curves[name] = { max: old, applied: {} }; }
  };

  DynoChart.prototype.record = function(vehicleName, rpm, maxTorqueNm, appliedNm) {
    if (!vehicleName || rpm < 400) return;
    this._ensureVehicle(vehicleName);
    var b = Math.round(rpm / BUCKET) * BUCKET;
    var c = this.curves[vehicleName];
    var changed = false;
    // Curva ámbar = pico de par APLICADO en cada bucket RPM.
    // El juego envía maxTorqueNm como constante (par nominal de placa),
    // por eso no lo usamos aquí — resultaría en una línea plana.
    if (appliedNm > 0 && appliedNm > (c.max[b] || 0)) {
      c.max[b] = Math.round(appliedNm); changed = true;
    }
    if (appliedNm > 0) {
      c.applied[b] = !c.applied[b] ? Math.round(appliedNm)
        : Math.round(c.applied[b] * (1 - EMA_A) + appliedNm * EMA_A);
      changed = true;
    }
    if (changed) this._scheduleSave();
  };

  DynoChart.prototype._getPoints = function(vehicleName) {
    if (!vehicleName || !this.curves[vehicleName]) return { maxPts: [], appliedPts: [] };
    this._ensureVehicle(vehicleName);
    var c = this.curves[vehicleName];
    var seen = {};
    Object.keys(c.max).forEach(function(k) { seen[k] = true; });
    Object.keys(c.applied).forEach(function(k) { seen[k] = true; });
    var keys = Object.keys(seen).map(Number).sort(function(a, b) { return a - b; });
    var maxPts = [], appliedPts = [];
    for (var i = 0; i < keys.length; i++) {
      var r = keys[i];
      if (c.max[r] !== undefined)     maxPts.push({ rpm: r, torque: c.max[r] });
      if (c.applied[r] !== undefined) appliedPts.push({ rpm: r, torque: c.applied[r] });
    }
    return { maxPts: maxPts, appliedPts: appliedPts };
  };

  /** Calcula los rangos dinámicos para que los datos usen toda la pantalla */
  DynoChart.prototype._computeScales = function(vehicleName) {
    if (!vehicleName || !this.curves[vehicleName]) {
      _minRpm = 0; _maxRpm = 3000; _maxTorque = 1000; return;
    }
    this._ensureVehicle(vehicleName);
    var c = this.curves[vehicleName];
    var allKeys = Object.keys(c.max).concat(Object.keys(c.applied)).map(Number);
    if (!allKeys.length) { _minRpm = 0; _maxRpm = 3000; _maxTorque = 1000; return; }

    var minKey = Math.min.apply(null, allKeys);
    var maxKey = Math.max.apply(null, allKeys);
    // Padding 5% a cada lado para que las curvas no toquen los bordes
    var pad = Math.max((maxKey - minKey) * 0.05, 50);
    _minRpm = Math.max(0,    Math.floor((minKey - pad) / 100) * 100);
    _maxRpm =                Math.ceil( (maxKey + pad) / 100) * 100;

    var allTorques = [];
    Object.keys(c.max).forEach(function(k) { allTorques.push(c.max[k]); });
    Object.keys(c.applied).forEach(function(k) { allTorques.push(c.applied[k]); });
    var maxT = allTorques.length ? Math.max.apply(null, allTorques) : 1000;
    _maxTorque = Math.max(Math.ceil(maxT * 1.15 / 100) * 100, 100);
  };

  function rpmToX(rpm) {
    var range = _maxRpm - _minRpm;
    return range <= 0 ? 0 : Math.max(0, Math.min(W, ((rpm - _minRpm) / range) * W));
  }

  function torqueToY(t) {
    return H - (Math.max(0, Math.min(t, _maxTorque)) / _maxTorque) * H;
  }

  function toScreen(dataPts) {
    return dataPts.map(function(p) { return { x: rpmToX(p.rpm), y: torqueToY(p.torque) }; });
  }

  /** Catmull-Rom → Cubic Bézier: curva suave que pasa por todos los puntos */
  function smoothPath(sc) {
    if (!sc.length) return '';
    var d = 'M' + sc[0].x.toFixed(1) + ',' + sc[0].y.toFixed(1);
    if (sc.length < 3) {
      for (var k = 1; k < sc.length; k++) d += ' L' + sc[k].x.toFixed(1) + ',' + sc[k].y.toFixed(1);
      return d;
    }
    for (var i = 0; i < sc.length - 1; i++) {
      var p0 = sc[Math.max(0, i - 1)];
      var p1 = sc[i];
      var p2 = sc[i + 1];
      var p3 = sc[Math.min(sc.length - 1, i + 2)];
      var cp1x = p1.x + (p2.x - p0.x) / 12;
      var cp1y = p1.y + (p2.y - p0.y) / 12;
      var cp2x = p2.x - (p3.x - p1.x) / 12;
      var cp2y = p2.y - (p3.y - p1.y) / 12;
      d += ' C' + cp1x.toFixed(1) + ',' + cp1y.toFixed(1) + ' ' +
                  cp2x.toFixed(1) + ',' + cp2y.toFixed(1) + ' ' +
                  p2.x.toFixed(1) + ',' + p2.y.toFixed(1);
    }
    return d;
  }

  function buildLine(dataPts) { return smoothPath(toScreen(dataPts)); }

  function buildArea(dataPts) {
    var sc = toScreen(dataPts);
    if (sc.length < 2) return '';
    return smoothPath(sc) +
      ' L' + sc[sc.length - 1].x.toFixed(1) + ',' + H +
      ' L' + sc[0].x.toFixed(1) + ',' + H + ' Z';
  }

  function el(id) { return document.getElementById(id); }

  DynoChart.prototype.render = function(vehicleName, currentRpm, currentTorque, currentMaxTorque, mrBandMin, mrBandMax, mrPeakRpm, mrEcoRpm) {
    this._computeScales(vehicleName);

    var data       = this._getPoints(vehicleName);
    var maxPts     = data.maxPts;
    var appliedPts = data.appliedPts;

    var badge = el('dyno-vehicle-name');
    if (badge) badge.textContent = vehicleName || '—';

    // Áreas de relleno y curvas
    var maEl = el('dyno-max-area');     if (maEl) maEl.setAttribute('d', buildArea(maxPts));
    var aaEl = el('dyno-app-area');     if (aaEl) aaEl.setAttribute('d', buildArea(appliedPts));
    var mxEl = el('dyno-torque-path'); if (mxEl) mxEl.setAttribute('d', buildLine(maxPts));
    var apEl = el('dyno-applied-path');if (apEl) apEl.setAttribute('d', buildLine(appliedPts));

    // Línea vertical en RPM actual
    var cX = rpmToX(currentRpm).toFixed(1);
    var cY = torqueToY(currentTorque).toFixed(1);
    var rLine = el('dyno-rpm-line');
    if (rLine && currentRpm > 0) {
      rLine.setAttribute('x1', cX); rLine.setAttribute('x2', cX);
      rLine.setAttribute('opacity', '1');
    }

    // Punto vivo
    var dot = el('dyno-live-dot');
    if (dot && currentRpm > 0) {
      dot.setAttribute('cx', cX); dot.setAttribute('cy', cY);
      dot.setAttribute('opacity', '1');
    }

    // Barra de carga izquierda (verde, altura proporcional al load%)
    var loadPct = currentMaxTorque > 0 && currentTorque > 0
      ? Math.min(100, (currentTorque / currentMaxTorque) * 100) : 0;
    var barH = (loadPct / 100) * H;
    var lb = el('dyno-load-bar');
    if (lb) {
      lb.setAttribute('y', (H - barH).toFixed(1));
      lb.setAttribute('height', barH.toFixed(1));
    }

    // --- Zona de potencia MoreRealistic ---
    var hasMrBand = mrBandMin > 0 && mrBandMax > mrBandMin;
    var pbRect = el('dyno-power-band');
    var ecoLine = el('dyno-eco-line');
    var peakLine = el('dyno-peak-line');
    var mrLegend = el('dyno-mr-legend');

    if (hasMrBand && pbRect) {
      var bX1 = rpmToX(mrBandMin);
      var bX2 = rpmToX(mrBandMax);
      pbRect.setAttribute('x', bX1.toFixed(1));
      pbRect.setAttribute('width', Math.max(0, bX2 - bX1).toFixed(1));
      pbRect.setAttribute('opacity', '0.9');
    } else if (pbRect) {
      pbRect.setAttribute('width', '0');
    }
    if (ecoLine && mrEcoRpm > 0) {
      var eX = rpmToX(mrEcoRpm).toFixed(1);
      ecoLine.setAttribute('x1', eX); ecoLine.setAttribute('x2', eX);
      ecoLine.setAttribute('opacity', '1');
    } else if (ecoLine) { ecoLine.setAttribute('opacity', '0'); }
    if (peakLine && mrPeakRpm > 0) {
      var pX = rpmToX(mrPeakRpm).toFixed(1);
      peakLine.setAttribute('x1', pX); peakLine.setAttribute('x2', pX);
      peakLine.setAttribute('opacity', '1');
    } else if (peakLine) { peakLine.setAttribute('opacity', '0'); }
    if (mrLegend) mrLegend.style.display = hasMrBand ? '' : 'none';

    // Etiquetas de RPM en eje inferior
    var minL = el('dyno-rpm-min-label');
    if (minL) minL.textContent = Math.round(_minRpm) + ' rpm';
    var maxL = el('dyno-rpm-max-label');
    if (maxL) maxL.textContent = Math.round(_maxRpm) + ' rpm';

    // Meta inferior
    var tv = el('dyno-torque-val'); if (tv) tv.textContent = Math.round(currentTorque    || 0);
    var mv = el('dyno-max-val');    if (mv) mv.textContent = Math.round(currentMaxTorque || 0);
    var rv = el('dyno-rpm-val');    if (rv) rv.textContent = Math.round(currentRpm       || 0);
    var lv = el('dyno-load-val');
    if (lv) {
      lv.textContent = Math.round(loadPct) + '%';
      lv.className = loadPct >= 80 ? 'cs-lime' : loadPct >= 50 ? 'cs-amber' : 'cs-yellow';
    }
  };

  return DynoChart;
})();


/**
 * Dashboard Module
 * Main coordinator for telemetry-driven UI updates
 */

class Dashboard {
  constructor() {
    this.telemetryData = {};
    this.tractorWeight = 6.8;
    this.implementWeight = 1.2;
    this.historyManager = new DashboardHistoryManager();
    this.dynoChart = new DynoChart();

    this.initializeModules();
  }

  initializeModules() {
    if (typeof window.setupDashboardClock === 'function') {
      window.setupDashboardClock('clock-display');
    }

    if (typeof window.setupTerrainAngleUpdater === 'function') {
      window.setupTerrainAngleUpdater(this);
    }
  }

  updateTelemetry(data) {
    try {
      Object.assign(this.telemetryData, data);
      this.historyManager.recordHistoryPoint(data);

      this.updateConnectionBadge(data);
      this.updateCenterGauge(data);
      this.updateLeftColumn(data);
      this.updateHealthAndFuel(data);
      this.updateStatusStrip(data);
      this.updateRightColumn(data);
      this.updateEfficiencyZones(data);
      this.updateGearAdvice(data);
      this.updateIATab(data);
      this.historyManager.renderHistoryCharts();
    } catch (error) {
      console.error('Error en updateTelemetry:', error);
    }
  }

  updateConnectionBadge(data) {
    var statusEl = document.getElementById('connection-status');
    var dotEl = document.querySelector('.status-dot');

    if (data.isRealData) {
      if (statusEl) statusEl.innerHTML = '🟢 FS25 CONECTADO';
      if (dotEl) dotEl.classList.add('connected');
    } else {
      if (statusEl) statusEl.innerHTML = '🔴 Esperando FS25...';
      if (dotEl) dotEl.classList.remove('connected');
    }
  }

  updateCenterGauge(data) {
    if (data.engineSpeed === undefined) {
      return;
    }
    // GaugeAnimator.animate() actualiza rpm-display en cada frame;
    // aquí solo se fija el target para la interpolación suave.
    if (window.gaugeAnimator) {
      window.gaugeAnimator.setRPM(data.engineSpeed);
    }
  }

  updateLeftColumn(data) {
    var torqueEl = document.getElementById('engine-torque');
    if (torqueEl && data.motorTorque !== undefined) {
      torqueEl.textContent = Math.round(data.motorTorque);
    }

    var loadEl = document.getElementById('engine-load');
    if (loadEl && data.motorLoad !== undefined) {
      var loadVal = +((+data.motorLoad).toFixed(1));
      loadEl.textContent = loadVal;
      // Histéresis: entrar en sobrecarga a >105%, salir a <95% — evita parpadeo en el límite
      var isOverload = loadEl.classList.contains('overload');
      var overloadThreshold = isOverload ? 95 : 105;
      if (loadVal > overloadThreshold) {
        loadEl.classList.remove('lime');
        loadEl.classList.add('overload');
      } else {
        loadEl.classList.remove('overload');
        loadEl.classList.add('lime');
      }
    }

    var fuelUsageEl = document.getElementById('fuel-usage');
    if (fuelUsageEl && data.fuelUsagePerHour !== undefined) {
      fuelUsageEl.textContent = data.fuelUsagePerHour.toFixed(1);
    }

    var rpmEffEl = document.getElementById('engine-power');
    if (rpmEffEl) {
      var power = data.powerKW || (data.motorTorque && data.engineSpeed ? (data.motorTorque * data.engineSpeed) / 9549 : 0);
      rpmEffEl.textContent = Math.round(power);
    }

    var powerCvEl = document.getElementById('engine-power-cv');
    if (powerCvEl) {
      var powerCV = data.powerHP || (data.powerKW ? data.powerKW * 1.35962 : 0);
      powerCvEl.textContent = Math.round(powerCV);
    }

    // Dinamómetro — acumular curvas + renderizar
    var vehicleName = data.vehicleName || '';
    var rpm         = data.engineSpeed || 0;
    var torque      = data.motorTorque || 0;
    var maxTorque   = data.maxTorqueNm || 0;  // 0 = sin datos; render() muestra carga 0% en lugar de 100%
    var power       = data.powerKW || (torque && rpm ? (torque * rpm) / 9549 : 0);
    var mrBandMin   = data.mrPowerBandMinRpm || 0;
    var mrBandMax   = data.mrPowerBandMaxRpm || 0;
    var mrPeakRpm   = data.mrPeakPowerRpm   || 0;
    var mrEcoRpm    = data.mrMinEcoRpm      || 0;

    if (vehicleName && rpm > 0) {
      this.dynoChart.record(vehicleName, rpm, maxTorque, torque);
    }
    this.dynoChart.render(vehicleName, rpm, torque, maxTorque, mrBandMin, mrBandMax, mrPeakRpm, mrEcoRpm);
  }

  updateHealthAndFuel(data) {
    // Desgaste de uso (vehicleWearAmount 0.0-1.0): incrementa con el uso normal del vehículo
    var wearPercent = Math.round((data.vehicleWearAmount || 0) * 100);
    var healthPercentage = Math.max(0, 100 - wearPercent);
    // Daño físico por accidente (vehicleDamageAmount): casi siempre 0 en juego normal
    var tractorDamage = Math.max(0, Math.min(100, data.tractorDamage || 0));

    var healthFillEl = document.getElementById('health-fill');
    if (healthFillEl) {
      healthFillEl.style.width = healthPercentage + '%';
      if (healthPercentage > 80) {
        healthFillEl.style.background = 'linear-gradient(90deg, var(--lime-d), var(--lime))';
        healthFillEl.style.boxShadow  = '0 0 6px var(--lime-glow)';
      } else if (healthPercentage > 40) {
        healthFillEl.style.background = 'linear-gradient(90deg, #cc7700, var(--amber))';
        healthFillEl.style.boxShadow  = '0 0 6px var(--amber-glow)';
      } else {
        healthFillEl.style.background = 'linear-gradient(90deg, #cc0033, var(--red))';
        healthFillEl.style.boxShadow  = '0 0 6px var(--red-glow)';
      }
    }

    var healthStatusEl = document.getElementById('health-status');
    if (healthStatusEl) {
      healthStatusEl.textContent = healthPercentage >= 75 ? 'Nuevo' : healthPercentage >= 50 ? 'Bueno' : healthPercentage >= 25 ? 'Regular' : 'Desgastado';
      healthStatusEl.style.color = healthPercentage >= 75 ? 'var(--lime)' : healthPercentage >= 25 ? 'var(--amber)' : 'var(--red)';
    }

    var healthPercentEl = document.getElementById('health-percent');
    if (healthPercentEl) {
      healthPercentEl.textContent = healthPercentage + '%';
      healthPercentEl.style.color = healthPercentage > 80 ? 'var(--lime)' : healthPercentage > 40 ? 'var(--amber)' : 'var(--red)';
    }

    var brokenBadge = document.getElementById('broken-badge');
    if (brokenBadge) {
      // Mostrar badge si el flag llega desde Lua O si el daño es 100%
      var isBroken = data.isVehicleBroken || (tractorDamage >= 100);
      brokenBadge.style.display = isBroken ? '' : 'none';
    }

    var damagePercentEl = document.getElementById('damage-percent');
    if (damagePercentEl) {
      damagePercentEl.textContent = Math.round(tractorDamage) + '%';
      damagePercentEl.style.color = tractorDamage > 10 ? 'var(--red)' : '';
    }

    var autonomyEl = document.getElementById('fuel-autonomy');
    if (autonomyEl) {
      var liters = data.fuelLiters || 0;
      var lph    = data.fuelUsagePerHour || 0;
      if (lph > 0.1 && liters > 0) {
        var hours = liters / lph;
        autonomyEl.textContent = hours >= 10 ? Math.round(hours) : hours.toFixed(1);
        autonomyEl.className = 'metric-value ' + (hours > 1 ? 'teal' : 'overload');
      } else {
        autonomyEl.textContent = '—';
        autonomyEl.className = 'metric-value teal';
      }
    }

    if (data.fuelPercentage !== undefined) {
      var fuelPercent = Math.round(data.fuelPercentage);
      var fuelFillEl = document.getElementById('fuel-fill');
      if (fuelFillEl) {
        fuelFillEl.style.width = fuelPercent + '%';
      }

      var fuelLevelEl = document.getElementById('fuel-level');
      if (fuelLevelEl) {
        fuelLevelEl.textContent = fuelPercent;
        fuelLevelEl.className = 'metric-value ' + (fuelPercent > 20 ? 'lime' : 'overload');
      }

      var fuelLitersEl2 = document.getElementById('fuel-liters');
      if (fuelLitersEl2) {
        fuelLitersEl2.className = 'metric-value ' + (fuelPercent > 20 ? 'lime' : 'overload');
      }
    }

    var fuelLitersEl = document.getElementById('fuel-liters');
    if (fuelLitersEl && data.fuelLiters !== undefined) {
      fuelLitersEl.textContent = Math.round(data.fuelLiters);
    }

    var fuelCapacityEl = document.getElementById('fuel-capacity');
    if (fuelCapacityEl && data.fuelCapacity !== undefined) {
      fuelCapacityEl.textContent = Math.round(data.fuelCapacity);
    }
  }

  updateStatusStrip(data) {
    var loadVal = +((+(data.accelerator || 0)).toFixed(1));

    var statusLoadEl = document.getElementById('status-load');
    if (statusLoadEl) {
      statusLoadEl.firstChild.textContent = loadVal;
    }

    var statusGearEl = document.getElementById('status-gear');
    if (statusGearEl) {
      statusGearEl.textContent = data.currentGear || 'N';
    }

    var statusTempEl = document.getElementById('status-temp');
    if (statusTempEl) {
      statusTempEl.firstChild.textContent = Math.round(data.motorTemperature || 20);
    }

    var stripLoadEl = document.getElementById('strip-load');
    if (stripLoadEl) {
      stripLoadEl.textContent = loadVal + '%';
    }

    var stripFuelEl = document.getElementById('strip-fuel');
    if (stripFuelEl) {
      stripFuelEl.textContent = Math.round(data.fuelPercentage || 100) + '%';
    }

    var stripRpmEl = document.getElementById('strip-rpm');
    if (stripRpmEl) {
      stripRpmEl.textContent = Math.round(data.engineSpeed || 0);
    }
  }

  updateRightColumn(data) {
    if (data.speed !== undefined) {
      // Velocidad con 1 decimal — getLastSpeed() en FS25 devuelve km/h
      var speedAbs  = Math.abs(data.speed || 0);
      var speedDisp = speedAbs.toFixed(1);          // "12.4"
      var speedRound = Math.round(speedAbs) + ' km/h'; // para gauge/strip

      // Reloj de velocidad animado
      if (window.speedGaugeAnimator) {
        window.speedGaugeAnimator.setSpeed(speedAbs);
      }

      var telemSpeedEl = document.getElementById('telem-speed');
      if (telemSpeedEl) {
        telemSpeedEl.textContent = speedDisp;
      }

      var stripSpeedEl = document.getElementById('strip-speed');
      if (stripSpeedEl) {
        stripSpeedEl.textContent = speedDisp + ' km/h';
      }
    }

    // Marcha: CVT → "CVT"; manual/auto → grupo+marcha (ej: "A3") o solo marcha
    var trans        = data.transmissionType || 'manual';
    var gearDisplay;
    if (trans === 'cvt') {
      gearDisplay = 'CVT';
    } else {
      var grp = data.gearGroupName || '';
      var g   = data.currentGear  || 'N';
      // Evitar duplicar si el gearName ya incluye el grupo (ej: "A1")
      if (grp && String(g).indexOf(grp) !== 0) {
        gearDisplay = grp + g;
      } else {
        gearDisplay = g || 'N';
      }
    }

    var telemGearEl = document.getElementById('telem-gear');
    if (telemGearEl) {
      telemGearEl.textContent = gearDisplay;
    }

    var stripGearEl = document.getElementById('strip-gear');
    if (stripGearEl) {
      stripGearEl.textContent = gearDisplay;
    }

    if (data.motorTemperature !== undefined) {
      var tempCelsius = Math.round(data.motorTemperature);
      var telemTempEl = document.getElementById('telem-temp');
      if (telemTempEl) {
        telemTempEl.textContent = tempCelsius;
      }
    }

    // Peso: usar datos reales del juego (totalMassT, vehicleMassT) si están disponibles
    var totalWeightT = (data.totalMassT && data.totalMassT > 0)
      ? data.totalMassT
      : (this.tractorWeight + (data.implementsAttached ? this.implementWeight : 0));
    var telemWeightEl = document.getElementById('telem-weight');
    if (telemWeightEl) {
      telemWeightEl.textContent = totalWeightT.toFixed(1);
    }

    var slipPercent = Math.round((data.mrAvgDrivenWheelsSlip || 0) * 100);

    // Horizonte artificial — pitch y roll
    var pitchDeg = data.pitch || 0;
    var rollDeg  = data.roll  || 0;

    var rollPtrEl = document.getElementById('terrain-roll-ptr');
    if (rollPtrEl) {
      rollPtrEl.setAttribute('transform', 'rotate(' + rollDeg + ', 140, 112)');
    }

    var horizRotEl   = document.getElementById('terrain-horiz-rot');
    var horizPitchEl = document.getElementById('terrain-horiz-pitch');
    if (horizRotEl)   horizRotEl.setAttribute('transform', 'rotate(' + rollDeg + ')');
    if (horizPitchEl) {
      // pitch > 0 = morro arriba (cuesta arriba) → horizonte baja → translate Y positivo
      var pitchPx = Math.max(-65, Math.min(65, pitchDeg * 3));
      horizPitchEl.setAttribute('transform', 'translate(0, ' + pitchPx.toFixed(1) + ')');
    }

    var anglePitchEl = document.getElementById('angle-pitch');
    if (anglePitchEl) {
      var pAbs = Math.abs(pitchDeg);
      anglePitchEl.textContent = (pitchDeg >= 0 ? '+' : '') + pitchDeg.toFixed(1) + '\u00b0';
      anglePitchEl.setAttribute('fill', pAbs > 15 ? '#ff5555' : pAbs > 8 ? '#f0a000' : '#3dd6e0');
    }
    var angleRollEl = document.getElementById('angle-roll');
    if (angleRollEl) {
      var rAbs = Math.abs(rollDeg);
      angleRollEl.textContent = (rollDeg >= 0 ? '+' : '') + rollDeg.toFixed(1) + '\u00b0';
      angleRollEl.setAttribute('fill', rAbs > 15 ? '#ff5555' : rAbs > 8 ? '#f0a000' : '#3dd6e0');
    }

    // Wheel Traction card
    this.updateWheelTraction(data);
  }

  updateWheelTraction(data) {
    var positions = ['FL', 'FR', 'RL', 'RR'];

    // Drive type badge
    var dtBadge = document.getElementById('drive-type-badge');
    if (dtBadge) {
      var dt = (data.driveType || '4WD').toUpperCase();
      dtBadge.textContent = dt;
      dtBadge.className = 'drive-type-badge';
      if (dt === 'FWD') dtBadge.classList.add('fwd');
      else if (dt === 'RWD') dtBadge.classList.add('rwd');
      else if (dt === '2WD') dtBadge.classList.add('two');
    }

    var wt = data.wheelTraction || [];
    for (var i = 0; i < positions.length; i++) {
      var pos = positions[i];
      var info = wt[i] || { position: pos, motorized: false, torquePercent: 0 };
      var pct  = Math.max(0, Math.min(100, info.torquePercent || 0));
      var motorized = info.motorized !== false;

      var cellEl = document.getElementById('wheel-cell-' + pos);
      var barEl  = document.getElementById('wheel-bar-' + pos);
      var torqEl = document.getElementById('wheel-torq-' + pos);

      if (cellEl) {
        cellEl.classList.toggle('inactive',    !motorized);
        cellEl.classList.toggle('high-torque', motorized && pct > 70);
      }
      if (barEl) {
        barEl.style.width = pct.toFixed(1) + '%';
        barEl.className = 'wheel-torque-bar';
        if      (pct > 80) barEl.classList.add('high');
        else if (pct > 50) barEl.classList.add('med');
        // Track: limpiar cualquier clase rr-* anterior
        var trackEl = barEl.parentNode;
        if (trackEl) trackEl.className = 'wt-bar-track';
      }
      // Limpiar clases rr-* del approach anterior (border en cellEl)
      if (cellEl) cellEl.classList.remove('rr-soft', 'rr-field', 'rr-soggy');
      if (torqEl) torqEl.textContent = Math.round(pct);

      // Slip longitudinal: prefer MR longSlip when available (more precise)
      var slipRaw  = (info.longSlip != null) ? info.longSlip : (info.slip || 0);
      var slipPct  = Math.round(slipRaw * 100);
      var slipFill = document.getElementById('wheel-slip-' + pos);
      var slipVal  = document.getElementById('wheel-slipval-' + pos);
      if (slipFill) {
        slipFill.style.width = Math.min(100, slipPct) + '%';
        slipFill.className = 'wheel-slip-fill';
        if (slipPct > 40)      slipFill.classList.add('slip-high');
        else if (slipPct > 15) slipFill.classList.add('slip-med');
      }
      if (slipVal) slipVal.textContent = slipPct + '%';

      // Slip lateral (MR only) — barra secundaria
      var latRowEl   = document.getElementById('wheel-latrow-'  + pos);
      var latFillEl  = document.getElementById('wheel-latslip-' + pos);
      var latValEl   = document.getElementById('wheel-latval-'  + pos);
      if (latRowEl) {
        if (info.latSlip != null) {
          var latPct = Math.round(info.latSlip * 100);
          latRowEl.classList.remove('wt-hidden');
          if (latFillEl) {
            latFillEl.style.width = Math.min(100, latPct) + '%';
            latFillEl.className = 'wheel-slip-fill wheel-latslip-fill';
            if (latPct > 25)      latFillEl.classList.add('slip-high');
            else if (latPct > 10) latFillEl.classList.add('slip-med');
          }
          if (latValEl) latValEl.textContent = latPct + '%';
        } else {
          latRowEl.classList.add('wt-hidden');
        }
      }

      // Ground type badge (MR only)
      var groundEl = document.getElementById('wheel-ground-' + pos);
      if (groundEl) {
        if (info.groundType != null) {
          groundEl.textContent = info.groundType;
          groundEl.className = 'wheel-ground-badge ground-' + info.groundType.toLowerCase();
        } else {
          groundEl.classList.add('wt-hidden');
        }
      }

      // Ground contact dot
      var contactEl = document.getElementById('wheel-contact-' + pos);
      if (contactEl) {
        contactEl.classList.toggle('on-ground', info.contact === true);
      }

      // Tire load KN (MR only)
      var loadValEl  = document.getElementById('wheel-load-'     + pos);
      var loadUnitEl = document.getElementById('wheel-loadunit-' + pos);
      if (loadValEl && loadUnitEl) {
        if (info.tireLoadKN != null) {
          loadValEl.classList.remove('wt-hidden');
          loadUnitEl.classList.remove('wt-hidden');
          loadValEl.textContent = info.tireLoadKN.toFixed(1);
        } else {
          loadValEl.classList.add('wt-hidden');
          loadUnitEl.classList.add('wt-hidden');
        }
      }
    }
  }

  updateGearAdvice(data) {
    var el = document.getElementById('gear-advice');
    if (!el) return;

    var trans     = data.transmissionType || 'manual';
    var rpm       = data.engineSpeed || data.rpm || 0;
    var load      = data.motorLoad   || data.engineLoad || 0;
    var speed     = Math.abs(data.speed || 0);
    var mrBandMin = data.mrPowerBandMinRpm || 0;
    var mrEcoRpm  = data.mrMinEcoRpm      || 0;
    var mrPeakRpm = data.mrPeakPowerRpm   || 0;

    // Considerar datos reales si el motor está arrancado y las RPM son plausibles
    var hasData = data.isMotorStarted && rpm >= 100;
    if (!hasData) {
      el.textContent = rpm < 100 ? 'MOTOR PARADO' : 'SIN DATOS';
      el.className = 'gear-advice-badge neutral';
      return;
    }

    var text, cls;

    if (trans === 'cvt') {
      // CVT gestiona sus propias relaciones — el consejo es sobre carga y velocidad de avance
      if (load > 92) {
        text = '⬇ REDUCE PROFUNDIDAD';
        cls  = 'warn';
      } else if (load > 75 && mrEcoRpm > 0 && rpm < mrEcoRpm) {
        text = '⬇ REDUCE VELOCIDAD';
        cls  = 'warn';
      } else if (load < 45 && speed > 1.5) {
        text = '⬆ AUMENTA VELOCIDAD';
        cls  = 'info';
      } else {
        text = '✅ CVT ÓPTIMO';
        cls  = 'ok';
      }
    } else {
      // Manual / Stepmatic — consejo de cambio según RPM vs banda óptima
      var ecoRef  = mrEcoRpm  > 0 ? mrEcoRpm  : (data.minRpm  ? data.minRpm  * 1.4 : 1400);
      var peakRef = mrPeakRpm > 0 ? mrPeakRpm : (data.maxRpm  ? data.maxRpm  * 0.75 : 1900);

      if (load > 90 || (mrBandMin > 0 && rpm < mrBandMin)) {
        text = '⬇ BAJA MARCHA';
        cls  = 'warn';
      } else if (load < 55 && rpm > peakRef) {
        text = '⬆ SUBE MARCHA';
        cls  = 'info';
      } else if (rpm >= ecoRef && rpm <= peakRef) {
        text = '✅ MARCHA ÓPTIMA';
        cls  = 'ok';
      } else {
        text = '◉ MONITOREA RPM';
        cls  = 'neutral';
      }
    }

    el.textContent  = text;
    el.className    = 'gear-advice-badge ' + cls;

    // Si hay análisis previo con recomendación de acelerador, añadirla como sufijo
    var an = window._lastAnalysis;
    if (an && an.recommended_accelerator != null && hasData) {
      var recA  = +((+an.recommended_accelerator).toFixed(1));
      var curA  = +((+(data.accelerator || 0)).toFixed(1));
      var diff  = curA - recA;
      var hint  = '';
      if      (diff >  10) hint = ' · ↓ Acel. ' + recA + '%';
      else if (diff < -10) hint = ' · ↑ Acel. ' + recA + '%';
      else                 hint = ' · Acel. ✓';
      el.textContent = text + hint;
    }
  }

  updateEfficiencyZones(data) {
    if (!window.gaugeAnimator) return;

    var ecoRpm, optRpm;

    // Si MR está activo y tiene los datos calculados por el mod, usarlos directamente
    if (data.mrMinEcoRpm > 0 && data.mrPeakPowerRpm > 0) {
      ecoRpm = Math.round(data.mrMinEcoRpm);
      optRpm = Math.round(data.mrPeakPowerRpm);
    } else if (data.mrPowerBandMinRpm > 0) {
      // Fallback parcial: banda de potencia disponible pero no eco
      ecoRpm = Math.round(data.mrPowerBandMinRpm);
      optRpm = data.mrPowerBandMaxRpm > 0
        ? Math.round((data.mrPowerBandMinRpm + data.mrPowerBandMaxRpm) / 2)
        : Math.round(data.mrPowerBandMinRpm * 1.15);
    } else {
      // Sin MR: usar minRpm y maxRpm del motor como referencia de rango
      var minR = data.minRpm || 800;
      var maxR = data.maxRpm || 2200;
      // ECO = 60% del rango (zona torque máximo en motores diesel estándar)
      ecoRpm  = Math.round(minR + (maxR - minR) * 0.40);
      // OPT  = 75% del rango (zona de potencia máxima)
      optRpm  = Math.round(minR + (maxR - minR) * 0.70);
    }

    window.gaugeAnimator.updateZoneLines(ecoRpm, optRpm);
  }

  // ── Pestaña Campo · IA ────────────────────────────────────────
  updateIATab(data) {
    // Sólo actualiza si la pestaña IA está visible (evita trabajo inútil)
    if (window._activeTab !== 'campo') return;

    // Vehículo
    var vehEl = document.getElementById('ia-vehicle-name');
    if (vehEl) vehEl.textContent = data.vehicleName || '—';

    // Transmisión
    var transEl = document.getElementById('ia-transmission');
    if (transEl) transEl.textContent = (data.transmissionType || '—').toUpperCase();

    // Masa total
    var massEl = document.getElementById('ia-mass');
    if (massEl) {
      var mt = data.totalMassT || 0;
      massEl.textContent = mt > 0 ? mt.toFixed(1) + ' t' : '— t';
    }

    // Resumen de trabajo activo (cabecera destacada del card implemento)
    var wSumEl   = document.getElementById('ia-work-summary');
    var wSumVal  = document.getElementById('ia-work-summary-value');
    var hasImpl  = (data.implementsAttached || 0) > 0;
    var workTypeMap = {
      'HARVESTER':   'Cosechadora',
      'SOWER':       'Sembradora',
      'SPRAYER':     'Pulverizadora',
      'FERTILIZER':  'Abonadora',
      'PLOW':        'Arado',
      'CULTIVATOR':  'Cultivador',
      'MOWER':       'Segadora',
      'BALER':       'Empacadora',
      'TRANSPORT':   'Transporte',
      'FIELDWORK':   'Trabajo de Campo',
      'UNKNOWN':     'Implemento'
    };
    var rawType = (data.workType || 'UNKNOWN');
    var workTypeLabel = workTypeMap[rawType] || rawType;
    var implDisplayName = (data.implementName || '').trim();
    if (wSumEl)  wSumEl.className  = 'ia-work-summary' + (hasImpl ? '' : ' inactive');
    if (wSumVal) wSumVal.textContent = hasImpl
      ? (implDisplayName || workTypeLabel)
      : 'SIN IMPLEMENTO';

    // Implemento: nombre
    var implNameEl = document.getElementById('ia-impl-name');
    if (implNameEl) {
      var n = (data.implementName || '').trim();
      implNameEl.textContent = n || 'Sin implemento';
    }

    // Implemento: cantidad enganchados
    var cntEl = document.getElementById('ia-impl-count');
    if (cntEl) cntEl.textContent = data.implementsAttached || 0;

    // Implemento: tipo de trabajo
    var wtEl = document.getElementById('ia-work-type');
    if (wtEl) wtEl.textContent = workTypeLabel;

    var cropEl = document.getElementById('ia-crop-type');
    if (cropEl) cropEl.textContent = data.cropType || '—';

    // Implemento: estado lowered
    var lowEl = document.getElementById('ia-impl-lowered');
    if (lowEl) {
      var lw = data.implementLowered;
      lowEl.textContent = lw ? 'BAJADA' : 'SUBIDA';
      lowEl.className = 'ia-badge' + (lw ? ' active' : ' inactive');
    }

    // Implemento: trabajando
    var wrkEl = document.getElementById('ia-impl-working');
    if (wrkEl) {
      var wk = data.implementWorking || (data.implementLowered && Math.abs(data.speed || 0) > 0.3);
      wrkEl.textContent = wk ? 'SÍ' : 'NO';
      wrkEl.className = 'ia-badge' + (wk ? ' active' : '');
    }

    // Estado grabación: activo cuando implement lowered + working
    var recEl = document.getElementById('ia-rec-status');
    if (recEl) {
      // Graba cuando implement bajado + vehículo en movimiento (igual que el logger del backend)
      var recording = data.implementLowered && Math.abs(data.speed || 0) > 0.3;
      if (recording) {
        recEl.textContent  = 'GRABANDO';
        recEl.className    = 'ia-badge active';
      } else {
        recEl.textContent  = 'EN ESPERA';
        recEl.className    = 'ia-badge ia-badge-wait';
      }
    }

    // Telemetría rápida
    var speedEl = document.getElementById('ia-speed');
    if (speedEl) speedEl.textContent = Math.abs(data.speed || 0).toFixed(1);

    var loadEl = document.getElementById('ia-load');
    if (loadEl) loadEl.textContent = +((data.motorLoad || 0).toFixed(1));

    var rpmEl = document.getElementById('ia-rpm');
    if (rpmEl) rpmEl.textContent = Math.round(data.engineSpeed || 0);

    var fuelEl = document.getElementById('ia-fuel');
    if (fuelEl) fuelEl.textContent = (data.fuelUsagePerHour || 0).toFixed(1);

    var slipEl = document.getElementById('ia-slip');
    if (slipEl) slipEl.textContent = Math.round((data.mrAvgDrivenWheelsSlip || 0) * 100);

    var gearEl = document.getElementById('ia-gear');
    if (gearEl) {
      var trans2  = data.transmissionType || 'manual';
      var grp2    = data.gearGroupName || '';
      var g2      = data.currentGear  || 'N';
      if (trans2 === 'cvt') {
        gearEl.textContent = 'CVT';
      } else if (grp2 && String(g2).indexOf(grp2) !== 0) {
        gearEl.textContent = grp2 + g2;
      } else {
        gearEl.textContent = g2 || 'N';
      }
    }

    // Contador de muestras grabadas en esta sesión
    var recording2 = data.implementLowered && Math.abs(data.speed || 0) > 0.3;
    if (recording2) {
      window._iaSampleCount = (window._iaSampleCount || 0) + 1;
    }
    var scEl = document.getElementById('ia-sample-count');
    if (scEl) {
      var sc = window._iaSampleCount || 0;
      var minEst = sc >= 60 ? ' (~' + (sc / 60).toFixed(1) + ' min)' : '';
      scEl.textContent = sc + ' muestras' + minEst;
    }

    // Activar/desactivar botón análisis según si hay suficientes muestras
    var btnEl = document.getElementById('ia-analyze-btn');
    if (btnEl) {
      var enough = (window._iaSampleCount || 0) >= 100;
      btnEl.disabled    = !enough;
      btnEl.title       = enough ? 'Analizar los datos de esta sesión' : 'Necesitas al menos 100 muestras (≈1min 40s trabajando)';
    }
  }

}

// ── Análisis de sesión: llama al backend y renderiza resultados ─────────────
window._iaSampleCount  = 0;
window._activoCampo    = -1;   // sincronizado con la selección del usuario

// ── Listar archivos del campo seleccionado ────────────────────────────────
window.loadCampoSessions = function(campo) {
  var campoVal = (campo != null) ? campo : window._activoCampo;
  var panel    = document.getElementById('ia-sessions-panel');
  var listEl   = document.getElementById('ia-sessions-list');
  var titleEl  = document.getElementById('ia-sessions-title');

  if (!panel || !listEl) return;

  if (campoVal == null || campoVal < 0) {
    panel.classList.add('ia-hidden');
    return;
  }

  if (titleEl) titleEl.textContent = 'Archivos — Campo ' + campoVal;
  panel.classList.remove('ia-hidden');
  listEl.innerHTML = '<span class="ia-sessions-empty ia-sessions-loading">Cargando…</span>';

  fetch('/api/analyze/sessions?campo=' + encodeURIComponent(campoVal))
    .then(function(r) { return r.json(); })
    .then(function(d) {
      var files = d.files || [];
      if (files.length === 0) {
        listEl.innerHTML = '<span class="ia-sessions-empty">No hay archivos grabados en este campo.</span>';
        return;
      }
      listEl.innerHTML = '';
      files.forEach(function(f) {
        var kb     = (f.size / 1024).toFixed(1);
        var lines  = Math.round(f.size / 120);  // estimación ~120 bytes/línea
        var dt     = new Date(f.mtime);
        var dateStr = dt.toLocaleDateString('es', {day:'2-digit', month:'2-digit'}) +
                      ' ' + dt.toLocaleTimeString('es', {hour:'2-digit', minute:'2-digit'});

        var row = document.createElement('div');
        row.className = 'ia-session-row';
        row.innerHTML =
          '<span class="ia-session-name" title="' + f.relPath + '">' + f.name + '</span>' +
          '<span class="ia-session-meta">' + dateStr + ' · ~' + lines + ' muestras · ' + kb + ' KB</span>' +
          '<div class="ia-session-actions">' +
            '<button class="ia-session-btn ia-session-analyze" title="Analizar este archivo"' +
              ' onclick="window.runAnalysis(\'' + encodeURIComponent(f.relPath) + '\')">▶ Analizar</button>' +
            '<button class="ia-session-btn ia-session-delete" title="Eliminar"' +
              ' onclick="window.deleteSession(\'' + encodeURIComponent(f.dir) + '\',\'' + encodeURIComponent(f.name) + '\', this)">✕</button>' +
          '</div>';
        listEl.appendChild(row);
      });
    })
    .catch(function(err) {
      listEl.innerHTML = '<span class="ia-sessions-empty">Error al cargar archivos.</span>';
      console.error('loadCampoSessions:', err);
    });
};

// ── Eliminar sesión ────────────────────────────────────────────────────────
window.deleteSession = function(dirEnc, fileEnc, btnEl) {
  var dir  = decodeURIComponent(dirEnc);
  var file = decodeURIComponent(fileEnc);
  if (!confirm('¿Eliminar "' + file + '"? No se puede deshacer.')) return;

  if (btnEl) btnEl.disabled = true;

  fetch('/api/session/file', {
    method:  'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ dir: dir, file: file })
  })
    .then(function(r) { return r.json(); })
    .then(function(d) {
      if (d.error) { alert('Error: ' + d.error); if (btnEl) btnEl.disabled = false; return; }
      // Recargar la lista del campo activo
      window.loadCampoSessions();
    })
    .catch(function(err) {
      alert('Error de red: ' + err.message);
      if (btnEl) btnEl.disabled = false;
    });
};

window.runAnalysis = function(relPathEnc) {
  var btn = document.getElementById('ia-analyze-btn');
  var panel = document.getElementById('ia-analysis-panel');
  if (btn)   { btn.disabled = true; btn.textContent = 'Analizando…'; }
  if (panel) { panel.classList.add('ia-hidden'); }

  var url = '/api/analyze';
  if (relPathEnc) {
    url += '?file=' + relPathEnc;
  }

  fetch(url)
    .then(function(r) {
      if (!r.ok) return r.json().then(function(e) { throw new Error(e.error || r.status); });
      return r.json();
    })
    .then(function(d) {
      if (d.error) throw new Error(d.error);
      renderAnalysis(d);
      if (panel) panel.classList.remove('ia-hidden');
    })
    .catch(function(err) {
      alert('No se pudo analizar: ' + err.message);
    })
    .finally(function() {
      if (btn) {
        btn.disabled    = false;
        btn.textContent = 'Analizar sesión';
      }
    });
};

function _renderProfileStrip(profile) {
  var strip = document.getElementById('ia-profile-strip');
  if (!strip) return;
  if (!profile) { strip.classList.add('ia-hidden'); return; }

  var wtMap = {
    'HARVESTING':'COSECHA','HARVESTER':'COSECHA','SOWER':'SIEMBRA','SPRAYER':'PULV.',
    'FERTILIZER':'ABONO','PLOW':'ARADO','CULTIVATOR':'CULTIVO',
    'MOWER':'SIEGA','BALER':'EMPACADO','TRANSPORT':'TRANSPORTE',
    'FIELDWORK':'TRABAJO','UNKNOWN':'—'
  };
  var wt  = wtMap[profile.workType] || profile.workType;
  var set = function(id, val) { var el = document.getElementById(id); if (el) el.textContent = val; };

  set('ia-profile-label',   'CAMPO ' + profile.campo + ' — ' + wt);
  set('ia-profile-sessions', profile.sessions + ' ses.');
  set('ia-profile-samples',  (profile.total_samples || 0).toLocaleString() + ' muestras');
  set('ia-profile-accel',    profile.recommended_accelerator != null
      ? +((+profile.recommended_accelerator).toFixed(1)) : '—');
  strip.classList.remove('ia-hidden');
}
// Exponer para section-loader.js
window._renderProfileStrip = _renderProfileStrip;

function renderAnalysis(d) {
  // Guardar para que gear-advice lo use en tiempo real
  window._lastAnalysis = d;

  // Actualizar perfil histórico acumulado
  _renderProfileStrip(d.profile || null);

  var workTypeMap = {
    'HARVESTER':'Cosechadora','SOWER':'Sembradora','SPRAYER':'Pulverizadora',
    'FERTILIZER':'Abonadora','PLOW':'Arado','CULTIVATOR':'Cultivador',
    'MOWER':'Segadora','BALER':'Empacadora','TRANSPORT':'Transporte',
    'FIELDWORK':'Trabajo de campo','UNKNOWN':'Desconocido'
  };
  var wt = workTypeMap[d.work_type] || d.work_type;
  var campoLabel = d.campo != null
    ? 'Campo ' + d.campo + (d.campos && d.campos.length > 1 ? ' (+' + (d.campos.length - 1) + ' más)' : '')
    : 'Sin campo';

  var set = function(id, val) { var el = document.getElementById(id); if (el) el.textContent = val; };

  set('ia-an-title',      wt + ' — ' + (d.vehicle || '—') + ' · ' + campoLabel);
  set('ia-an-sub',        d.samples + ' muestras · ' + d.duration_min + ' min · ' + d.sessionFile);
  set('ia-an-speed',      d.avg_speed_kmh);
  set('ia-an-load',       d.avg_motor_load);
  set('ia-an-rpm',        d.avg_rpm);
  set('ia-an-fuel',       d.avg_fuel_lh);
  set('ia-an-fuel-total', d.total_fuel_l);
  set('ia-an-slip',       d.avg_slip_pct);
  set('ia-an-slip-peak',  d.peak_slip_pct);
  set('ia-an-load-peak',  d.peak_load_pct);
  set('ia-an-file',       'Archivo: ' + d.sessionFile);

  // ── Recomendación de acelerador ──────────────────────────────────────────
  var recAccel = d.recommended_accelerator;
  var avgAccel = d.avg_accelerator;
  set('ia-an-rec-accel', recAccel != null ? +((+recAccel).toFixed(1)) : '—');
  set('ia-an-avg-accel', avgAccel != null ? +((+avgAccel).toFixed(1)) : '—');

  // Nota contextual según carga media
  var note = '';
  var avgLoad = d.avg_motor_load || 0;
  if (recAccel != null) {
    if (avgLoad > 88) {
      note = '⚠ Carga muy alta — reduce velocidad de avance';
    } else if (avgLoad > 75) {
      note = '✅ Zona óptima — mantén este acelerador';
    } else if (avgLoad < 55) {
      note = '↑ Carga baja — puedes aumentar velocidad';
    } else {
      note = 'Referencia calculada sobre zona de carga 70-85 %';
    }
  } else {
    note = 'Sin suficientes datos en zona óptima (70-85 % carga)';
  }
  set('ia-an-rec-note', note);

  // Barras de distribución de carga
  var ld = d.load_dist || {};
  [['0-30','ia-lb-0-30','ia-lbp-0-30'],
   ['30-60','ia-lb-30-60','ia-lbp-30-60'],
   ['60-80','ia-lb-60-80','ia-lbp-60-80'],
   ['80-100','ia-lb-80-100','ia-lbp-80-100']].forEach(function(row) {
    var pct = ld[row[0]] || 0;
    var fill = document.getElementById(row[1]);
    var label = document.getElementById(row[2]);
    if (fill)  fill.style.width = pct + '%';
    if (label) label.textContent = pct + '%';
  });

  // Distribución velocidad
  var sd = d.speed_dist || {};
  set('ia-sd-stopped', (sd.parado_pct    || 0) + '%');
  set('ia-sd-slow',    (sd.lento_pct     || 0) + '%');
  set('ia-sd-work',    (sd.trabajo_pct   || 0) + '%');
  set('ia-sd-fast',    (sd.transporte_pct|| 0) + '%');
}

if (typeof window !== 'undefined') {
  window.Dashboard = Dashboard;
}

function initDashboard() {
  if (window.dashboard) {
    return window.dashboard;
  }

  window.dashboard = new Dashboard();

  if (!window.telemetryClient || typeof window.telemetryClient.onTelemetry !== 'function') {
    console.warn('TelemetryClient no disponible');
  }

  return window.dashboard;
}

window.initDashboard = initDashboard;

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initDashboard);
} else if (window.dashboardSectionsReady) {
  initDashboard();
}
