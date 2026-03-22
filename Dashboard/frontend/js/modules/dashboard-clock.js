/**
 * Dashboard clock helper
 */
function setupDashboardClock(clockId) {
  var clockDisplayId = clockId || 'clock-display';

  function updateClock() {
    var now = new Date();
    var hours = String(now.getHours()).padStart(2, '0');
    var minutes = String(now.getMinutes()).padStart(2, '0');
    var seconds = String(now.getSeconds()).padStart(2, '0');
    var clockDisplay = document.getElementById(clockDisplayId);

    if (clockDisplay) {
      clockDisplay.textContent = hours + ':' + minutes + ':' + seconds;
    }
  }

  updateClock();
  return setInterval(updateClock, 1000);
}

if (typeof window !== 'undefined') {
  window.setupDashboardClock = setupDashboardClock;
}
