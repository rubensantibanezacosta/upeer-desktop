import { ipcMain } from 'electron';
import { getMessages, searchMessages, searchChatMessages, getMessagesAround, getFileHistory, getOlderMessages } from '../../storage/messages/operations.js';
import {
  sendChatMessage,
  sendTypingIndicator,
  sendReadReceipt,
  sendContactCard,
  sendChatReaction,
  sendChatUpdate,
  sendChatDelete
} from '../../network/messaging/chat.js';
import { markLocalActive } from '../../network/messaging/activity.js';

const SEARCH_LIMIT_DEFAULT = 25;
const SEARCH_LIMIT_MAX = 100;

const normalizeSearchLimit = (limit: unknown): number => typeof limit === 'number' && Number.isFinite(limit)
  ? Math.min(Math.max(Math.trunc(limit), 1), SEARCH_LIMIT_MAX)
  : SEARCH_LIMIT_DEFAULT;

const normalizeSearchOffset = (offset: unknown): number => typeof offset === 'number' && Number.isFinite(offset)
  ? Math.max(Math.trunc(offset), 0)
  : 0;

/**
 * Registra los manejadores IPC relacionados con mensajes y chat
 */
export function registerMessageHandlers(): void {
  ipcMain.handle('get-messages', (_event, upeerId) => getMessages(upeerId));
  ipcMain.handle('search-messages', (_event, { query, limit, offset }) =>
    searchMessages(typeof query === 'string' ? query : '', normalizeSearchLimit(limit), normalizeSearchOffset(offset)));
  ipcMain.handle('search-chat-messages', (_event, { chatUpeerId, query, limit, offset, from, to }) =>
    searchChatMessages(
      typeof chatUpeerId === 'string' ? chatUpeerId : '',
      typeof query === 'string' ? query : '',
      normalizeSearchLimit(limit),
      normalizeSearchOffset(offset),
      typeof from === 'number' && Number.isFinite(from) ? from : undefined,
      typeof to === 'number' && Number.isFinite(to) ? to : undefined));
  ipcMain.handle('get-messages-around', (_event, { chatUpeerId, targetMsgId }) => getMessagesAround(chatUpeerId, targetMsgId));
  ipcMain.handle('get-older-messages', (_event, { chatUpeerId, beforeTimestamp, limit }) =>
    getOlderMessages(chatUpeerId, typeof beforeTimestamp === 'number' ? beforeTimestamp : Date.now(), typeof limit === 'number' ? Math.min(Math.max(limit, 1), 200) : 50));
  ipcMain.handle('get-file-history', (_event, { limit }) => getFileHistory(typeof limit === 'number' ? Math.min(Math.max(limit, 1), 500) : 200));

  ipcMain.handle('send-p2p-message', async (_event, { upeerId, message, replyTo, linkPreview, messageId }) =>
    await sendChatMessage(upeerId, { content: message, linkPreview }, replyTo, messageId)
  );

  ipcMain.handle('send-typing-indicator', (_event, { upeerId, state }) => sendTypingIndicator(upeerId, state));
  ipcMain.handle('mark-user-active', () => markLocalActive());

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
