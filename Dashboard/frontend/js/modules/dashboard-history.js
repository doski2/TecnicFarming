/**
 * Dashboard history and chart rendering helper
 */
class DashboardHistoryManager {
  constructor() {
    this.historyLimit = 90;
    this.historyPoints = [];
  }

  recordHistoryPoint(data) {
    var speedKmh = Math.round((data.speed || 0) * 3.6);
    var fuelUsage = data.fuelUsagePerHour !== undefined ? data.fuelUsagePerHour : 0;
    var fuelLevel = data.fuelPercentage !== undefined ? data.fuelPercentage : 100;
    var estimatedPowerKw = data.motorTorque && data.engineSpeed
      ? (data.motorTorque * data.engineSpeed) / 9549
      : 0;

    this.historyPoints.push({
      timestamp: data.timestamp || Date.now(),
      rpm: Math.max(0, data.engineSpeed || 0),
      torque: Math.max(0, data.motorTorque || 0),
      speedKmh: Math.max(0, speedKmh),
      fuelUsage: Math.max(0, fuelUsage),
      fuelLevel: Math.max(0, Math.min(100, fuelLevel)),
      estimatedPowerKw: Math.max(0, estimatedPowerKw)
    });

    while (this.historyPoints.length > this.historyLimit) {
      this.historyPoints.shift();
    }
  }

  renderHistoryCharts() {
    var points = this.historyPoints;
    if (!points.length) {
      return;
    }

    this.renderSvgChart('performance-history-chart', 'performance-chart-grid', [
      { id: 'performance-rpm-path', key: 'rpm', max: 6000, strokeClass: 'chart-line-rpm' },
      { id: 'performance-torque-path', key: 'torque', max: 1000, strokeClass: 'chart-line-torque' },
      { id: 'performance-speed-path', key: 'speedKmh', max: 60, strokeClass: 'chart-line-speed' }
    ], points, 140);

    this.renderSvgChart('fuel-history-chart', 'fuel-chart-grid', [
      { id: 'fuel-level-path', key: 'fuelLevel', max: 100, strokeClass: 'chart-line-fuel' },
      { id: 'fuel-usage-path', key: 'fuelUsage', max: 30, strokeClass: 'chart-line-usage' }
    ], points, 120);

    this.renderDynoChart(points);

    var lastPoint = points[points.length - 1];

    var trendRpmEl = document.getElementById('trend-rpm');
    if (trendRpmEl) trendRpmEl.textContent = Math.round(lastPoint.rpm);

    var trendTorqueEl = document.getElementById('trend-torque');
    if (trendTorqueEl) trendTorqueEl.textContent = Math.round(lastPoint.torque);

    var trendSpeedEl = document.getElementById('trend-speed');
    if (trendSpeedEl) trendSpeedEl.textContent = Math.round(lastPoint.speedKmh);

    var trendFuelEl = document.getElementById('trend-fuel');
    if (trendFuelEl) trendFuelEl.textContent = Math.round(lastPoint.fuelLevel) + '%';

    var trendConsumptionEl = document.getElementById('trend-consumption');
    if (trendConsumptionEl) trendConsumptionEl.textContent = lastPoint.fuelUsage.toFixed(1);

    var dynoCurrentEl = document.getElementById('dyno-current-power');
    if (dynoCurrentEl) dynoCurrentEl.textContent = lastPoint.estimatedPowerKw.toFixed(1);

    var dynoPeakEl = document.getElementById('dyno-peak-power');
    if (dynoPeakEl) {
      var peakPower = 0;
      for (var index = 0; index < points.length; index += 1) {
        if (points[index].estimatedPowerKw > peakPower) {
          peakPower = points[index].estimatedPowerKw;
        }
      }
      dynoPeakEl.textContent = peakPower.toFixed(1);
    }

    var dynoAverageEl = document.getElementById('dyno-average-power');
    if (dynoAverageEl) {
      var totalPower = 0;
      for (var sumIndex = 0; sumIndex < points.length; sumIndex += 1) {
        totalPower += points[sumIndex].estimatedPowerKw;
      }
      dynoAverageEl.textContent = (totalPower / points.length).toFixed(1);
    }
  }

  renderSvgChart(svgId, gridId, seriesList, points, chartHeight) {
    var svg = document.getElementById(svgId);
    var grid = document.getElementById(gridId);

    if (!svg || !grid || !points.length) {
      return;
    }

    var chartWidth = 280;
    var padding = 12;
    var innerWidth = chartWidth - (padding * 2);
    var innerHeight = chartHeight - (padding * 2);
    var stepX = points.length > 1 ? innerWidth / (points.length - 1) : innerWidth;

    var gridMarkup = '';
    for (var row = 0; row <= 4; row += 1) {
      var y = padding + (innerHeight * row / 4);
      gridMarkup += '<line x1="' + padding + '" y1="' + y.toFixed(1) + '" x2="' + (chartWidth - padding) + '" y2="' + y.toFixed(1) + '" />';
    }
    for (var column = 0; column <= 4; column += 1) {
      var x = padding + (innerWidth * column / 4);
      gridMarkup += '<line x1="' + x.toFixed(1) + '" y1="' + padding + '" x2="' + x.toFixed(1) + '" y2="' + (chartHeight - padding) + '" />';
    }
    grid.innerHTML = gridMarkup;

    for (var seriesIndex = 0; seriesIndex < seriesList.length; seriesIndex += 1) {
      var series = seriesList[seriesIndex];
      var pathData = '';

      for (var pointIndex = 0; pointIndex < points.length; pointIndex += 1) {
        var point = points[pointIndex];
        var rawValue = point[series.key] || 0;
        var maxValue = series.max || 1;
        var normalizedValue = Math.max(0, Math.min(1, rawValue / maxValue));
        var x = padding + (pointIndex * stepX);
        var y = padding + innerHeight - (normalizedValue * innerHeight);

        pathData += (pointIndex === 0 ? 'M' : 'L') + x.toFixed(1) + ' ' + y.toFixed(1) + ' ';
      }

      var pathEl = document.getElementById(series.id);
      if (pathEl) {
        pathEl.setAttribute('d', pathData.trim());
      }
    }
  }

  renderDynoChart(points) {
    var svg = document.getElementById('dyno-history-chart');
    var grid = document.getElementById('dyno-chart-grid');
    var powerArea = document.getElementById('dyno-power-area');
    var powerPath = document.getElementById('dyno-power-path');

    if (!svg || !grid || !powerArea || !powerPath || !points.length) {
      return;
    }

    var chartWidth = 280;
    var chartHeight = 150;
    var padding = 14;
    var innerWidth = chartWidth - (padding * 2);
    var innerHeight = chartHeight - (padding * 2);
    var stepX = points.length > 1 ? innerWidth / (points.length - 1) : innerWidth;

    var peakPower = 0;
    for (var index = 0; index < points.length; index += 1) {
      if (points[index].estimatedPowerKw > peakPower) {
        peakPower = points[index].estimatedPowerKw;
      }
    }

    var maxPower = Math.max(120, Math.ceil(peakPower * 1.15));

    var gridMarkup = '';
    for (var row = 0; row <= 4; row += 1) {
      var y = padding + (innerHeight * row / 4);
      gridMarkup += '<line x1="' + padding + '" y1="' + y.toFixed(1) + '" x2="' + (chartWidth - padding) + '" y2="' + y.toFixed(1) + '" />';
    }
    for (var column = 0; column <= 4; column += 1) {
      var x = padding + (innerWidth * column / 4);
      gridMarkup += '<line x1="' + x.toFixed(1) + '" y1="' + padding + '" x2="' + x.toFixed(1) + '" y2="' + (chartHeight - padding) + '" />';
    }
    grid.innerHTML = gridMarkup;

    var lineData = '';
    var areaData = '';

    for (var pointIndex = 0; pointIndex < points.length; pointIndex += 1) {
      var point = points[pointIndex];
      var normalizedValue = Math.max(0, Math.min(1, point.estimatedPowerKw / maxPower));
      var x = padding + (pointIndex * stepX);
      var y = padding + innerHeight - (normalizedValue * innerHeight);

      lineData += (pointIndex === 0 ? 'M' : 'L') + x.toFixed(1) + ' ' + y.toFixed(1) + ' ';
      areaData += (pointIndex === 0 ? 'M' : 'L') + x.toFixed(1) + ' ' + y.toFixed(1) + ' ';
    }

    var lastX = padding + ((points.length - 1) * stepX);
    var baseY = chartHeight - padding;
    areaData += 'L ' + lastX.toFixed(1) + ' ' + baseY.toFixed(1) + ' L ' + padding + ' ' + baseY.toFixed(1) + ' Z';

    powerPath.setAttribute('d', lineData.trim());
    powerArea.setAttribute('d', areaData.trim());
  }
}

if (typeof window !== 'undefined') {
  window.DashboardHistoryManager = DashboardHistoryManager;
}
