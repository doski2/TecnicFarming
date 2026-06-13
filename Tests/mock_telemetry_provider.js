/**
 * Simulador de Telemetría SHTelemetry
 * Crea un Named Pipe y envía datos falsos para probar el Dashboard sin abrir FS25.
 */
import net from 'net';

const PIPE_NAME = '\\\\.\\pipe\\SHTelemetry';

console.log('=== SIMULADOR DE TELEMETRÍA FS25 ===');
console.log(`Creando Named Pipe: ${PIPE_NAME}`);

let rpm = 800;
let speed = 0;
let fuel = 100;
let direction = 1;

const server = net.createServer((socket) => {
  console.log('✓ Cliente conectado al simulador (el backend se ha conectado)');
  
  const interval = setInterval(() => {
    // Simular variación de datos
    rpm += (Math.random() - 0.5) * 100 + (10 * direction);
    if (rpm > 2200) direction = -1;
    if (rpm < 800) direction = 1;
    
    speed = (rpm - 800) / 1400 * 50;
    fuel -= 0.001;

    const telemetry = {
      rpm: Math.round(rpm),
      speed: speed,
      fuelPercentage: fuel,
      fuelLevel: fuel * 2,
      fuelCapacity: 200,
      vehicleName: "Fendt 724 (Simulado)",
      motorLoad: (rpm / 2200) * 100,
      accelerator: 50,
      gearName: "12",
      motorTemperature: 90,
      isMotorStarted: true,
      timestamp: Date.now(),
      // Datos MR simulados
      mrPowerBandMinRpm: 1200,
      mrPowerBandMaxRpm: 1800,
      mrPeakPowerRpm: 1700,
      mrMinEcoRpm: 1400
    };

    try {
      socket.write(JSON.stringify(telemetry) + '\n');
    } catch (err) {
      console.error('Error enviando datos:', err.message);
      clearInterval(interval);
    }
  }, 100); // 10 Hz

  socket.on('end', () => {
    console.log('✗ Cliente desconectado');
    clearInterval(interval);
  });

  socket.on('error', (err) => {
    console.error('Error en socket:', err.message);
    clearInterval(interval);
  });
});

server.listen(PIPE_NAME, () => {
  console.log('🚀 Simulador escuchando. Abre el backend para empezar a recibir datos.');
});

process.on('SIGINT', () => {
  server.close();
  process.exit();
});
