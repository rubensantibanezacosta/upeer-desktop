import { app } from 'electron';
import { error } from '../security/secure-logger.js';

let fatalShutdownStarted = false;

function terminateAfterFatalError(source: 'unhandled-rejection' | 'uncaught-exception', details: Record<string, string | undefined>): void {
  if (fatalShutdownStarted) return;
  fatalShutdownStarted = true;
  error('[Main] Error fatal en proceso principal, cerrando la aplicación', { source, ...details }, source);
  process.exitCode = 1;
  if (app.isReady()) {
    app.quit();
    setTimeout(() => app.exit(1), 1000).unref();
    return;
  }
  app.exit(1);
}

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
    terminateAfterFatalError('unhandled-rejection', { reason: String(reason) });
  });

  // Capturar excepciones síncronas no capturadas — último recurso antes del crash.
  process.on('uncaughtException', (err: Error) => {
    error('[Main] Excepción no capturada', { message: err.message, stack: err.stack }, 'uncaught-exception');
    terminateAfterFatalError('uncaught-exception', { message: err.message, stack: err.stack });
  });

  // Fix for Wayland file explorer issues
  const isWayland = process.env.XDG_SESSION_TYPE === 'wayland' || !!process.env.WAYLAND_DISPLAY;
  if (isWayland) {
    // Ozone switches for native Wayland support
    app.commandLine.appendSwitch('enable-features', 'UseOzonePlatform');
    app.commandLine.appendSwitch('ozone-platform', 'wayland');
    // Para versiones modernas de Electron, esto ayuda a la autodetección
    app.commandLine.appendSwitch('ozone-platform-hint', 'wayland');
  }
}