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
  var EMA_MIN = 0.02;         // suelo de α: la curva sigue adaptándose tras muchas muestras
  var PRIOR_N = 20;           // peso de una curva ya guardada
  var MIN_RPM = 400;
  var MAX_RPM_RATE = 400;     // rpm/s por encima de las cuales la muestra es transitoria
  var MAX_VEHICLES = 30;      // tope de vehículos persistidos (se expulsan los menos recientes)
  var RENDER_MS = 100;        // frecuencia del overlay en vivo (~10 Hz)
  var CURVES_MS = 500;        // frecuencia de recálculo de curvas y escalas (~2 Hz)
  var DEF_RPM_MIN = 600, DEF_RPM_MAX = 3000, DEF_TORQUE_MAX = 1000;
  var DEF_W = 280, DEF_H = 160;

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
    // Filtro de transitorios y recuento por bucket (no persistido)
    this._lastRec    = null;
    this._counts     = {};
    this._vehicle    = '';
    this._dirty      = true;   // curvas cambiadas desde el último recálculo
    this._lastCurveMs = 0;
    this._cache      = {};     // último texto escrito por elemento del DOM
    var self = this;
    // Volcar a localStorage al ocultar/cerrar: el throttle de 8 s no cubre un cierre brusco
    if (typeof document !== 'undefined' && document.addEventListener) {
      document.addEventListener('visibilitychange', function() {
        if (document.visibilityState === 'hidden') self._flush();
      });
    }
    if (typeof window !== 'undefined' && window.addEventListener) {
      window.addEventListener('pagehide', function() { self._flush(); });
    }
  }

  /** Acepta solo { max: {rpm: nm}, applied: {rpm: nm} } con valores numéricos finitos */
  function sanitizeCurves(raw) {
    var out = {};
    if (!raw || typeof raw !== 'object') return out;
    Object.keys(raw).forEach(function(name) {
      var v = raw[name];
      if (!v || typeof v !== 'object') return;
      // Formato antiguo: el vehículo era directamente el mapa rpm → par
      var legacy = !v.max && !v.applied;
      var clean = { max: {}, applied: {}, t: Number(v.t) || 0 };
      [['max', legacy ? v : v.max], ['applied', legacy ? null : v.applied]].forEach(function(p) {
        var src = p[1];
        if (!src || typeof src !== 'object') return;
        Object.keys(src).forEach(function(k) {
          var rpm = Number(k), nm = Number(src[k]);
          if (isFinite(rpm) && isFinite(nm) && rpm > 0 && nm > 0) clean[p[0]][rpm] = nm;
        });
      });
      out[name] = clean;
    });
    return out;
  }

  DynoChart.prototype._load = function() {
    try {
      // Migrar datos de v3 si aún no se ha creado v4
      var prev = localStorage.getItem('dyno_curves_v3');
      var curr = localStorage.getItem(STORAGE_KEY);
      if (!curr && prev) { localStorage.setItem(STORAGE_KEY, prev); curr = prev; }
      return sanitizeCurves(JSON.parse(curr));
    } catch(e) { return {}; }
  };

  /** Deja solo los MAX_VEHICLES más recientes */
  DynoChart.prototype._prune = function() {
    var names = Object.keys(this.curves);
    if (names.length <= MAX_VEHICLES) return;
    var curves = this.curves;
    names.sort(function(a, b) { return (curves[b].t || 0) - (curves[a].t || 0); });
    names.slice(MAX_VEHICLES).forEach(function(n) { delete curves[n]; });
  };

  // Throttle (no debounce): si ya hay un guardado pendiente no se reprograma
  DynoChart.prototype._scheduleSave = function() {
    if (this._saveTimer) return;
    var self = this;
    this._saveTimer = setTimeout(function() { self._flush(); }, 8000);
  };

  DynoChart.prototype._flush = function() {
    if (this._saveTimer) { clearTimeout(this._saveTimer); this._saveTimer = null; }
    this._prune();
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(this.curves)); } catch(e) {}
  };

  /** Borra las curvas de un vehículo (o todas si no se indica nombre) */
  DynoChart.prototype.reset = function(vehicleName) {
    if (vehicleName) delete this.curves[vehicleName];
    else this.curves = {};
    this._counts = {};
    this._lastRec = null;
    this._flush();
    this._dirty = true;
    this._lastRenderMs = 0;
  };

  DynoChart.prototype._ensureVehicle = function(name) {
    if (!this.curves[name]) { this.curves[name] = { max: {}, applied: {} }; return; }
    if (!this.curves[name].max) { var old = this.curves[name]; this.curves[name] = { max: old, applied: {} }; }
  };

  DynoChart.prototype.record = function(vehicleName, rpm, maxTorqueNm, appliedNm) {
    if (!vehicleName || rpm < MIN_RPM) return;

    // Descartar transitorios (aceleraciones/cambios de marcha): rpm variando demasiado rápido
    var now = Date.now();
    var last = this._lastRec;
    this._lastRec = { t: now, rpm: rpm, v: vehicleName };
    if (last && last.v === vehicleName) {
      var dt = (now - last.t) / 1000;
      if (dt > 0 && Math.abs(rpm - last.rpm) / dt > MAX_RPM_RATE) return;
    }

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
      // Media incremental por bucket (α = 1/n, con suelo EMA_MIN); los buckets
      // cargados de localStorage cuentan como PRIOR_N muestras para no sobrescribirlos
      var ck = vehicleName + '|' + b;
      var n  = this._counts[ck] || (c.applied[b] ? PRIOR_N : 0);
      var a  = Math.max(1 / (n + 1), EMA_MIN);
      c.applied[b] = !c.applied[b] ? Math.round(appliedNm)
        : Math.round(c.applied[b] * (1 - a) + appliedNm * a);
      this._counts[ck] = n + 1;
      changed = true;
    }
    if (changed) { c.t = now; this._dirty = true; this._scheduleSave(); }
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
    // Recortar al área de trazado: rpm/banda MR pueden quedar fuera del rango de la escala
    ctx.beginPath(); ctx.rect(b.left, b.top, b.width, b.height); ctx.clip();

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
    // Fuera del área de trazado: se quita el recorte
    ctx.restore();
    ctx.save();
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
    var w    = container.offsetWidth  || DEF_W;
    var h    = container.offsetHeight || DEF_H;
    var opts = {
      width:  w,
      height: h,
      cursor: { show: false },
      legend: { show: false },
      select: { show: false },
      scales: {
        x: { time: false, range: [DEF_RPM_MIN, DEF_RPM_MAX] },
        y: { range: [0, DEF_TORQUE_MAX] },
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

    // Ajustar el canvas cuando cambia el tamaño del contenedor
    if (typeof ResizeObserver !== 'undefined') {
      this._ro = new ResizeObserver(function() {
        var nw = container.offsetWidth, nh = container.offsetHeight;
        if (self._uplot && nw > 0 && nh > 0) self._uplot.setSize({ width: nw, height: nh });
      });
      this._ro.observe(container);
    }

    // Botón de reinicio de la curva del vehículo actual
    var btn = document.getElementById('dyno-reset-btn');
    if (btn) btn.addEventListener('click', function() {
      if (self._vehicle && window.confirm('¿Borrar la curva guardada de ' + self._vehicle + '?')) {
        self.reset(self._vehicle);
      }
    });
  };

  /** Escribe en el DOM solo si el valor cambió desde la última escritura */
  DynoChart.prototype._setText = function(id, text) {
    text = String(text);
    if (this._cache[id] === text) return;
    var el = document.getElementById(id);
    if (!el) return;
    el.textContent = text;
    this._cache[id] = text;
  };

  /** Rangos de ejes a partir de las curvas del vehículo */
  DynoChart.prototype._computeScales = function(vehicleName) {
    var sc = { minRpm: DEF_RPM_MIN, maxRpm: DEF_RPM_MAX, maxTorque: DEF_TORQUE_MAX };
    if (!vehicleName || !this.curves[vehicleName]) return sc;
    this._ensureVehicle(vehicleName);
    var c = this.curves[vehicleName];
    var minKey = Infinity, maxKey = -Infinity, maxNm = 0;
    [c.max, c.applied].forEach(function(series) {
      Object.keys(series).forEach(function(k) {
        var r = +k;
        if (r < minKey) minKey = r;
        if (r > maxKey) maxKey = r;
        if (series[k] > maxNm) maxNm = series[k];
      });
    });
    if (maxKey < minKey) return sc;
    var pad = Math.max((maxKey - minKey) * 0.05, 50);
    sc.minRpm    = Math.max(0, Math.floor((minKey - pad) / 100) * 100);
    sc.maxRpm    = Math.ceil((maxKey + pad) / 100) * 100;
    sc.maxTorque = Math.max(Math.ceil(maxNm * 1.15 / 100) * 100, 100);
    return sc;
  };

  DynoChart.prototype.render = function(vehicleName, currentRpm, currentTorque, currentMaxTorque, mrBandMin, mrBandMax, mrPeakRpm, mrEcoRpm) {
    // Throttle a ~10 Hz para el overlay en vivo
    var now = Date.now();
    if (now - this._lastRenderMs < RENDER_MS) return;
    this._lastRenderMs = now;

    // Inicialización perezosa — el DOM ya está listo en el primer frame de telemetría
    if (!this._uplot) {
      var wrap = document.getElementById('dyno-canvas-wrap');
      if (!wrap) return;
      this._initUplot(wrap);
    }

    var name = vehicleName || '';
    if (name !== this._vehicle) { this._vehicle = name; this._dirty = true; this._lastCurveMs = 0; }

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

    // Curvas y escalas: solo si cambiaron y como mucho a ~2 Hz; si no, solo se repinta el overlay
    if (this._dirty && now - this._lastCurveMs >= CURVES_MS) {
      this._dirty = false;
      this._lastCurveMs = now;
      var sc    = this._computeScales(name);
      var udata = this._buildUdata(name);
      // Un solo redibujado (invoca hooks.draw)
      this._uplot.batch(function(u) {
        u.setData(udata, false);
        u.setScale('x', { min: sc.minRpm, max: sc.maxRpm });
        u.setScale('y', { min: 0,         max: sc.maxTorque });
      });
      this._setText('dyno-rpm-min-label', Math.round(sc.minRpm) + ' rpm');
      this._setText('dyno-rpm-max-label', Math.round(sc.maxRpm) + ' rpm');
    } else {
      this._uplot.redraw(false);
    }

    this._setText('dyno-vehicle-name', name || '—');

    // Leyenda MR
    var mrLegend = document.getElementById('dyno-mr-legend');
    if (mrLegend) mrLegend.style.display = (mrBandMin > 0 && mrBandMax > mrBandMin) ? '' : 'none';

    // Meta stats
    this._setText('dyno-torque-val', Math.round(currentTorque    || 0));
    this._setText('dyno-max-val',    Math.round(currentMaxTorque || 0));
    this._setText('dyno-rpm-val',    Math.round(currentRpm       || 0));
    this._setText('dyno-load-val',   Math.round(loadPct) + '%');
    var lv = document.getElementById('dyno-load-val');
    if (lv) {
      var cls = loadPct >= 80 ? 'cs-lime' : loadPct >= 50 ? 'cs-amber' : 'cs-yellow';
      if (lv.className !== cls) lv.className = cls;
    }
  };

  return DynoChart;
})();
