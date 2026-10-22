import { BrowserWindow } from 'electron';
import {
    updateMessageStatus,
    updateMessageContent,
    deleteMessageLocally,
    getMessageById,
} from '../../storage/messages/operations.js';
import { deleteMessagesByChatId } from '../../storage/messages/operations.js';
import {
    saveReaction,
    deleteReaction,
} from '../../storage/messages/reactions.js';
import { getMyUPeerId } from '../../security/identity.js';
import type { RatchetHeader, X3DHInitPacket } from '../../security/ratchetShared.js';
import { warn, security } from '../../security/secure-logger.js';
import { clearPendingDirectMessage } from '../messaging/chatRetry.js';
import { isValidMessageId } from './chatShared.js';
import { decryptDoubleRatchetPayload } from './doubleRatchetDecrypt.js';
import { createDrResetPacket } from './drResetPacket.js';
import { ratchetSessionQueueKey, withRatchetSessionLock } from '../../security/ratchetSessionQueue.js';

type ChatEventMessageRecord = {
    id?: string;
    chatUpeerId: string;
    isMine: boolean | number;
    message?: string;
    version?: number | null;
};

type EditableChatPayload = {
    id?: string;
    msgId?: string;
    content?: string;
    newContent?: string;
    nonce?: string;
    x3dhInit?: X3DHInitPacket;
    ratchetHeader?: RatchetHeader;
    ephemeralPublicKey?: string;
    useRecipientEphemeral?: boolean;
    chatUpeerId?: string;
    isInternalSync?: boolean;
    version?: number;
    senderDeviceId?: string;
};

type ChatAckPayload = {
    id?: string;
    status?: 'sent' | 'delivered' | 'read' | 'failed' | 'vaulted';
};

type ChatClearPayload = {
    chatUpeerId?: string;
    clearTimestamp?: number;
    timestamp?: number;
    isInternalSync?: boolean;
};

type ChatDeletePayload = {
    id?: string;
    msgId?: string;
    chatUpeerId?: string;
    isInternalSync?: boolean;
    timestamp?: number;
};

type ChatReactionPayload = {
    id?: string;
    msgId?: string;
    chatUpeerId?: string;
    emoji?: string;
    reaction?: string;
    emojiToDelete?: string;
    remove?: boolean;
    isInternalSync?: boolean;
};

async function resolveEditedContent(upeerId: string, data: EditableChatPayload): Promise<string | null> {
    const newContent = data.newContent;
    if (typeof newContent === 'string') {
        return newContent;
    }

    if (typeof data.content === 'string' && !data.nonce) {
        return data.content;
    }

    if (!data.nonce || typeof data.content !== 'string') {
        return null;
    }

    if (data.ratchetHeader) {
        const doubleRatchetContent = await withRatchetSessionLock(ratchetSessionQueueKey(upeerId), () =>
            decryptDoubleRatchetPayload(upeerId, data));
        if (doubleRatchetContent) {
            return doubleRatchetContent;
        }
    }

    warn('Dropping non-DR chat update payload', { upeerId }, 'security');
    return null;
}

export async function handleChatAck(
    upeerId: string,
    data: ChatAckPayload,
    win: BrowserWindow | null
): Promise<void> {
    if (!isValidMessageId(data.id)) return;
    const messageId = data.id as string;
    const msg = (await getMessageById(messageId)) as ChatEventMessageRecord | undefined;
    if (msg && msg.chatUpeerId === upeerId && msg.isMine) {
        clearPendingDirectMessage(messageId);
        updateMessageStatus(messageId, data.status || 'delivered');
        win?.webContents.send('message-status-updated', {
            id: messageId,
            status: data.status || 'delivered',
        });
    }
}

export async function handleChatClear(
    upeerId: string,
    data: ChatClearPayload,
    win: BrowserWindow | null
): Promise<void> {
    const myId = getMyUPeerId();
    const isInternalSync = Boolean(data.isInternalSync && upeerId === myId);

    // BUG SEGURIDAD: verificar que quien solicita el borrado es el propietario
    // del chat o es una sincronización interna. Sin esto, cualquier contacto
    // puede borrar nuestro historial completo de chat.
    const targetChat = isInternalSync && data.chatUpeerId ? data.chatUpeerId : upeerId;
    if (!isInternalSync && targetChat !== upeerId) {
        security('Chat clear from non-owner rejected', { from: upeerId, targetChat }, 'security');
        return;
    }

    const chatUpeerId = targetChat;
    deleteMessagesByChatId(chatUpeerId, data.clearTimestamp ?? data.timestamp);
    win?.webContents.send('chat-cleared', { upeerId: chatUpeerId });
}

export async function handleChatEdit(
    upeerId: string,
    data: EditableChatPayload,
    win: BrowserWindow | null,
    signature: string,
    fromAddress?: string,
    sendResponse?: (ip: string, data: Record<string, unknown>) => void,
): Promise<void> {
    const msgId = data.msgId || data.id;
    if (!isValidMessageId(msgId)) return;
    const messageId = msgId as string;

    const chatUpeerId = data.chatUpeerId || upeerId;
    const myId = getMyUPeerId();
    const isInternalSync = Boolean(data.isInternalSync && upeerId === myId);
    const msg = (await getMessageById(messageId)) as ChatEventMessageRecord | undefined;
    if (!msg || msg.chatUpeerId !== chatUpeerId || (msg.isMine && !isInternalSync)) return;
    if (data.version !== undefined && data.version <= (msg.version ?? 0)) {
        warn('Stale CHAT_UPDATE ignored', { upeerId, messageId, version: data.version }, 'security');
        return;
    }

    await withRatchetSessionLock(ratchetSessionQueueKey(upeerId), async () => {
        const newContent = data.ratchetHeader
            ? await decryptDoubleRatchetPayload(upeerId, data, async (reset) => {
                if (!fromAddress || !sendResponse) return;
                sendResponse(fromAddress, reset);
            })
            : await resolveEditedContent(upeerId, data);
        if (!data.ratchetHeader && data.nonce && fromAddress && sendResponse) {
            sendResponse(fromAddress, createDrResetPacket('direct', { useDeviceIdentity: Boolean(data.senderDeviceId) }));
        }
        if (typeof newContent !== 'string') return;

        updateMessageContent(messageId, newContent, signature, data.version);
        win?.webContents.send('message-updated', {
            id: messageId,
            upeerId,
            chatUpeerId,
            content: newContent,
            signature,
        });
    });
}

export async function handleReadReceipt(
    upeerId: string,
    data: ChatAckPayload,
    win: BrowserWindow | null
): Promise<void> {
    if (!isValidMessageId(data.id)) return;
    const messageId = data.id as string;
    const msg = (await getMessageById(messageId)) as ChatEventMessageRecord | undefined;
    if (!msg || msg.chatUpeerId !== upeerId || !msg.isMine) return;

    updateMessageStatus(messageId, 'read');
    win?.webContents.send('message-status-updated', {
        id: messageId,
        status: 'read',
    });
}

export async function handleChatDelete(
    upeerId: string,
    data: ChatDeletePayload,
    win: BrowserWindow | null
): Promise<void> {
    const msgId = data.msgId || data.id;
    if (!isValidMessageId(msgId)) return;
    const messageId = msgId as string;

    const chatUpeerId = data.chatUpeerId || upeerId;
    const myId = getMyUPeerId();
    const isInternalSync = Boolean(data.isInternalSync && upeerId === myId);

    // BUG SEGURIDAD: verificar que el mensaje pertenece al chat del remitente
    // o viene de una sincronización interna. Sin esto un contacto podría borrar
    // mensajes en chats ajenos si conoce el msgId.
    const msg = (await getMessageById(messageId)) as ChatEventMessageRecord | undefined;
    if (!msg || msg.chatUpeerId !== chatUpeerId || (msg.isMine && !isInternalSync)) return;
    if (!isInternalSync && msg.chatUpeerId !== upeerId) {
        security('Chat delete from non-owner rejected', { from: upeerId, targetMsg: messageId, targetChat: chatUpeerId }, 'security');
        return;
    }

    const { extractLocalAttachmentInfo, cleanupLocalAttachmentFile } = await import('../../utils/localAttachmentCleanup.js');
    const attachment = typeof msg.message === 'string' ? extractLocalAttachmentInfo(msg.message) : null;
    if (attachment?.fileId) {
        const { fileTransferManager } = await import('../file-transfer/transfer-manager.js');
        fileTransferManager.cancelTransfer(attachment.fileId, 'message deleted');
    }

    await cleanupLocalAttachmentFile(attachment?.filePath);
    deleteMessageLocally(messageId, data.timestamp);
    win?.webContents.send('message-deleted', { id: messageId, upeerId, chatUpeerId });
}

export async function handleChatReaction(
    upeerId: string,
    data: ChatReactionPayload,
    win: BrowserWindow | null
): Promise<void> {
    const id = data.msgId || data.id;
    if (!isValidMessageId(id)) return;
    const messageId = id as string;
    const myId = getMyUPeerId();
    const msg = (await getMessageById(messageId)) as ChatEventMessageRecord | undefined;
    if (!msg) return;

    const isInternalSync = Boolean(data.isInternalSync && upeerId === myId);
    const chatUpeerId = isInternalSync
        ? (data.chatUpeerId || msg.chatUpeerId)
        : (data.chatUpeerId || upeerId);
    if (msg.chatUpeerId !== chatUpeerId) return;

    const isDelete = data.remove === true || Boolean(data.emojiToDelete);
    if (isDelete) {
        const emojiToRemove = data.emojiToDelete || data.emoji;
        if (typeof emojiToRemove !== 'string' || !emojiToRemove) return;
        const actorUpeerId = isInternalSync ? myId : upeerId;
        deleteReaction(messageId, actorUpeerId, emojiToRemove);
        win?.webContents.send('message-reaction-updated', {
            msgId: messageId,
            upeerId: actorUpeerId,
            chatUpeerId,
            emoji: emojiToRemove,
            remove: true,
        });
        return;
    }

    const emoji = data.emoji || data.reaction;
    if (typeof emoji !== 'string' || !emoji) return;
    const actorUpeerId = isInternalSync ? myId : upeerId;
    saveReaction(messageId, actorUpeerId, emoji);
    win?.webContents.send('message-reaction-updated', {
        msgId: messageId,
        upeerId: actorUpeerId,
        chatUpeerId,
        emoji,
        remove: false,
    });
}
