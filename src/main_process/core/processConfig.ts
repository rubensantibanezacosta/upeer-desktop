import { app } from 'electron';
import { error } from '../security/secure-logger.js';

/**
 * Configuración de manejo de errores y eventos de proceso
 */
export function setupProcessHandlers(): void {
  // Silenciar EPIPE en stdout/stderr — ocurre cuando el proceso se arranca piped
  // (ej: `npm start | head -N`) y el receptor cierra antes de que termine el log.
  // Sin este handler Node.js lo trata como excepción no capturada y Electron
  // muestra un diálogo de error.
  process.stdout.on('error', (err: NodeJS.ErrnoException) => { if (err.code !== 'EPIPE') throw err; });
  process.stderr.on('error', (err: NodeJS.ErrnoException) => { if (err.code !== 'EPIPE') throw err; });

  // Capturar promesas rechazadas sin .catch() — evita que el proceso muera
  // en silencio o muestre diálogos de crash en Electron.
  process.on('unhandledRejection', (reason: unknown) => {
    error('[Main] Promesa rechazada sin capturar', { reason: String(reason) }, 'unhandled-rejection');
  });

  // Capturar excepciones síncronas no capturadas — último recurso antes del crash.
  process.on('uncaughtException', (err: Error) => {
    error('[Main] Excepción no capturada', { message: err.message, stack: err.stack }, 'uncaught-exception');
  });

  // Fix for Wayland file explorer issues
  if (process.env.XDG_SESSION_TYPE === 'wayland') {
    app.commandLine.appendSwitch('enable-features', 'UseOzonePlatform');
    app.commandLine.appendSwitch('ozone-platform', 'wayland');
  }
}