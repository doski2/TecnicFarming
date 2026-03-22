/**
 * Terrain angle helper for dashboard
 */
function setupTerrainAngleUpdater(dashboard) {
  return setInterval(function () {
    if (!dashboard || !dashboard.telemetryData) {
      return;
    }

    var pitch = (dashboard.telemetryData.pitch || 0) * 57.2958;
    var roll = (dashboard.telemetryData.roll || 0) * 57.2958;

    var pitchEl = document.getElementById('angle-pitch');
    var rollEl = document.getElementById('angle-roll');
    if (pitchEl) pitchEl.textContent = pitch.toFixed(1) + '°';
    if (rollEl) rollEl.textContent = roll.toFixed(1) + '°';

    var tractorGroup = document.getElementById('tractor-rear-group');
    if (tractorGroup) {
      var translateY = Math.max(-12, Math.min(12, -pitch * 0.35));
      var rotateAngle = Math.max(-16, Math.min(16, roll));
      tractorGroup.setAttribute('transform', 'translate(0 ' + translateY.toFixed(1) + ') rotate(' + rotateAngle.toFixed(1) + ' 150 100)');
    }

    var pitchBar = document.getElementById('angle-pitch-bar');
    var rollBar = document.getElementById('angle-roll-bar');
    if (pitchBar || rollBar) {
      var pitchPercent = Math.max(0, Math.min(100, 50 + pitch * 5));
      var rollPercent = Math.max(0, Math.min(100, 50 + roll * 5));
      if (pitchBar) pitchBar.style.width = pitchPercent + '%';
      if (rollBar) rollBar.style.width = rollPercent + '%';
    }
  }, 100);
}

if (typeof window !== 'undefined') {
  window.setupTerrainAngleUpdater = setupTerrainAngleUpdater;
}
