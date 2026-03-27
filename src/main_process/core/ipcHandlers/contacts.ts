import { ipcMain } from 'electron';
import { getAllWindows } from '../windowManager.js';
import {
  getContacts,
  getContactByAddress,
  deleteContact,
  addOrUpdateContact,
  blockContact,
  unblockContact,
  getBlockedContacts,
  setContactFavorite,
} from '../../storage/contacts/operations.js';
import { deleteMessagesByChatId } from '../../storage/messages/operations.js';
import { sendContactRequest, acceptContactRequest } from '../../network/messaging/contacts.js';
import { sendChatClear } from '../../network/messaging/chat.js';
import { computeScore, getDirectContactIds } from '../../security/reputation/vouches.js';
import { warn } from '../../security/secure-logger.js';
import { isYggdrasilAddress } from '../../../utils/yggdrasilAddress.js';

/**
 * Registra los manejadores IPC relacionados con contactos
 */
export function registerContactHandlers(): void {
  ipcMain.handle('get-contacts', async () => {
    const contacts = await getContacts();
    const directContactIds = await getDirectContactIds();

    return contacts.map(contact => {
      let known: string[] = [];
      if (contact.knownAddresses) {
        try {
          known = typeof contact.knownAddresses === 'string'
            ? JSON.parse(contact.knownAddresses)
            : contact.knownAddresses;
        } catch (parseError) {
          warn('Failed to parse contact knownAddresses', { upeerId: contact.upeerId, parseError: String(parseError) }, 'contacts');
        }
      }

      return {
        ...contact,
        knownAddresses: known,
        vouchScore: computeScore(contact.upeerId ?? '', directContactIds),
      };
    });
  });

  ipcMain.handle('add-contact', async (event, { address, name }) => {
    const candidateAddress = typeof address === 'string' ? address.trim() : '';
    const separatorIndex = candidateAddress.indexOf('@');
    if (separatorIndex <= 0 || separatorIndex === candidateAddress.length - 1) {
      return { success: false, error: 'Formato UPeerID@IP requerido. Usa ID@200:... o ID@300:...' };
    }

    const targetUpeerId = candidateAddress.slice(0, separatorIndex).trim();
    const rawTargetIp = candidateAddress.slice(separatorIndex + 1);
    const targetIp = rawTargetIp.trim();
    if (!targetUpeerId || !targetIp) {
      return { success: false, error: 'Formato UPeerID@IP requerido. Usa ID@200:... o ID@300:...' };
    }

    if (!isYggdrasilAddress(targetIp)) {
      return { success: false, error: 'Dirección Yggdrasil inválida. Debe estar en 200::/7, incluyendo nodos 200::/8 y prefijos 300::/8.' };
    }

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
    return deleteContact(upeerId);
  });

  ipcMain.handle('clear-chat', async (event, { upeerId }) => {
    try {
      const now = Date.now();
      deleteMessagesByChatId(upeerId, now);

      try {
        await sendChatClear(upeerId, now);
      } catch (syncError) {
        warn('Failed to sync chat clear to other devices', { upeerId, syncError: String(syncError) }, 'network');
      }

      return { success: true };
    } catch (error: unknown) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle('block-contact', (event, { upeerId }) => blockContact(upeerId));
  ipcMain.handle('unblock-contact', (event, { upeerId }) => unblockContact(upeerId));
  ipcMain.handle('toggle-favorite-contact', (event, { upeerId, isFavorite }) => {
    setContactFavorite(upeerId, !!isFavorite);
    return { success: true };
  });
  ipcMain.handle('get-blocked-contacts', () => getBlockedContacts());

  // Evento para notificar al renderer sobre contactos no confiables
  ipcMain.on('contact-untrustworthy', (event, data) => {
    // Forward to renderer
    const mainWindow = getAllWindows()[0];
    if (mainWindow) {
      mainWindow.webContents.send('contact-untrustworthy', data);
    }
  });
}