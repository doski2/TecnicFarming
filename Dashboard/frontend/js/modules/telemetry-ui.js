/**
 * Helpers UI compartidos — marcha, grabación, patinaje (única fuente para dashboard.js).
 */
(function (global) {
  function formatGearDisplay(data) {
    var trans = data.transmissionType || 'manual';
    if (trans === 'cvt') return 'CVT';
    var grp = data.gearGroupName || '';
    var g = data.currentGear || data.gear || 'N';
    if (grp && String(g).indexOf(grp) !== 0) return grp + g;
    return g || 'N';
  }

  function isRecording(data) {
    // El backend calcula el estado real (datos reales, no mock, dentro del vehículo)
    if (typeof data.isRecording === 'boolean') return data.isRecording;
    return !!(data.implementLowered && Math.abs(data.speed || 0) > 0.3);
  }

  /** Patinaje medio trasero en % (0–100), alineado con _logSample del backend. */
  function slipPercent(data) {
    var wt = data.wheelTraction;
    if (Array.isArray(wt) && wt.length >= 4) {
      var slips = [];
      for (var i = 2; i <= 3; i++) {
        var w = wt[i];
        if (!w) continue;
        var raw = (w.longSlip != null) ? w.longSlip : (w.slip || 0);
        slips.push(Math.abs(raw) * (Math.abs(raw) <= 1 ? 100 : 1));
      }
      if (slips.length) {
        return Math.round(slips.reduce(function (a, b) { return a + b; }, 0) / slips.length);
      }
    }
    return Math.round((data.mrAvgDrivenWheelsSlip || 0) * 100);
  }

  global.TelemetryUI = {
    formatGearDisplay: formatGearDisplay,
    isRecording: isRecording,
    slipPercent: slipPercent
  };
})(window);
