import { spawn } from 'node:child_process';
import path from 'node:path';

const requested = process.env.UPEER_OZONE_PLATFORM ?? 'x11';
const args = ['start', '--', '--no-sandbox'];
if (requested !== 'auto') args.push(`--ozone-platform=${requested}`);

const isWindows = process.platform === 'win32';
const bin = path.join(
  process.cwd(),
  'node_modules',
  '.bin',
  isWindows ? 'electron-forge.cmd' : 'electron-forge',
);

// En Windows el lanzador es un `.cmd`, y desde Node 22 lanzarlo sin `shell: true` falla con
// `spawn EINVAL` (errno -4071): Node ya no ejecuta los `.cmd`/`.bat` directamente por seguridad.
// Con `shell: true` el proceso se lanza a través de `cmd.exe`, que es como se hacía antes.
// En Linux y macOS no hace falta y además empeoraría el manejo de la señal, así que va solo en Windows.
const child = spawn(bin, args, {
  stdio: 'inherit',
  shell: isWindows,
});
child.on('error', (cause) => {
  // Sin esto, un fallo al lanzar (por ejemplo, que no exista `node_modules`) cerraba el proceso sin
  // decir nada: el `exit` no llega cuando el `spawn` falla.
  console.error(`No se pudo lanzar electron-forge: ${cause.message}`);
  process.exit(1);
});
child.on('exit', (code, signal) => {
  if (signal) console.error(`electron-forge terminó con la señal ${signal}`);
  process.exit(code ?? 1);
});
