import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import started from 'electron-squirrel-startup';

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
  getContactByRevelnestId,
  addOrUpdateContact,
  deleteContact,
  closeDB
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
  sendChatDelete
} from './main_process/network/server.js';
import { fileTransferManager } from './main_process/network/file-transfer/index.js';
import { getNetworkAddress } from './main_process/network/utils.js';
import { initIdentity, getMyRevelNestId, getMyPublicKeyHex } from './main_process/security/identity.js';
import { manageYggdrasilInstance, stopYggdrasil } from './main_process/sidecars/yggdrasil.js';
import { startLanDiscovery, stopLanDiscovery } from './main_process/network/lan/discovery.js';

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
  // Inicializamos Yggdrasil antes de levantar los servicios locales y la interfaz
  try {
    await manageYggdrasilInstance();
  } catch (err) {
    console.error('[Yggdrasil] Error inicializando sidecar:', err);
  }

  const userDataPath = app.getPath('userData');
  initIdentity(userDataPath);
  await initDB(userDataPath);
  createWindow();
  if (mainWindow) startUDPServer(mainWindow);

  // Start LAN discovery for local network peers
  try {
    await startLanDiscovery();
  } catch (err) {
    console.error('[LAN] Error starting LAN discovery:', err);
  }

  // Heartbeat every 30s
  setInterval(() => {
    broadcastDhtUpdate(); // Detect IP changes and broadcast
    const contacts = getContacts();
    checkHeartbeat(contacts.map(c => ({ address: (c as any).address, status: (c as any).status })));
  }, 30000);
});

ipcMain.handle('get-ygg-ip', () => getNetworkAddress() || 'No detectado');
ipcMain.handle('get-messages', (event, revelnestId) => getMessages(revelnestId));
ipcMain.handle('get-contacts', () => getContacts());

ipcMain.handle('add-contact', async (event, { address, name }) => {
  // Único formato válido: RevelNestID@IP (separador @)
  const separator = '@';
  if (!address.includes(separator)) {
    return { success: false, error: 'Formato RevelNestID@IP requerido. Usa ID@200:xxxx:xxxx:...' };
  }

  let [targetRevelnestId, targetIp] = address.split(separator);
  targetIp = targetIp.trim();

  // Validar formato de dirección Yggdrasil - Requerir formato completo con 200:
  const segments = targetIp.split(':');
  const has200Prefix = targetIp.startsWith('200:');

  // Dirección Yggdrasil válida: debe comenzar con 200: y tener 8 segmentos
  const isValidYggdrasil = has200Prefix && segments.length === 8;

  if (!isValidYggdrasil) {
    return { success: false, error: 'Dirección Yggdrasil inválida. Debe tener 8 segmentos comenzando con 200: (ej: 200:7704:49e5:b4cd:7910:2191:2574:351b)' };
  }

  // Ya tiene prefijo 200: y 8 segmentos, usar tal cual
  // (no se necesita normalización adicional)

  // Limpieza de fantasmas: Borramos cualquier rastro previo de esta IP
  const oldGhost = await getContactByAddress(targetIp);
  if (oldGhost && oldGhost.revelnestId.startsWith('pending-')) {
    await deleteContact(oldGhost.revelnestId);
  }

  // Create pending contact with the real ID from the start
  addOrUpdateContact(targetRevelnestId, targetIp, name, undefined, 'pending');

  await sendContactRequest(targetIp, name);

  return { success: true, revelnestId: targetRevelnestId };
});

ipcMain.handle('accept-contact-request', async (event, { revelnestId, publicKey }) => {
  await acceptContactRequest(revelnestId, publicKey);
  return { success: true };
});

ipcMain.handle('delete-contact', (event, { revelnestId }) => deleteContact(revelnestId));
ipcMain.handle('send-p2p-message', async (event, { revelnestId, message, replyTo }) => await sendUDPMessage(revelnestId, message, replyTo));
ipcMain.handle('send-typing-indicator', (event, { revelnestId }) => sendTypingIndicator(revelnestId));
ipcMain.handle('send-read-receipt', (event, { revelnestId, id }) => sendReadReceipt(revelnestId, id));
ipcMain.handle('send-contact-card', (event, { targetRevelnestId, contact }) => sendContactCard(targetRevelnestId, contact));
ipcMain.handle('send-chat-reaction', (event, { revelnestId, msgId, emoji, remove }) => sendChatReaction(revelnestId, msgId, emoji, remove));
ipcMain.handle('send-chat-update', (event, { revelnestId, msgId, newContent }) => sendChatUpdate(revelnestId, msgId, newContent));
ipcMain.handle('send-chat-delete', (event, { revelnestId, msgId }) => sendChatDelete(revelnestId, msgId));

// Handle contact untrustworthy events
ipcMain.on('contact-untrustworthy', (event, data) => {
  // Forward to renderer
  const mainWindow = BrowserWindow.getAllWindows()[0];
  if (mainWindow) {
    mainWindow.webContents.send('contact-untrustworthy', data);
  }
});

ipcMain.handle('get-my-identity', () => ({
  address: getNetworkAddress(),
  revelnestId: getMyRevelNestId(),
  publicKey: getMyPublicKeyHex()
}));

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
        console.error(`Error getting file info for ${filePath}:`, err);
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
    console.error('Error opening file dialog:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
});

// Read file as base64 for preview
ipcMain.handle('read-file-as-base64', async (event, { filePath, maxSizeMB = 5 }) => {
  try {
    const stats = await fs.stat(filePath);
    const maxSizeBytes = maxSizeMB * 1024 * 1024;

    if (stats.size > maxSizeBytes) {
      return { success: false, error: `File too large for preview. Max size: ${maxSizeMB}MB` };
    }

    const buffer = await fs.readFile(filePath);
    const base64 = buffer.toString('base64');
    const ext = path.extname(filePath).toLowerCase();

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
    console.error('Error reading file as base64:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
});

// File transfer handlers (Phase 16)
ipcMain.handle('start-file-transfer', async (event, { revelnestId, filePath, thumbnail }) => {
  try {
    const contact = await getContactByRevelnestId(revelnestId);
    if (!contact || contact.status !== 'connected') {
      return { success: false, error: 'Contact not connected' };
    }

    const fileId = await fileTransferManager.startSend(revelnestId, contact.address, filePath, thumbnail);
    return { success: true, fileId };
  } catch (error) {
    console.error('Error starting file transfer:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
});

ipcMain.handle('cancel-file-transfer', (event, { fileId, reason }) => {
  try {
    fileTransferManager.cancelTransfer(fileId, reason);
    return { success: true };
  } catch (error) {
    console.error('Error canceling file transfer:', error);
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
    console.error('Error getting file transfers:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
});

ipcMain.handle('save-transferred-file', async (event, { fileId, destinationPath }) => {
  try {
    const transfer = fileTransferManager.getTransfer(fileId, 'receiving');
    if (!transfer || !transfer.tempPath) {
      return { success: false, error: 'Transfer not found or no temporary file' };
    }

    // Move file from temp location to destination
    const fs = await import('node:fs/promises');
    await fs.copyFile(transfer.tempPath, destinationPath);
    // Optionally delete temp file (cleanup will happen later)

    return { success: true };
  } catch (error) {
    console.error('Error saving transferred file:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
});

app.on('window-all-closed', () => {
  closeDB();
  closeUDPServer();
  stopYggdrasil();
  stopLanDiscovery();
  if (process.platform !== 'darwin') app.quit();
});
