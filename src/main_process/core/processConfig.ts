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
  // (ej: `pnpm start | head -N`) y el receptor cierra antes de que termine el log.
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

  // Ozone se elige en la línea de comandos (scripts/start.mjs): appendSwitch llega
  // demasiado tarde, la plataforma ya está decidida cuando corre este módulo, y el
  // resultado es SIGSEGV antes de crear la ventana o una ventana sin frames.
}
