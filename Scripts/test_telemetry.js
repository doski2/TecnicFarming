/**
 * @deprecated Usa la suite unificada en Dashboard/backend:
 *   cd Dashboard/backend && npm test
 */
import { spawnSync } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const backendDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'Dashboard', 'backend');
console.warn('Scripts/test_telemetry.js está deprecado. Ejecutando npm test en backend...\n');
const result = spawnSync('npm', ['test'], { cwd: backendDir, stdio: 'inherit', shell: true });
process.exit(result.status ?? 1);
