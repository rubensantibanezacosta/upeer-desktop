import { protocol, session, app, BrowserWindow, shell } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { Readable } from 'node:stream';
import { spawnYggstack, onYggstackAddress, onYggstackStatus } from '../sidecars/yggstack.js';
import { initIdentity, isSessionLocked } from '../security/identity.js';
import { initDB } from '../storage/init.js';
import { getContacts } from '../storage/contacts/operations.js';
import { startUDPServer } from '../network/server/tcpServer.js';
import { broadcastDhtUpdate, checkHeartbeat } from '../network/messaging/heartbeat.js';
import { startRenewalService } from '../network/dht/renewal.js';
import { info, error as logError } from '../security/secure-logger.js';
import { setMainWindow, getAllWindows } from './windowManager.js';
import { fileTransferManager } from '../network/file-transfer/transfer-manager.js';

declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string;
declare const MAIN_WINDOW_VITE_NAME: string;

let heartbeatInterval: NodeJS.Timeout | null = null;

export function stopHeartbeat() {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
    info('[Heartbeat] Intervalo detenido', {}, 'heartbeat');
  }
}

/**
 * Inicializa la aplicación cuando Electron está listo
 * @param baseDir Directorio base donde se encuentra el archivo main.js (usualmente __dirname del entry point)
 */
export async function initializeApp(baseDir: string): Promise<void> {
  // ── 0. Crear directorio de assets internos para adjuntos ──────────────────
  const internalAssetsDir = path.join(app.getPath('userData'), 'assets');
  if (!fs.existsSync(internalAssetsDir)) {
    fs.mkdirSync(internalAssetsDir, { recursive: true });
    info('[Init] Directorio de assets internos creado', { path: internalAssetsDir }, 'init');
  }

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

  // ── 1b. Registrar protocolo custom para media (streaming local) ────────────
  // Evita cargar archivos grandes en memoria como base64 y permite búsqueda (seek).
  protocol.handle('media', async (request) => {
    try {
      // BUG SEC-DUP fix: eliminar duplicación de declaración de url
      const url = new URL(request.url);
      let filePath: string;

      if (process.platform === 'win32') {
        // En Windows, 'url.hostname' suele ser la letra de unidad (C:) y 'url.pathname' el resto
        const drive = url.hostname;
        const remainingPath = decodeURIComponent(url.pathname);
        filePath = path.normalize(drive + ':' + remainingPath);
      } else {
        // En Linux/macOS, Electron 25+ puede meter el path en hostname si no hay triple slash
        // Combinamos hostname y pathname para capturar la ruta completa
        const combinedPath = url.hostname + decodeURIComponent(url.pathname);
        filePath = path.normalize(combinedPath);
        if (!filePath.startsWith('/')) {
          filePath = '/' + filePath;
        }
      }

      // BUG SEC-MP (Multiplatform Path): Normalizar separadores y asegurar slash final para startsWith
      const normalizeForGrant = (p: string) => {
        const n = path.normalize(p);
        return n.endsWith(path.sep) ? n : n + path.sep;
      };

      const assetsDir = normalizeForGrant(path.join(app.getPath('userData'), 'assets'));
      const tempDir = normalizeForGrant(app.getPath('temp')); // Necesario para descargas en curso

      // Añadir slash al final de filePath para que .startsWith() no valide "dir2" cuando el grant es "dir"
      const filePathCheck = filePath.endsWith(path.sep) ? filePath : filePath + path.sep;

      const isUnderAssets = filePathCheck.startsWith(assetsDir);
      const isUnderTemp = filePathCheck.startsWith(tempDir);

      if (!isUnderAssets && !isUnderTemp) {
        logError('[Protocol] Bloqueado acceso fuera de assets o temp', { path: filePath }, 'security');
        return new Response('Access Denied', { status: 403 });
      }

      // BUG SEC-SD (Sensitive Data): Bloquear acceso a archivos sensibles multiplataforma
      const sensitivePatterns = [
        /[\\/]\.ssh[\\/]/, /[\\/]\.gnupg[\\/]/, /[\\/]\.aws[\\/]/,
        /\.env$/, /config\.json$/, /identity\.json$/,
        /dht-cache\.json$/, /ratchet-state\.json$/, /\.sqlite-wal$/, /\.sqlite-shm$/
      ];
      if (sensitivePatterns.some(pattern => pattern.test(filePath))) {
        logError('[Protocol] Bloqueado acceso a archivo sensible', { path: filePath }, 'security');
        return new Response('Access Denied', { status: 403 });
      }

      info(`[Protocol] Requesting: ${filePath}, Range: ${request.headers.get('range') || 'none'}`, {}, 'network');

      try {
        const stats = await fs.promises.stat(filePath);
        const range = request.headers.get('range');
        const ext = path.extname(filePath).toLowerCase();

        const mimeMap: Record<string, string> = {
          '.mp4': 'video/mp4', '.webm': 'video/webm', '.mkv': 'video/x-matroska',
          '.avi': 'video/x-msvideo', '.mov': 'video/quicktime', '.m4v': 'video/x-m4v',
          '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
          '.gif': 'image/gif', '.webp': 'image/webp'
        };
        const contentType = mimeMap[ext] || 'application/octet-stream';

        let responseStatus = 200;
        let start = 0;
        let end = stats.size - 1;

        if (range) {
          const parts = range.replace(/bytes=/, "").split("-");
          start = parseInt(parts[0], 10);
          end = parts[1] ? parseInt(parts[1], 10) : stats.size - 1;
          responseStatus = 206;
          info(`[Protocol] Serving 206 Partial Content: ${start}-${end}/${stats.size}`, {}, 'network');
        } else {
          info(`[Protocol] Serving 200 OK (Full File): ${stats.size} bytes`, {}, 'network');
        }

        const chunksize = (end - start) + 1;
        const stream = fs.createReadStream(filePath, { start, end });

        const webStream = Readable.toWeb(stream);

        const responseObj = {
          status: responseStatus,
          statusText: responseStatus === 206 ? 'Partial Content' : 'OK',
          headers: {
            'Content-Type': contentType,
            'Accept-Ranges': 'bytes',
            'Content-Length': chunksize.toString(),
            'Content-Range': responseStatus === 206 ? `bytes ${start}-${end}/${stats.size}` : undefined as any,
          }
        };

        return new Response(webStream as unknown as ReadableStream, responseObj);
      } catch (e: any) {
        info(`[Protocol] Error sirviendo ${filePath}: ${e.message}`, {}, 'network');
        return new Response('File error', { status: 404 });
      }
    } catch (err) {
      logError('[Protocol] Error crítico en media://', { err: String(err), url: request.url }, 'app');
      return new Response('Invalid media URL', { status: 400 });
    }
  });
  info('[Protocol] media:// registrado', {}, 'app');

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
      // Permitir la reproducción de codecs no libres (como los que suelen ir en MKV)
      // si el hardware lo soporta y evitar problemas de sandboxing en desarrollo
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true, // Mantener por seguridad, el protocolo media:// ya lo maneja
    },
  });

  mainWindow.maximize();

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(baseDir, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`));
  }

  setMainWindow(mainWindow);

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const parsed = new URL(url);
      if (['http:', 'https:'].includes(parsed.protocol)) {
        shell.openExternal(url);
      }
    } catch { /* URL malformada — ignorar */ }
    return { action: 'deny' };
  });

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
      startRenewalService();
    } catch (err) {
      logError('[Renewal] Error starting renewal service', { err: String(err) }, 'dht');
    }
  }

  // Heartbeat every 30s
  heartbeatInterval = setInterval(() => {
    if (isSessionLocked()) return;
    broadcastDhtUpdate();
    const contacts = getContacts();
    checkHeartbeat(contacts);
    fileTransferManager.checkStaleTransfers();
  }, 30000);
}