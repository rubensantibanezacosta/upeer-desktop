import { ipcMain } from 'electron';
import { getMessages, searchMessages, getMessagesAround, getFileHistory, getOlderMessages } from '../../storage/messages/operations.js';
import {
  sendUDPMessage,
  sendTypingIndicator,
  sendReadReceipt,
  sendContactCard,
  sendChatReaction,
  sendChatUpdate,
  sendChatDelete
} from '../../network/messaging/chat.js';

/**
 * Registra los manejadores IPC relacionados con mensajes y chat
 */
export function registerMessageHandlers(): void {
  ipcMain.handle('get-messages', (_event, upeerId) => getMessages(upeerId));
  ipcMain.handle('search-messages', (_event, { query }) => searchMessages(query));
  ipcMain.handle('get-messages-around', (_event, { chatUpeerId, targetMsgId }) => getMessagesAround(chatUpeerId, targetMsgId));
  ipcMain.handle('get-older-messages', (_event, { chatUpeerId, beforeTimestamp, limit }) =>
    getOlderMessages(chatUpeerId, typeof beforeTimestamp === 'number' ? beforeTimestamp : Date.now(), typeof limit === 'number' ? Math.min(Math.max(limit, 1), 200) : 50));
  ipcMain.handle('get-file-history', (_event, { limit }) => getFileHistory(typeof limit === 'number' ? Math.min(Math.max(limit, 1), 500) : 200));

  ipcMain.handle('send-p2p-message', async (_event, { upeerId, message, replyTo, linkPreview, messageId }) =>
    await sendUDPMessage(upeerId, { content: message, linkPreview }, replyTo, messageId)
  );

  ipcMain.handle('send-typing-indicator', (_event, { upeerId }) => sendTypingIndicator(upeerId));

  ipcMain.handle('send-read-receipt', (_event, { upeerId, id }) => sendReadReceipt(upeerId, id));

  ipcMain.handle('send-contact-card', (_event, { targetUpeerId, contact }) =>
    sendContactCard(targetUpeerId, contact)
  );

  ipcMain.handle('send-chat-reaction', (_event, { upeerId, msgId, emoji, remove }) =>
    sendChatReaction(upeerId, msgId, emoji, remove)
  );

  ipcMain.handle('send-chat-update', (_event, { upeerId, msgId, newContent, linkPreview }) =>
    sendChatUpdate(upeerId, msgId, newContent, linkPreview)
  );

  ipcMain.handle('send-chat-delete', (_event, { upeerId, msgId }) =>
    sendChatDelete(upeerId, msgId)
  );
}
