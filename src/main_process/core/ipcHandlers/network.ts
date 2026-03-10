import { ipcMain } from 'electron';
import {
  getYggstackAddress,
  getRestartAttempts,
  getMaxRestartAttempts,
  forceRestart
} from '../../sidecars/yggstack.js';
import {
  getActivePeerUris,
  getPeerPool,
  getSelfGeo
} from '../../sidecars/peer-manager.js';

/**
 * Registra los manejadores IPC relacionados con red y yggstack
 */
export function registerNetworkHandlers(): void {
  // Devuelve la dirección IPv6 Yggdrasil asignada por el sidecar yggstack.
  // Con el modo user-space no hay interfaz TUN, por lo que getNetworkAddress()
  // ya no aplica aquí; usamos getYggstackAddress() que lee del stdout del proceso.
  ipcMain.handle('get-ygg-ip', () => getYggstackAddress() || 'No detectado');

  // Devuelve estadísticas de red para la sección Conexión de Settings
  ipcMain.handle('get-network-stats', () => {
    const activePeerUris = new Set(getActivePeerUris());
    const pool = getPeerPool();
    const activePeers = pool
      .filter(p => activePeerUris.has(p.uri))
      .map(p => ({
        host: p.host,
        country: p.country,
        latencyMs: p.latencyMs,
        score: Math.round(p.score),
        alive: p.alive,
        lat: p.lat,
        lon: p.lon,
      }));
    const self = getSelfGeo();
    return {
      peerCount: activePeers.length,
      peers: activePeers,
      restartAttempts: getRestartAttempts(),
      maxRestartAttempts: getMaxRestartAttempts(),
      selfLat: self?.lat ?? null,
      selfLon: self?.lon ?? null,
    };
  });

  // Permite al usuario forzar un reinicio de yggstack desde la UI
  ipcMain.handle('restart-yggstack', async () => { await forceRestart(); });
}