import { app } from 'electron';
import { stopYggstack } from '../sidecars/yggstack.js';
import { stopPeerManager } from '../sidecars/peer-manager.js';
import { closeDB } from '../storage/db.js';
import { closeUDPServer } from '../network/server/index.js';
import { stopLanDiscovery } from '../network/lan/discovery.js';

/**
 * Configura los manejadores de eventos de ciclo de vida de la aplicación
 */
export function setupAppLifecycleHandlers(): void {
  // Detener el sidecar antes de que la app empiece a cerrar ventanas.
  // Se usa 'before-quit' (y no solo 'window-all-closed') para garantizar
  // que el proceso hijo se detenga incluso en macOS, donde el app puede
  // quedar vivo sin ventanas abiertas.
  app.on('before-quit', () => {
    stopYggstack();
  });

  app.on('window-all-closed', () => {
    stopPeerManager();
    closeDB();
    closeUDPServer();
    stopLanDiscovery();
    if (process.platform !== 'darwin') app.quit();
  });
}