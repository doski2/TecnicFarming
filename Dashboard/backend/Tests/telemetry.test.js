import { test, describe } from 'node:test';
import assert from 'node:assert';
import TelemetryService from '../src/services/telemetry.js';

// Mock del logger para los tests
const mockLogger = {
  info: () => {},
  error: () => {},
  warn: () => {}
};

describe('TelemetryService', () => {
  
  test('debe inicializarse con valores por defecto', () => {
    const service = new TelemetryService(mockLogger);
    assert.strictEqual(service.isConnected, false);
    assert.strictEqual(service.currentData.rpm, 0);
    assert.strictEqual(service.currentData.driveType, '4WD');
  });

  test('parseData debe mapear correctamente campos básicos', () => {
    const service = new TelemetryService(mockLogger);
    const mockJson = {
      rpm: 1500,
      fuelUsage: 25.5,
      speed: 30,
      vehicleName: "Fendt 724"
    };
    
    service.parseData(mockJson);
    
    assert.strictEqual(service.currentData.rpm, 1500);
    assert.strictEqual(service.currentData.consumption, 25.5);
    assert.strictEqual(service.currentData.speed, 30);
    assert.strictEqual(service.currentData.vehicleName, "Fendt 724");
  });

  test('parseData debe manejar campos específicos de MoreRealistic', () => {
    const service = new TelemetryService(mockLogger);
    const mockJson = {
      mrPowerBandMinRpm: 1200,
      mrPowerBandMaxRpm: 1800,
      mrPeakPowerRpm: 1700,
      motorLoad: 85.5
    };
    
    service.parseData(mockJson);
    
    assert.strictEqual(service.currentData.mrPowerBandMinRpm, 1200);
    assert.strictEqual(service.currentData.mrPowerBandMaxRpm, 1800);
    assert.strictEqual(service.currentData.mrPeakPowerRpm, 1700);
    assert.strictEqual(service.currentData.engineLoad, 85.5);
  });

  test('EMA para totalMassT debe suavizar cambios', () => {
    const service = new TelemetryService(mockLogger);
    
    // Primera muestra: inicializa sin filtrar
    service.parseData({ totalMassT: 10 });
    assert.strictEqual(service.currentData.totalMassT, 10);
    
    // Segunda muestra: debe aplicar EMA (alfa = 0.04)
    // Formula: prev + 0.04 * (new - prev) = 10 + 0.04 * (20 - 10) = 10.4
    service.parseData({ totalMassT: 20 });
    assert.strictEqual(service.currentData.totalMassT, 10.4);
    
    // Tercera muestra: 10.4 + 0.04 * (20 - 10.4) = 10.4 + 0.384 = 10.784 -> toFixed(2) = 10.78
    service.parseData({ totalMassT: 20 });
    assert.strictEqual(service.currentData.totalMassT, 10.78);
  });

  test('handleData debe procesar chunks divididos por saltos de línea', () => {
    const service = new TelemetryService(mockLogger);
    let parsedCount = 0;
    
    // Sobrescribimos parseData para contar llamadas
    service.parseData = () => { parsedCount++; };
    
    // Enviamos dos objetos en un chunk
    service.handleData('{"rpm":1000}\n{"rpm":1100}\n');
    assert.strictEqual(parsedCount, 2);
    assert.strictEqual(service.buffer, '');
  });

  test('handleData debe manejar JSON parcial en el buffer', () => {
    const service = new TelemetryService(mockLogger);
    let parsedCount = 0;
    service.parseData = () => { parsedCount++; };
    
    // Enviamos medio objeto
    service.handleData('{"rpm":1000');
    assert.strictEqual(parsedCount, 0);
    assert.strictEqual(service.buffer, '{"rpm":1000');
    
    // Completamos el objeto
    service.handleData('}\n');
    assert.strictEqual(parsedCount, 1);
    assert.strictEqual(service.buffer, '');
  });
  
  test('mapeo de tracción de ruedas debe ser robusto', () => {
    const service = new TelemetryService(mockLogger);
    const mockJson = {
      driveType: 'AWD',
      wheelTraction: {
        "1": { position: "FL", motorized: true, torquePercent: 25 },
        "2": { position: "FR", motorized: true, torquePercent: 25 },
        "3": { position: "RL", motorized: true, torquePercent: 25 },
        "4": { position: "RR", motorized: true, torquePercent: 25 }
      }
    };
    
    service.parseData(mockJson);
    
    assert.strictEqual(service.currentData.driveType, 'AWD');
    assert.strictEqual(service.currentData.wheelTraction.length, 4);
    assert.strictEqual(service.currentData.wheelTraction[0].position, "FL");
    assert.strictEqual(service.currentData.wheelTraction[0].torquePercent, 25);
  });

});
