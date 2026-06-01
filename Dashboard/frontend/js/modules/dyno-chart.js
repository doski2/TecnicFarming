/**
 * DynoChart v4 — curvas de par motor con uPlot (Canvas)
 *
 * uPlot renderiza en <canvas> directo → ~10× más rápido que SVG + setAttribute.
 * API pública igual: record(vehicleName, rpm, maxTorqueNm, appliedNm) + render(...).
 *
 * Ámbar = par MÁXIMO acumulado por bucket RPM
 * Teal  = par APLICADO (EMA) por bucket RPM
 * Overlay (hooks.draw): barra carga, zona MR, líneas eco/pico, punto vivo
 */
var DynoChart = (function() {
  var STORAGE_KEY = 'dyno_curves_v4';
  var BUCKET = 25;
  var EMA_A  = 0.35;

  function DynoChart() {
    this.curves        = this._load();
    this._saveTimer    = null;
    this._lastRenderMs = 0;
    this._uplot        = null;
    // Estado de overlay — leído dentro de hooks.draw en cada redibujado
    this._liveRpm    = 0;
    this._liveTorque = 0;
    this._liveLoad   = 0;
    this._mrBandMin  = 0;
    this._mrBandMax  = 0;
    this._mrEcoRpm   = 0;
    this._mrPeakRpm  = 0;
  }

  DynoChart.prototype._load = function() {
    try {
      // Migrar datos de v3 si aún no se ha creado v4
      var prev = localStorage.getItem('dyno_curves_v3');
      var curr = localStorage.getItem(STORAGE_KEY);
      if (!curr && prev) { localStorage.setItem(STORAGE_KEY, prev); return JSON.parse(prev) || {}; }
      return JSON.parse(curr) || {};
    } catch(e) { return {}; }
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
    // maxTorqueNm del juego = constante de placa → línea plana, no se usa aquí.
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

  /** Construye arrays uPlot: [ [rpms], [maxSeries], [appliedSeries] ] */
  DynoChart.prototype._buildUdata = function(vehicleName) {
    var empty = [[], [null], [null]];
    if (!vehicleName || !this.curves[vehicleName]) return empty;
    this._ensureVehicle(vehicleName);
    var c = this.curves[vehicleName];
    var seen = {};
    Object.keys(c.max).forEach(function(k) { seen[k] = true; });
    Object.keys(c.applied).forEach(function(k) { seen[k] = true; });
    var rpms = Object.keys(seen).map(Number).sort(function(a, b) { return a - b; });
    if (!rpms.length) return empty;
    var maxSeries = rpms.map(function(r) { return c.max[r] !== undefined     ? c.max[r]     : null; });
    var appSeries = rpms.map(function(r) { return c.applied[r] !== undefined ? c.applied[r] : null; });
    return [rpms, maxSeries, appSeries];
  };

  /** Overlays dibujados en canvas tras cada render de uPlot */
  DynoChart.prototype._drawOverlay = function(u) {
    var ctx = u.ctx;
    var b   = u.bbox;   // {left, top, width, height} en px de canvas (DPR incluido)
    var dpr = window.devicePixelRatio || 1;
    ctx.save();

    // — Zona de potencia MR —
    if (this._mrBandMin > 0 && this._mrBandMax > this._mrBandMin) {
      var bx1 = u.valToPos(this._mrBandMin, 'x', true);
      var bx2 = u.valToPos(this._mrBandMax, 'x', true);
      if (bx2 > bx1) {
        var gMR = ctx.createLinearGradient(0, b.top, 0, b.top + b.height);
        gMR.addColorStop(0,   'rgba(168,255,62,0.18)');
        gMR.addColorStop(1,   'rgba(168,255,62,0.06)');
        ctx.fillStyle = gMR;
        ctx.fillRect(bx1, b.top, bx2 - bx1, b.height);
      }
    }

    // — Línea RPM eco (dashed, lima) —
    if (this._mrEcoRpm > 0) {
      var ex = u.valToPos(this._mrEcoRpm, 'x', true);
      ctx.strokeStyle = 'rgba(168,255,62,0.45)';
      ctx.lineWidth = dpr;
      ctx.setLineDash([3 * dpr, 3 * dpr]);
      ctx.beginPath(); ctx.moveTo(ex, b.top); ctx.lineTo(ex, b.top + b.height); ctx.stroke();
    }

    // — Línea RPM pico (dashed, ámbar) —
    if (this._mrPeakRpm > 0) {
      var px = u.valToPos(this._mrPeakRpm, 'x', true);
      ctx.strokeStyle = 'rgba(255,170,0,0.55)';
      ctx.lineWidth = dpr;
      ctx.setLineDash([3 * dpr, 3 * dpr]);
      ctx.beginPath(); ctx.moveTo(px, b.top); ctx.lineTo(px, b.top + b.height); ctx.stroke();
    }
    ctx.setLineDash([]);

    // — Línea vertical RPM actual —
    if (this._liveRpm > 0) {
      var rx = u.valToPos(this._liveRpm, 'x', true);
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 1.5 * dpr;
      ctx.setLineDash([2 * dpr, 3 * dpr]);
      ctx.beginPath(); ctx.moveTo(rx, b.top + 2); ctx.lineTo(rx, b.top + b.height - 2); ctx.stroke();
      ctx.setLineDash([]);

      // — Punto vivo en (RPM actual, torque actual) —
      if (this._liveTorque > 0) {
        var ry = u.valToPos(this._liveTorque, 'y', true);
        var grd = ctx.createRadialGradient(rx, ry, 0, rx, ry, 8 * dpr);
        grd.addColorStop(0,   'rgba(255,170,0,0.55)');
        grd.addColorStop(1,   'rgba(255,170,0,0)');
        ctx.fillStyle = grd;
        ctx.beginPath(); ctx.arc(rx, ry, 8 * dpr, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(255,170,0,1)';
        ctx.beginPath(); ctx.arc(rx, ry, 4.5 * dpr, 0, Math.PI * 2); ctx.fill();
      }
    }

    // — Barra de carga (columna delgada en padding izquierdo, verde→ámbar) —
    if (this._liveLoad > 0) {
      var barH = (this._liveLoad / 100) * b.height;
      var gLoad = ctx.createLinearGradient(0, b.top + b.height, 0, b.top);
      gLoad.addColorStop(0,    'rgba(168,255,62,0.90)');
      gLoad.addColorStop(0.55, 'rgba(168,255,62,0.55)');
      gLoad.addColorStop(1,    'rgba(255,170,0,0.75)');
      ctx.fillStyle = gLoad;
      ctx.fillRect(b.left - 10 * dpr, b.top + b.height - barH, 6 * dpr, barH);
    }

    ctx.restore();
  };

  /** Crea la instancia uPlot sobre el contenedor dado */
  DynoChart.prototype._initUplot = function(container) {
    var self = this;
    var w    = container.offsetWidth  || 280;
    var h    = container.offsetHeight || 160;
    var opts = {
      width:  w,
      height: h,
      cursor: { show: false },
      legend: { show: false },
      select: { show: false },
      scales: {
        x: { time: false, range: [600, 3000] },
        y: { range: [0, 1000] },
      },
      axes: [{ show: false }, { show: false }],
      series: [
        {},
        { // Par máximo — ámbar
          stroke: 'rgba(255,170,0,0.90)',
          fill: function(u) {
            var bb = u.bbox;
            var g  = u.ctx.createLinearGradient(0, bb.top, 0, bb.top + bb.height);
            g.addColorStop(0,   'rgba(255,170,0,0.28)');
            g.addColorStop(1,   'rgba(255,170,0,0.02)');
            return g;
          },
          width: 2.5,
          spanGaps: true,
        },
        { // Par aplicado — teal
          stroke: 'rgba(0,229,204,0.90)',
          fill: function(u) {
            var bb = u.bbox;
            var g  = u.ctx.createLinearGradient(0, bb.top, 0, bb.top + bb.height);
            g.addColorStop(0,   'rgba(0,229,204,0.18)');
            g.addColorStop(1,   'rgba(0,229,204,0.01)');
            return g;
          },
          width: 2,
          spanGaps: true,
        },
      ],
      padding: [4, 4, 4, 16],
      hooks: {
        draw: [function(u) { self._drawOverlay(u); }],
      },
    };
    this._uplot = new uPlot(opts, [[], [null], [null]], container);
  };

  DynoChart.prototype.render = function(vehicleName, currentRpm, currentTorque, currentMaxTorque, mrBandMin, mrBandMax, mrPeakRpm, mrEcoRpm) {
    // Throttle a 60fps (17ms): canvas uPlot es suficientemente ligero para ello
    var now = Date.now();
    if (now - this._lastRenderMs < 17) return;
    this._lastRenderMs = now;

    // Inicialización perezosa — el DOM ya está listo en el primer frame de telemetría
    if (!this._uplot) {
      var wrap = document.getElementById('dyno-canvas-wrap');
      if (!wrap) return;
      this._initUplot(wrap);
    }

    // Actualizar estado de overlay (leído dentro de hooks.draw)
    this._liveRpm    = currentRpm    || 0;
    this._liveTorque = currentTorque || 0;
    this._mrBandMin  = mrBandMin     || 0;
    this._mrBandMax  = mrBandMax     || 0;
    this._mrEcoRpm   = mrEcoRpm      || 0;
    this._mrPeakRpm  = mrPeakRpm     || 0;
    var loadPct = currentMaxTorque > 0 && currentTorque > 0
      ? Math.min(100, (currentTorque / currentMaxTorque) * 100) : 0;
    this._liveLoad = loadPct;

    // Escalas dinámicas
    var minRpm = 600, maxRpm = 3000, maxTorque = 1000;
    if (vehicleName && this.curves[vehicleName]) {
      this._ensureVehicle(vehicleName);
      var c = this.curves[vehicleName];
      var allKeys = Object.keys(c.max).concat(Object.keys(c.applied)).map(Number);
      if (allKeys.length) {
        var minKey = Math.min.apply(null, allKeys);
        var maxKey = Math.max.apply(null, allKeys);
        var pad = Math.max((maxKey - minKey) * 0.05, 50);
        minRpm = Math.max(0, Math.floor((minKey - pad) / 100) * 100);
        maxRpm =             Math.ceil( (maxKey + pad) / 100) * 100;
        var allTorques = [];
        Object.keys(c.max).forEach(function(k) { allTorques.push(c.max[k]); });
        Object.keys(c.applied).forEach(function(k) { allTorques.push(c.applied[k]); });
        maxTorque = Math.max(Math.ceil(Math.max.apply(null, allTorques) * 1.15 / 100) * 100, 100);
      }
    }

    // Actualizar datos + escalas en un batch → un solo redibujado (invoca hooks.draw)
    var udata = this._buildUdata(vehicleName);
    var self  = this;
    this._uplot.batch(function(u) {
      u.setData(udata, false);
      u.setScale('x', { min: minRpm, max: maxRpm });
      u.setScale('y', { min: 0,      max: maxTorque });
    });

    // Badge vehículo
    var badge = document.getElementById('dyno-vehicle-name');
    if (badge) badge.textContent = vehicleName || '—';

    // Etiquetas RPM
    var minL = document.getElementById('dyno-rpm-min-label');
    if (minL) minL.textContent = Math.round(minRpm) + ' rpm';
    var maxL = document.getElementById('dyno-rpm-max-label');
    if (maxL) maxL.textContent = Math.round(maxRpm) + ' rpm';

    // Leyenda MR
    var hasMrBand = mrBandMin > 0 && mrBandMax > mrBandMin;
    var mrLegend = document.getElementById('dyno-mr-legend');
    if (mrLegend) mrLegend.style.display = hasMrBand ? '' : 'none';

    // Meta stats
    var tv = document.getElementById('dyno-torque-val'); if (tv) tv.textContent = Math.round(currentTorque    || 0);
    var mv = document.getElementById('dyno-max-val');    if (mv) mv.textContent = Math.round(currentMaxTorque || 0);
    var rv = document.getElementById('dyno-rpm-val');    if (rv) rv.textContent = Math.round(currentRpm       || 0);
    var lv = document.getElementById('dyno-load-val');
    if (lv) {
      lv.textContent = Math.round(loadPct) + '%';
      lv.className = loadPct >= 80 ? 'cs-lime' : loadPct >= 50 ? 'cs-amber' : 'cs-yellow';
    }
  };

  return DynoChart;
})();
