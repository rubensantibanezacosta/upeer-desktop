import { session, app, BrowserWindow } from 'electron';
import path from 'node:path';
import { spawnYggstack, onYggstackAddress, onYggstackStatus } from '../sidecars/yggstack.js';
import { initIdentity, isSessionLocked } from '../security/identity.js';
import { initDB, getContacts } from '../storage/db.js';
import { startUDPServer, broadcastDhtUpdate, checkHeartbeat } from '../network/server/index.js';
import { startLanDiscovery } from '../network/lan/discovery.js';
import { info, error as logError } from '../security/secure-logger.js';
import { setMainWindow, getAllWindows } from './windowManager.js';

declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string;
declare const MAIN_WINDOW_VITE_NAME: string;

/**
 * Inicializa la aplicación cuando Electron está listo
 * @param baseDir Directorio base donde se encuentra el archivo main.js (usualmente __dirname del entry point)
 */
export async function initializeApp(baseDir: string): Promise<void> {
  // ── 1. Configurar proxy SOCKS5 ANTES de crear la ventana ──────────────────
  //
  // Todo el tráfico de red de la sesión Electron (fetch, XHR, WebSocket) se
  // enrutará a través del sidecar yggstack que escucha en 127.0.0.1:9050.
  //
  // proxyBypassRules: 'localhost' garantiza que las comunicaciones internas
  // de la app (IPC HTTP, dev-server de Vite, etc.) NO pasen por el proxy.
  await session.defaultSession.setProxy({
    proxyRules: 'socks5://127.0.0.1:9050',
    proxyBypassRules: 'localhost',
  });
  info('[Proxy] SOCKS5 configurado', { proxy: 'socks5://127.0.0.1:9050', bypass: 'localhost' }, 'proxy');

  // ── 2. Arrancar el sidecar yggstack en user-space ─────────────────────────
  //
  // yggstack NO crea interfaces TUN/TAP ni requiere privilegios de root/UAC.
  // Solo expone el proxy SOCKS5 local ya configurado arriba.
  try {
    await spawnYggstack();
  } catch (err) {
    logError('[yggstack] Error inicializando sidecar', { err: String(err) }, 'yggstack');
    // La app continúa: puede funcionar en modo local sin red Yggdrasil.
  }

  // ── 3. Cuando el sidecar detecte su IPv6, notificar al renderer via IPC ───
  onYggstackAddress((address) => {
    const win = getAllWindows()[0];
    if (win) {
      win.webContents.send('yggstack-address', address);
      info('[IPC] Dirección Yggdrasil enviada al renderer', { address }, 'ipc');
    }
  });

  onYggstackStatus((status, address) => {
    const win = getAllWindows()[0];
    if (win) {
      win.webContents.send('yggstack-status', status, address);
    }
  });

  const userDataPath = app.getPath('userData');
  initIdentity(userDataPath);
  await initDB(userDataPath);

  // Crear ventana principal
  const mainWindow = new BrowserWindow({
    width: 1000,
    height: 800,
    webPreferences: {
      preload: path.join(baseDir, 'preload.cjs'),
    },
  });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(baseDir, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`));
  }

  setMainWindow(mainWindow);

  // Solo arrancar la red si ya tenemos identidad (sesión auto-restaurada).
  // En primera ejecución se arranca desde los handlers de create/unlock.
  if (!isSessionLocked() && mainWindow) startUDPServer(mainWindow);

  // Background: Query friends for offline messages stored in their vaults
  try {
    const { VaultManager } = await import('../network/vault/manager.js');
    VaultManager.queryOwnVaults();
  } catch (err) {
    logError('[Vault] Error querying offline messages', { err: String(err) }, 'vault');
  }

  // Solo arrancar LAN discovery si hay identidad activa (igual que UDP)
  if (!isSessionLocked()) {
    try {
      await startLanDiscovery();
    } catch (err) {
      logError('[LAN] Error starting LAN discovery', { err: String(err) }, 'lan');
    }
  }

  // Heartbeat every 30s
  setInterval(() => {
    if (isSessionLocked()) return;
    broadcastDhtUpdate(); // Detect IP changes and broadcast
    const contacts = getContacts();
    checkHeartbeat(contacts);
  }, 30000);
}