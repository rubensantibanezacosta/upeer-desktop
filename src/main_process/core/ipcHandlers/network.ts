import { ipcMain } from 'electron';
import {
  getYggstackAddress,
  getConnectedPeers,
  getRestartAttempts,
  getMaxRestartAttempts,
  forceRestart
} from '../../sidecars/yggstack.js';
import {
  getActivePeerUris,
  getPeerPool,
  getSelfGeo
} from '../../sidecars/peer-manager.js';
import { getLocationStatusSnapshot } from '../../network/locationStatus.js';

/**
 * Registra los manejadores IPC relacionados con red y yggstack
 */
export function registerNetworkHandlers(): void {
  // Devuelve la dirección IPv6 Yggdrasil asignada por el sidecar yggstack.
  // Con el modo user-space no hay interfaz TUN, por lo que getNetworkAddress()
  // ya no aplica aquí; usamos getYggstackAddress() que lee del stdout del proceso.
  ipcMain.handle('get-ygg-ip', () => getYggstackAddress() || 'No detectado');

  // Devuelve estadísticas de red para la sección Conexión de Settings
  ipcMain.handle('get-network-stats', async () => {
    const selectedPeerUris = new Set(getActivePeerUris());
    const pool = getPeerPool();
    const connectedPeers = await getConnectedPeers();
    const connectedSet = new Set(connectedPeers?.map(peer => peer.uri) ?? []);
    const peerStats = pool
      .map(p => ({
        uri: p.uri,
        host: p.host,
        country: p.country,
        latencyMs: p.latencyMs,
        score: Math.round(p.score),
        alive: p.alive,
        lat: p.lat,
        lon: p.lon,
      }));
    const peersByUri = new Map(peerStats.map(peer => [peer.uri, peer]));
    const activePeers = connectedPeers?.flatMap(peer => {
      const publicPeer = peersByUri.get(peer.uri);
      return publicPeer ? [{ ...publicPeer, alive: true }] : [];
    }) ?? [];
    const reservePeers = peerStats.filter(peer => !connectedSet.has(peer.uri) && !selectedPeerUris.has(peer.uri));
    const self = getSelfGeo();
    return {
      peerCount: activePeers.length,
      peers: activePeers,
      connectionStatusAvailable: connectedPeers !== null,
      reservePeers,
      restartAttempts: getRestartAttempts(),
      maxRestartAttempts: getMaxRestartAttempts(),
      selfLat: self?.lat ?? null,
      selfLon: self?.lon ?? null,
    };
  });

  // Permite al usuario forzar un reinicio de yggstack desde la UI
  ipcMain.handle('restart-yggstack', async () => { await forceRestart(); });

  ipcMain.handle('get-location-status', () => getLocationStatusSnapshot());

  ipcMain.handle('fetch-og-preview', async (_event, { url }) => {
    try {
      if (typeof url !== 'string' || !url) return null;
      const parsed = new URL(url);
      if (!['http:', 'https:'].includes(parsed.protocol)) return null;
      const { fetchOgPreview } = await import('../../network/og-fetcher.js');
      return await fetchOgPreview(url);
    } catch {
      return null;
    }
  });
}