import { spawn } from 'node:child_process';
import path from 'node:path';

const requested = process.env.UPEER_OZONE_PLATFORM ?? 'x11';
const args = ['start', '--', '--no-sandbox'];
if (requested !== 'auto') args.push(`--ozone-platform=${requested}`);

const bin = path.join(
  process.cwd(),
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'electron-forge.cmd' : 'electron-forge',
);

const child = spawn(bin, args, { stdio: 'inherit' });
child.on('exit', (code, signal) => {
  if (signal) console.error(`electron-forge terminó con la señal ${signal}`);
  process.exit(code ?? 1);
});
