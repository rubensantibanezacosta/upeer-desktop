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
} from '../../storage/contacts/operations.js';
import { sendContactRequest, acceptContactRequest } from '../../network/messaging/contacts.js';
import { sendChatClear } from '../../network/messaging/chat.js';
import { computeScore, getDirectContactIds } from '../../security/reputation/vouches.js';

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
        } catch { /* ignore */ }
      }

      return {
        ...contact,
        knownAddresses: known,
        vouchScore: computeScore(contact.upeerId ?? '', directContactIds),
      };
    });
  });

  ipcMain.handle('add-contact', async (event, { address, name }) => {
    // Único formato válido: UPeerID@IP (separador @)
    const separator = '@';
    if (!address.includes(separator)) {
      return { success: false, error: 'Formato UPeerID@IP requerido. Usa ID@200:xxxx:xxxx:...' };
    }

    const [targetUpeerId, rawTargetIp] = address.split(separator);
    const targetIp = rawTargetIp.trim();

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
    return deleteContact(upeerId);
  });

  ipcMain.handle('clear-chat', async (event, { upeerId }) => {
    try {
      // 1. Limpieza local y persistencia del timestamp Anti-Zombi
      const now = Date.now();
      await deleteMessagesByChatId(upeerId, now);

      // 2. Propagación global: Sincroniza el vaciado con mis otros dispositivos y mis bóvedas
      // Esto asegura que si entro desde otro PC, el chat también se vea vacío.
      await sendChatClear(upeerId, now);

      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('block-contact', (event, { upeerId }) => blockContact(upeerId));
  ipcMain.handle('unblock-contact', (event, { upeerId }) => unblockContact(upeerId));
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