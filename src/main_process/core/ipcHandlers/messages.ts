import { ipcMain } from 'electron';
import { getMessages } from '../../storage/db.js';
import {
  sendUDPMessage,
  sendTypingIndicator,
  sendReadReceipt,
  sendContactCard,
  sendChatReaction,
  sendChatUpdate,
  sendChatDelete
} from '../../network/server/index.js';

/**
 * Registra los manejadores IPC relacionados con mensajes y chat
 */
export function registerMessageHandlers(): void {
  ipcMain.handle('get-messages', (event, upeerId) => getMessages(upeerId));

  ipcMain.handle('send-p2p-message', async (event, { upeerId, message, replyTo }) =>
    await sendUDPMessage(upeerId, message, replyTo)
  );

  ipcMain.handle('send-typing-indicator', (event, { upeerId }) => sendTypingIndicator(upeerId));

  ipcMain.handle('send-read-receipt', (event, { upeerId, id }) => sendReadReceipt(upeerId, id));

  ipcMain.handle('send-contact-card', (event, { targetUpeerId, contact }) =>
    sendContactCard(targetUpeerId, contact)
  );

  ipcMain.handle('send-chat-reaction', (event, { upeerId, msgId, emoji, remove }) =>
    sendChatReaction(upeerId, msgId, emoji, remove)
  );

  ipcMain.handle('send-chat-update', (event, { upeerId, msgId, newContent }) =>
    sendChatUpdate(upeerId, msgId, newContent)
  );

  ipcMain.handle('send-chat-delete', (event, { upeerId, msgId }) =>
    sendChatDelete(upeerId, msgId)
  );
}