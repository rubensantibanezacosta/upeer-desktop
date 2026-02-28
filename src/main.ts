import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import started from 'electron-squirrel-startup';

import {
  initDB,
  getMessages,
  getContacts,
  getContactByAddress,
  addOrUpdateContact,
  deleteContact,
  closeDB
} from './main_process/database.js';
import {
  getNetworkAddress,
  startUDPServer,
  sendUDPMessage,
  checkHeartbeat,
  closeUDPServer,
  sendTypingIndicator,
  sendReadReceipt,
  sendContactCard,
  sendContactRequest,
  acceptContactRequest
} from './main_process/network.js';
import { initIdentity, getMyRevelNestId, getMyPublicKeyHex } from './main_process/identity.js';

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

app.on('ready', () => {
  initIdentity();
  initDB();
  createWindow();
  if (mainWindow) startUDPServer(mainWindow);

  // Heartbeat every 30s
  setInterval(() => {
    const contacts = getContacts();
    checkHeartbeat(contacts.map(c => ({ address: (c as any).address, status: (c as any).status })));
  }, 30000);
});

ipcMain.handle('get-ygg-ip', () => getNetworkAddress() || 'No detectado');
ipcMain.handle('get-messages', (event, revelnestId) => getMessages(revelnestId));
ipcMain.handle('get-contacts', () => getContacts());

ipcMain.handle('add-contact', async (event, { address, name }) => {
  if (!address.includes('@')) {
    return { success: false, error: 'Formato RevelNestID@IP requerido' };
  }

  const [targetRevelnestId, targetIp] = address.split('@');

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

ipcMain.handle('get-my-identity', () => ({
  address: getNetworkAddress(),
  revelnestId: getMyRevelNestId(),
  publicKey: getMyPublicKeyHex()
}));

app.on('window-all-closed', () => {
  closeDB();
  closeUDPServer();
  if (process.platform !== 'darwin') app.quit();
});
