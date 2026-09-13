/**
 * Telemetry Client Module
 * Handles WebSocket connection and telemetry data reception
 */

class TelemetryClient {
  constructor() {
    this.socket = null;
    this.connected = false;
    this.dataCallbacks = [];
    this.reconnectInterval = 5000;
    this.lastPayload = null;

    this.init();
  }

  init() {
    try {
      this.socket = io('/telemetry', {
        reconnection: true,
        reconnectionDelay: this.reconnectInterval,
        reconnectionDelayMax: 10000,
        reconnectionAttempts: 10
      });

      this.setupListeners();
    } catch (error) {
      console.error('Failed to initialize telemetry client:', error);
      this.handleConnectionError();
    }
  }

  setupListeners() {
    this.socket.on('connect', () => {
      console.log('Connected to telemetry server');
      this.connected = true;
      this.updateConnectionStatus(true);
    });

    this.socket.on('disconnect', () => {
      console.log('Disconnected from telemetry server');
      this.connected = false;
      this.updateConnectionStatus(false);
      if (window.dashboard && typeof window.dashboard.updateConnectionBadge === 'function') {
        var prev = window.dashboard.telemetryData || {};
        window.dashboard.updateConnectionBadge(Object.assign({}, prev, { isRealData: false }));
      }
    });

    this.socket.on('telemetry', (data) => {
      this.handleTelemetryData(data);
    });

    this.socket.on('error', (error) => {
      console.error('Socket error:', error);
      this.handleConnectionError();
    });

    this.socket.on('connect_error', (error) => {
      console.error('Connection error:', error);
      this.updateConnectionStatus(false);
    });
  }

  /**
   * El backend ya envía payload normalizado (engineSpeed, motorLoad, wheelTraction×4…).
   */
  handleTelemetryData(data) {
    const payload = {
      ...data,
      timestamp: data.timestamp || Date.now(),
      raw: data
    };
    this.lastPayload = payload;

    this.dataCallbacks.forEach((callback) => {
      try {
        callback(payload);
      } catch (error) {
        console.error('Error in telemetry callback:', error);
      }
    });
  }

  onTelemetry(callback) {
    if (typeof callback === 'function') {
      this.dataCallbacks.push(callback);
    }
  }

  handleConnectionError() {
    console.warn('Telemetry connection error - dashboard is waiting for FS25 data');
    this.updateConnectionStatus(false);
  }

  updateConnectionStatus(connected) {
    const statusDot = document.querySelector('.status-dot');
    const statusText = document.getElementById('connection-status');
    const bottomStatus = document.getElementById('bottom-status');

    if (statusDot) {
      statusDot.style.background = connected ? '#a8ff3e' : '#ff4466';
      statusDot.style.animation = connected ? 'blink 1s ease-in-out infinite' : 'none';
    }

    if (statusText) {
      if (!connected) {
        statusText.textContent = 'Sin servidor';
        statusText.style.color = 'var(--red)';
      } else if (!window.dashboard?.telemetryData?.isRealData) {
        statusText.textContent = 'Dashboard en línea';
        statusText.style.color = 'var(--teal)';
      }
    }

    if (bottomStatus) {
      bottomStatus.textContent = connected ? '● Conectado' : '● Esperando';
      bottomStatus.style.color = connected ? 'var(--lime)' : 'var(--red)';
    }
  }

  sendCommand(command, params = {}) {
    if (this.socket && this.connected) {
      this.socket.emit(command, params);
    } else {
      console.warn('Socket not connected, cannot send command:', command);
    }
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.connected = false;
      this.updateConnectionStatus(false);
    }
  }
}

window.telemetryClient = new TelemetryClient();

function forwardTelemetryToDashboard(data) {
  if (window.dashboard && typeof window.dashboard.updateTelemetry === 'function') {
    window.dashboard.updateTelemetry(data);
  }
}

window.telemetryClient.onTelemetry(forwardTelemetryToDashboard);
window.forwardTelemetryToDashboard = forwardTelemetryToDashboard;
