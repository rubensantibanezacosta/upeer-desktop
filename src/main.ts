import { app, BrowserWindow, ipcMain, session, dialog, nativeImage, shell } from 'electron';
import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import started from 'electron-squirrel-startup';

// Silenciar EPIPE en stdout/stderr — ocurre cuando el proceso se arranca piped
// (ej: `npm start | head -N`) y el receptor cierra antes de que termine el log.
// Sin este handler Node.js lo trata como excepción no capturada y Electron
// muestra un diálogo de error.
process.stdout.on('error', (err: NodeJS.ErrnoException) => { if (err.code !== 'EPIPE') throw err; });
process.stderr.on('error', (err: NodeJS.ErrnoException) => { if (err.code !== 'EPIPE') throw err; });

// Capturar promesas rechazadas sin .catch() — evita que el proceso muera
// en silencio o muestre diálogos de crash en Electron.
process.on('unhandledRejection', (reason: unknown) => {
  logError('[Main] Promesa rechazada sin capturar', { reason: String(reason) }, 'unhandled-rejection');
});

// Capturar excepciones síncronas no capturadas — último recurso antes del crash.
process.on('uncaughtException', (err: Error) => {
  logError('[Main] Excepción no capturada', { message: err.message, stack: err.stack }, 'uncaught-exception');
});

// Fix for Wayland file explorer issues
if (process.env.XDG_SESSION_TYPE === 'wayland') {
  app.commandLine.appendSwitch('enable-features', 'UseOzonePlatform');
  app.commandLine.appendSwitch('ozone-platform', 'wayland');
}

import {
  initDB,
  getMessages,
  getContacts,
  getContactByAddress,
  getContactByUpeerId,
  addOrUpdateContact,
  deleteContact,
  deleteMessagesByChatId,
  blockContact,
  unblockContact,
  getBlockedContacts,
  closeDB,
  getGroups,
  updateGroupAvatar,
  clearUserData
} from './main_process/storage/db.js';
import {
  startUDPServer,
  sendUDPMessage,
  checkHeartbeat,
  closeUDPServer,
  sendTypingIndicator,
  sendReadReceipt,
  sendContactCard,
  sendContactRequest,
  acceptContactRequest,
  broadcastDhtUpdate,
  sendChatReaction,
  sendChatUpdate,
  sendChatDelete,
  sendGroupMessage,
  createGroup,
  inviteToGroup,
  updateGroup,
  leaveGroup
} from './main_process/network/server.js';
import { fileTransferManager } from './main_process/network/file-transfer/index.js';
// getNetworkAddress se usa internamente en server.ts / dht — no llamar desde main.ts\n// con el nuevo sidecar user-space; usar getYggstackAddress() en su lugar.
import { initIdentity, getMyUPeerId, getMyPublicKeyHex, getMyAlias, setMyAlias, getMyAvatar, setMyAvatar, generateMnemonic, validateMnemonic, createMnemonicIdentity, unlockWithMnemonic, lockSession, isSessionLocked, isMnemonicMode } from './main_process/security/identity.js';
import { computeScore, getVouchScore } from './main_process/security/reputation/vouches.js';
import { spawnYggstack, stopYggstack, getYggstackAddress, onYggstackAddress, onYggstackStatus, getRestartAttempts, getMaxRestartAttempts, forceRestart } from './main_process/sidecars/yggstack.js';
import { getActivePeerUris, getPeerPool, getSelfGeo, stopPeerManager } from './main_process/sidecars/peer-manager.js';
import { startLanDiscovery, stopLanDiscovery } from './main_process/network/lan/discovery.js';
import { info, warn as logWarn, error as logError } from './main_process/security/secure-logger.js';

if (started) {
  app.quit();
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string;
declare const MAIN_WINDOW_VITE_NAME: string;

let mainWindow: BrowserWindow | null = null;

const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`));
  }
};

app.on('ready', async () => {
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
    const win = BrowserWindow.getAllWindows()[0];
    if (win) {
      win.webContents.send('yggstack-address', address);
      info('[IPC] Dirección Yggdrasil enviada al renderer', { address }, 'ipc');
    }
  });

  onYggstackStatus((status, address) => {
    const win = BrowserWindow.getAllWindows()[0];
    if (win) {
      win.webContents.send('yggstack-status', status, address);
    }
  });

  const userDataPath = app.getPath('userData');
  initIdentity(userDataPath);
  await initDB(userDataPath);
  createWindow();
  // Solo arrancar la red si ya tenemos identidad (sesión auto-restaurada).
  // En primera ejecución se arranca desde los handlers de create/unlock.
  if (!isSessionLocked() && mainWindow) startUDPServer(mainWindow);

  // Background: Query friends for offline messages stored in their vaults
  try {
    const { VaultManager } = await import('./main_process/network/vault/manager.js');
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
    checkHeartbeat(contacts.map(c => ({ address: (c as any).address, status: (c as any).status })));
  }, 30000);
});

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

ipcMain.handle('get-messages', (event, upeerId) => getMessages(upeerId));
ipcMain.handle('get-contacts', async () => {
  const contacts = await getContacts();

  const directContactIds = new Set<string>(
    contacts
      .filter((c: any) => c.status === 'connected' && c.upeerId)
      .map((c: any) => c.upeerId as string)
  );

  return contacts.map(contact => ({
    ...contact,
    vouchScore: computeScore(contact.upeerId ?? '', directContactIds),
  }));
});

ipcMain.handle('add-contact', async (event, { address, name }) => {
  // Único formato válido: UPeerID@IP (separador @)
  const separator = '@';
  if (!address.includes(separator)) {
    return { success: false, error: 'Formato UPeerID@IP requerido. Usa ID@200:xxxx:xxxx:...' };
  }

  let [targetUpeerId, targetIp] = address.split(separator);
  targetIp = targetIp.trim();

  // Validar formato de dirección Yggdrasil
  // El rango real es 200::/7, que en hex cubre de 200: hasta 3fe:
  // (primer octeto: 0x200-0x3fe, o sea, cualquier prefijo de 2xx: o 3xx:)
  const segments = targetIp.split(':');
  const YGG_REGEX = /^[23][0-9a-f]{2}:/i;
  const isValidYggdrasil = YGG_REGEX.test(targetIp) && segments.length === 8;

  if (!isValidYggdrasil) {
    return { success: false, error: 'Dirección Yggdrasil inválida. Debe tener 8 segmentos comenzando con 200:-3fe: (ej: 201:5884:ec67:1c3e:d713:8b32:ed5e:9de3)' };
  }

  // Ya tiene prefijo 200: y 8 segmentos, usar tal cual
  // (no se necesita normalización adicional)

  // Limpieza de fantasmas: Borramos cualquier rastro previo de esta IP
  const oldGhost = await getContactByAddress(targetIp);
  if (oldGhost && oldGhost.upeerId.startsWith('pending-')) {
    await deleteContact(oldGhost.upeerId);
  }

  // BUG DS fix: limitar longitud del nombre para evitar almacenamiento arbitrario
  const sanitizedName = typeof name === 'string' ? name.slice(0, 100) : '';

  // Create pending contact with the real ID from the start
  addOrUpdateContact(targetUpeerId, targetIp, sanitizedName, undefined, 'pending');

  await sendContactRequest(targetIp);

  return { success: true, upeerId: targetUpeerId };
});

ipcMain.handle('accept-contact-request', async (event, { upeerId, publicKey }) => {
  await acceptContactRequest(upeerId, publicKey);
  return { success: true };
});

ipcMain.handle('delete-contact', (event, { upeerId }) => {
  deleteMessagesByChatId(upeerId); // Bug EX fix: borrar mensajes huérfanos del contacto eliminado
  return deleteContact(upeerId);
});
ipcMain.handle('block-contact', (event, { upeerId }) => blockContact(upeerId));
ipcMain.handle('unblock-contact', (event, { upeerId }) => unblockContact(upeerId));
ipcMain.handle('get-blocked-contacts', () => getBlockedContacts());
ipcMain.handle('send-p2p-message', async (event, { upeerId, message, replyTo }) => await sendUDPMessage(upeerId, message, replyTo));
ipcMain.handle('send-typing-indicator', (event, { upeerId }) => sendTypingIndicator(upeerId));
ipcMain.handle('send-read-receipt', (event, { upeerId, id }) => sendReadReceipt(upeerId, id));
ipcMain.handle('send-contact-card', (event, { targetUpeerId, contact }) => sendContactCard(targetUpeerId, contact));
ipcMain.handle('send-chat-reaction', (event, { upeerId, msgId, emoji, remove }) => sendChatReaction(upeerId, msgId, emoji, remove));
ipcMain.handle('send-chat-update', (event, { upeerId, msgId, newContent }) => sendChatUpdate(upeerId, msgId, newContent));
ipcMain.handle('send-chat-delete', (event, { upeerId, msgId }) => sendChatDelete(upeerId, msgId));

// Group IPC handlers
ipcMain.handle('get-groups', () => getGroups());
ipcMain.handle('create-group', async (event, { name, memberUpeerIds, avatar }) => {
  // BUG DX fix: limitar longitud de nombre y avatar de grupo
  const safeName = typeof name === 'string' ? name.slice(0, 100) : '';
  if (typeof avatar === 'string' && avatar.length > 2_000_000) {
    return { success: false, error: 'Avatar demasiado grande (máx 2 MB)' };
  }
  const groupId = await createGroup(safeName, memberUpeerIds, avatar);
  return { success: true, groupId };
});
ipcMain.handle('update-group-avatar', (event, { groupId, avatar }) => {
  // BUG DX fix: limitar avatar de grupo
  if (typeof avatar === 'string' && avatar.length > 2_000_000) return { success: false, error: 'Avatar demasiado grande (máx 2 MB)' };
  return updateGroupAvatar(groupId, avatar);
});
ipcMain.handle('send-group-message', async (event, { groupId, message, replyTo }) => {
  const msgId = await sendGroupMessage(groupId, message, replyTo);
  return msgId;
});
ipcMain.handle('invite-to-group', async (event, { groupId, upeerId }) => {
  await inviteToGroup(groupId, upeerId);
  return { success: true };
});
ipcMain.handle('update-group', async (event, { groupId, name, avatar }) => {
  // BUG DX fix: limitar longitud de campos de grupo
  const safeName = typeof name === 'string' ? name.slice(0, 100) : name;
  if (typeof avatar === 'string' && avatar.length > 2_000_000) {
    return { success: false, error: 'Avatar demasiado grande (máx 2 MB)' };
  }
  await updateGroup(groupId, { name: safeName, avatar });
  return { success: true };
});
ipcMain.handle('leave-group', async (event, { groupId }) => {
  await leaveGroup(groupId);
  return { success: true };
});

// Handle contact untrustworthy events
ipcMain.on('contact-untrustworthy', (event, data) => {
  // Forward to renderer
  const mainWindow = BrowserWindow.getAllWindows()[0];
  if (mainWindow) {
    mainWindow.webContents.send('contact-untrustworthy', data);
  }
});

ipcMain.handle('get-my-identity', () => {
  // La dirección de identidad ahora proviene del sidecar yggstack (SOCKS5 user-space)
  // en lugar de la interfaz TUN/TAP del sistema operativo.
  const address = getYggstackAddress();
  if (isSessionLocked()) {
    return { address, upeerId: null, publicKey: null, alias: null, avatar: null };
  }
  return {
    address,
    upeerId: getMyUPeerId(),
    publicKey: getMyPublicKeyHex(),
    alias: getMyAlias(),
    avatar: getMyAvatar() || undefined
  };
});

ipcMain.handle('get-my-reputation', async () => {
  if (isSessionLocked()) return null;
  try {
    const myId = getMyUPeerId();
    const contacts = await getContacts();
    const connectedCount = (contacts as any[]).filter(c => c.status === 'connected').length;
    const vouchScore = await getVouchScore(myId);
    return { vouchScore, connectionCount: connectedCount };
  } catch {
    return { vouchScore: 50, connectionCount: 0 };
  }
});

// ── Identity / Wallet-style Auth API ───────────────────────

ipcMain.handle('identity-status', () => ({
  isMnemonicMode: isMnemonicMode(),
  isLocked: isSessionLocked(),
  upeerId: !isSessionLocked() ? getMyUPeerId() : null,
}));

ipcMain.handle('generate-mnemonic', () => ({
  mnemonic: generateMnemonic(),
}));

ipcMain.handle('set-my-alias', (event, { alias }) => {
  // BUG DS fix: limitar longitud del alias para evitar consumo excesivo de memoria/disco
  const sanitized = typeof alias === 'string' ? alias.slice(0, 100) : '';
  setMyAlias(sanitized);
  return { success: true };
});

ipcMain.handle('set-my-avatar', (event, { avatar }) => {
  // BUG DS fix: limitar a ~2 MB (base64 de imagen). >2 MB rechazado.
  if (typeof avatar === 'string' && avatar.length > 2_000_000) {
    return { success: false, error: 'Avatar demasiado grande (máx 2 MB)' };
  }
  setMyAvatar(avatar ?? '');
  return { success: true };
});

ipcMain.handle('create-mnemonic-identity', async (event, { mnemonic, alias, avatar }) => {
  // Si ya había una identidad activa (cambio de cuenta), cerrar la red y limpiar datos
  if (isMnemonicMode()) {
    closeUDPServer();
    stopPeerManager();
    stopLanDiscovery();
    clearUserData();
  }
  const result = await createMnemonicIdentity(mnemonic, alias, avatar);
  if (result.success && mainWindow) {
    startUDPServer(mainWindow);
    try { await startLanDiscovery(); } catch (e) { /* ignore */ }
  }
  return result;
});

ipcMain.handle('unlock-session', async (event, { mnemonic }) => {
  const result = await unlockWithMnemonic(mnemonic);
  if (result.success) {
    // Kick off network services now that we have a valid identity
    if (mainWindow) startUDPServer(mainWindow);
    try { await startLanDiscovery(); } catch (e) { /* ignore if already started */ }
  }
  return result;
});

ipcMain.handle('lock-session', () => {
  lockSession();
  return { success: true };
});

ipcMain.handle('get-vault-stats', async () => {
  const { getVaultStats } = await import('./main_process/storage/vault/operations.js');
  return await getVaultStats();
});

// File dialog handler
ipcMain.handle('open-file-dialog', async (event, { title, filters, defaultPath, multiSelect }) => {
  try {
    // Get the window that sent the request
    const senderWindow = BrowserWindow.fromWebContents(event.sender);
    const targetWindow = senderWindow || BrowserWindow.getFocusedWindow();

    const dialogOptions = {
      title: title || 'Seleccionar archivo',
      defaultPath: defaultPath || app.getPath('downloads'),
      filters: filters || [
        { name: 'Todos los archivos', extensions: ['*'] },
        { name: 'Imágenes', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp'] },
        { name: 'Documentos', extensions: ['pdf', 'doc', 'docx', 'txt', 'rtf'] },
        { name: 'Audio', extensions: ['mp3', 'wav', 'ogg', 'flac'] },
        { name: 'Video', extensions: ['mp4', 'mov', 'avi', 'mkv'] },
      ],
      properties: multiSelect ? ['openFile', 'multiSelections'] : ['openFile']
    } as any;
    // Procedemos directamente sin delay artificial
    // En Wayland, adjuntar a ventana padre a veces cuelga el portal xdg si no está bien configurado
    const isWayland = process.env.XDG_SESSION_TYPE === 'wayland';

    const result = (targetWindow && !isWayland)
      ? await dialog.showOpenDialog(targetWindow, dialogOptions)
      : await dialog.showOpenDialog(dialogOptions);

    if (result.canceled) {
      return { success: true, canceled: true, files: [] };
    }

    // Get file information for each selected file
    const files = await Promise.all(result.filePaths.map(async (filePath) => {
      try {
        const stats = await fs.stat(filePath);
        const ext = path.extname(filePath).toLowerCase();
        const name = path.basename(filePath);

        // Determine MIME type based on extension
        let mimeType = 'application/octet-stream';
        const mimeMap: Record<string, string> = {
          '.jpg': 'image/jpeg',
          '.jpeg': 'image/jpeg',
          '.png': 'image/png',
          '.gif': 'image/gif',
          '.webp': 'image/webp',
          '.txt': 'text/plain',
          '.pdf': 'application/pdf',
          '.zip': 'application/zip',
          '.mp3': 'audio/mpeg',
          '.mp4': 'video/mp4',
          '.mov': 'video/quicktime',
          '.avi': 'video/x-msvideo',
          '.doc': 'application/msword',
          '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          '.xls': 'application/vnd.ms-excel',
          '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          '.ppt': 'application/vnd.ms-powerpoint',
          '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
        };

        if (mimeMap[ext]) {
          mimeType = mimeMap[ext];
        }

        return {
          path: filePath,
          name,
          size: stats.size,
          type: mimeType,
          lastModified: stats.mtimeMs
        };
      } catch (err) {
        logError('Error getting file info', { filePath, err: String(err) }, 'ipc');
        return {
          path: filePath,
          name: path.basename(filePath),
          size: 0,
          type: 'application/octet-stream',
          lastModified: Date.now()
        };
      }
    }));

    return { success: true, canceled: false, files };
  } catch (error) {
    logError('Error opening file dialog', { err: String(error) }, 'ipc');
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
});

// Read file as base64 for preview
ipcMain.handle('read-file-as-base64', async (event, { filePath, maxSizeMB = 5 }) => {
  try {
    // BUG CX fix: sin restricción de path, un renderer comprometido puede leer
    // ~/.ssh/id_rsa, /etc/passwd u otros archivos sensibles y renderizarlos
    // (exfiltración local). Misma protección que BUG AG y BUG CW.
    if (typeof filePath !== 'string' || !filePath) {
      return { success: false, error: 'Invalid file path' };
    }
    const resolvedPath = path.resolve(filePath);
    const homeDir = app.getPath('home');
    const homeDirNormalized = homeDir.endsWith(path.sep) ? homeDir : homeDir + path.sep;
    if (!resolvedPath.startsWith(homeDirNormalized) && resolvedPath !== homeDir) {
      return { success: false, error: 'File must be within home directory' };
    }

    const stats = await fs.stat(resolvedPath);
    const maxSizeBytes = maxSizeMB * 1024 * 1024;

    if (stats.size > maxSizeBytes) {
      return { success: false, error: `File too large for preview. Max size: ${maxSizeMB}MB` };
    }

    const buffer = await fs.readFile(resolvedPath);
    const base64 = buffer.toString('base64');
    const ext = path.extname(resolvedPath).toLowerCase();

    // Determine MIME type based on extension
    let mimeType = 'application/octet-stream';
    const mimeMap: Record<string, string> = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.bmp': 'image/bmp',
      '.svg': 'image/svg+xml'
    };

    if (mimeMap[ext]) {
      mimeType = mimeMap[ext];
    }

    const dataUrl = `data:${mimeType};base64,${base64}`;

    return { success: true, dataUrl, mimeType, size: stats.size };
  } catch (error) {
    logError('Error reading file as base64', { err: String(error) }, 'ipc');
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
});

// File transfer handlers (Phase 16)
ipcMain.handle('start-file-transfer', async (event, { upeerId, filePath, thumbnail }) => {
  try {
    // BUG CW fix: un renderer comprometido (XSS en contenido del chat) podría llamar a
    // start-file-transfer con filePath='~/.ssh/id_rsa' y el proceso principal leería y
    // transmitiría ese archivo al peer destino. Mismo patrón de protección que BUG AG
    // (save-transferred-file ya restringe el destino al homeDir).
    if (typeof filePath !== 'string' || !filePath) {
      return { success: false, error: 'Invalid file path' };
    }
    const resolvedSrc = path.resolve(filePath);
    const homeDir = app.getPath('home');
    const homeDirNormalized = homeDir.endsWith(path.sep) ? homeDir : homeDir + path.sep;
    if (!resolvedSrc.startsWith(homeDirNormalized) && resolvedSrc !== homeDir) {
      return { success: false, error: 'Source file must be within home directory' };
    }

    const contact = await getContactByUpeerId(upeerId);
    if (!contact || contact.status !== 'connected') {
      return { success: false, error: 'Contact not connected' };
    }

    const fileId = await fileTransferManager.startSend(upeerId, contact.address, resolvedSrc, thumbnail);
    return { success: true, fileId };
  } catch (error) {
    logError('Error starting file transfer', { err: String(error) }, 'file-transfer');
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
});

ipcMain.handle('cancel-file-transfer', (event, { fileId, reason }) => {
  try {
    fileTransferManager.cancelTransfer(fileId, reason);
    return { success: true };
  } catch (error) {
    logError('Error canceling file transfer', { err: String(error) }, 'file-transfer');
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
});

ipcMain.handle('get-file-transfers', () => {
  try {
    const transfers = fileTransferManager.getAllTransfers().map((t: any) => {
      const { fileBuffer, pendingChunks, timers, _retryTimer, _chunksSentTimes, ...serializableTransfer } = t;
      return {
        ...serializableTransfer,
        pendingChunks: pendingChunks ? Array.from(pendingChunks) : [],
        progress: (t.chunksProcessed / t.totalChunks) * 100
      };
    });
    return { success: true, transfers };
  } catch (error) {
    logError('Error getting file transfers', { err: String(error) }, 'file-transfer');
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
});

ipcMain.handle('save-transferred-file', async (event, { fileId, destinationPath }) => {
  try {
    // BUG AG fix: validar destinationPath antes de copiar.
    // Sin esto, un renderer comprometido (XSS, inyección de contenido) podría
    // escribir en rutas arbitrarias como ~/.ssh/authorized_keys o ~/.bashrc.
    if (typeof destinationPath !== 'string' || !destinationPath) {
      return { success: false, error: 'Invalid destination path' };
    }
    const resolvedDest = path.resolve(destinationPath);
    const homeDir = app.getPath('home');
    // Permitir solo destinos dentro del directorio home del usuario.
    // path.sep al final evita que homeDir sea prefijo de otro directorio
    // con el mismo nombre más texto (ej: /home/user vs /home/username).
    const homeDirNormalized = homeDir.endsWith(path.sep) ? homeDir : homeDir + path.sep;
    if (!resolvedDest.startsWith(homeDirNormalized) && resolvedDest !== homeDir) {
      return { success: false, error: 'Destination must be within home directory' };
    }

    const transfer = fileTransferManager.getTransfer(fileId, 'receiving');
    if (!transfer || !transfer.tempPath) {
      return { success: false, error: 'Transfer not found or no temporary file' };
    }

    // Move file from temp location to destination
    const fs = await import('node:fs/promises');
    await fs.copyFile(transfer.tempPath, resolvedDest);
    // Optionally delete temp file (cleanup will happen later)

    return { success: true };
  } catch (error) {
    logError('Error saving transferred file', { err: String(error) }, 'file-transfer');
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
});

// BUG EC fix: diálogo nativo de "Guardar como" para que el renderer pueda
// pedir al usuario dónde guardar un archivo transferido.
ipcMain.handle('show-save-dialog', async (event, { defaultPath, filters }) => {
  try {
    const senderWindow = BrowserWindow.fromWebContents(event.sender);
    const targetWindow = senderWindow || BrowserWindow.getFocusedWindow();
    const opts = {
      defaultPath: typeof defaultPath === 'string' ? defaultPath : undefined,
      filters: Array.isArray(filters) ? filters : [
        { name: 'Todos los archivos', extensions: ['*'] },
      ],
    } as Parameters<typeof dialog.showSaveDialog>[0];
    const result = targetWindow
      ? await dialog.showSaveDialog(targetWindow, opts)
      : await dialog.showSaveDialog(opts);
    return result; // { canceled, filePath }
  } catch (error) {
    logError('Error en show-save-dialog', { err: String(error) }, 'ipc');
    return { canceled: true };
  }
});

// BUG EC fix: abrir un archivo guardado con la aplicación predeterminada del
// sistema. Incluye la misma validación de ruta que el resto de handlers de
// archivos (solo dentro del homeDir del usuario).
ipcMain.handle('open-file', async (event, { filePath }) => {
  try {
    if (typeof filePath !== 'string' || !filePath) {
      return { success: false, error: 'Ruta de archivo inválida' };
    }
    const resolvedPath = path.resolve(filePath);
    const homeDir = app.getPath('home');
    const homeDirNormalized = homeDir.endsWith(path.sep) ? homeDir : homeDir + path.sep;
    if (!resolvedPath.startsWith(homeDirNormalized) && resolvedPath !== homeDir) {
      return { success: false, error: 'El archivo debe estar dentro del directorio home' };
    }
    const errorMsg = await shell.openPath(resolvedPath);
    return { success: !errorMsg, error: errorMsg || undefined };
  } catch (error) {
    logError('Error abriendo archivo', { err: String(error) }, 'ipc');
    return { success: false, error: error instanceof Error ? error.message : 'Error desconocido' };
  }
});

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
