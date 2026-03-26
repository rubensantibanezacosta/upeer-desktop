import { app } from 'electron';
import { spawnYggstack, onYggstackAddress, onYggstackStatus } from '../sidecars/yggstack.js';
import { initIdentity, isSessionLocked } from '../security/identity.js';
import { initDB } from '../storage/init.js';
import { startUDPServer } from '../network/server/tcpServer.js';
import { startRenewalService } from '../network/dht/renewal.js';
import { info, error as logError } from '../security/secure-logger.js';
import { setMainWindow, getAllWindows } from './windowManager.js';
import {
  configureProxy,
  createMainWindow,
  ensureInternalAssetsDir,
  registerMediaProtocol,
  scheduleYggstackStartupTasks,
  startBackgroundIntervals,
} from './appInitializerSupport.js';

declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string;
declare const MAIN_WINDOW_VITE_NAME: string;

let heartbeatInterval: NodeJS.Timeout | null = null;
let dhtInterval: NodeJS.Timeout | null = null;

export function stopHeartbeat() {
  if (dhtInterval) {
    clearInterval(dhtInterval);
    dhtInterval = null;
  }
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
    info('[Heartbeat] Intervalo detenido', {}, 'heartbeat');
  }
}

export async function initializeApp(baseDir: string): Promise<void> {
  ensureInternalAssetsDir();
  await configureProxy();
  await registerMediaProtocol();

  try {
    await spawnYggstack();
  } catch (err) {
    logError('[yggstack] Error inicializando sidecar', { err: String(err) }, 'yggstack');
  }

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

  const mainWindow = await createMainWindow(baseDir, MAIN_WINDOW_VITE_DEV_SERVER_URL, MAIN_WINDOW_VITE_NAME);
  setMainWindow(mainWindow);

  if (!isSessionLocked()) {
    startUDPServer(mainWindow);
  }

  try {
    const { VaultManager } = await import('../network/vault/manager.js');
    VaultManager.queryOwnVaults();
  } catch (err) {
    logError('[Vault] Error querying offline messages', { err: String(err) }, 'vault');
  }

  if (!isSessionLocked()) {
    try {
      startRenewalService();
    } catch (err) {
      logError('[Renewal] Error starting renewal service', { err: String(err) }, 'dht');
    }
  }

  scheduleYggstackStartupTasks(isSessionLocked);
  const intervals = startBackgroundIntervals(isSessionLocked);
  dhtInterval = intervals.dhtInterval;
  heartbeatInterval = intervals.heartbeatInterval;
}