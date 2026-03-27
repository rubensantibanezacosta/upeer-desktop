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
import { getContactByUpeerId } from '../../storage/contacts/operations.js';
import {
    decrypt,
    decryptWithIdentityKey,
    getMyUPeerId,
} from '../../security/identity.js';
import { warn } from '../../security/secure-logger.js';
import { isValidMessageId, updateEphemeralKeyIfValid } from './chatShared.js';

type ChatEventMessageRecord = {
    id?: string;
    chatUpeerId: string;
    isMine: boolean | number;
    message?: string;
};

type StoredChatContact = {
    publicKey?: string;
    ephemeralPublicKey?: string;
};

type EditableChatPayload = {
    id?: string;
    msgId?: string;
    content?: string;
    newContent?: string;
    nonce?: string;
    ephemeralPublicKey?: string;
    useRecipientEphemeral?: boolean;
    chatUpeerId?: string;
    isInternalSync?: boolean;
    version?: number;
};

type ChatAckPayload = {
    id?: string;
    status?: 'sent' | 'delivered' | 'read' | 'failed' | 'vaulted';
};

type ChatClearPayload = {
    chatUpeerId?: string;
    clearTimestamp?: number;
    timestamp?: number;
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

    try {
        const contact = (await getContactByUpeerId(upeerId)) as StoredChatContact | undefined;
        const senderEphemeralKey = updateEphemeralKeyIfValid(upeerId, data.ephemeralPublicKey);
        const decryptKeyHex = senderEphemeralKey ?? contact?.ephemeralPublicKey ?? contact?.publicKey;
        if (!decryptKeyHex) {
            return null;
        }

        const decrypted = decrypt(
            Buffer.from(data.nonce, 'hex'),
            Buffer.from(data.content, 'hex'),
            Buffer.from(decryptKeyHex, 'hex')
        );
        const staticDecrypted = !decrypted && data.useRecipientEphemeral === false
            ? decryptWithIdentityKey(
                Buffer.from(data.nonce, 'hex'),
                Buffer.from(data.content, 'hex'),
                Buffer.from(decryptKeyHex, 'hex')
            )
            : null;
        const resolved = decrypted ?? staticDecrypted;
        return resolved ? resolved.toString('utf-8') : null;
    } catch (err) {
        warn('Failed to decrypt chat edit payload', { upeerId, err: String(err) }, 'security');
        return null;
    }
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
    const chatUpeerId = data.chatUpeerId || upeerId;
    deleteMessagesByChatId(chatUpeerId, data.clearTimestamp ?? data.timestamp);
    win?.webContents.send('chat-cleared', { upeerId: chatUpeerId });
}

export async function handleChatEdit(
    upeerId: string,
    data: EditableChatPayload,
    win: BrowserWindow | null,
    signature: string
): Promise<void> {
    const msgId = data.msgId || data.id;
    if (!isValidMessageId(msgId)) return;
    const messageId = msgId as string;

    const chatUpeerId = data.chatUpeerId || upeerId;
    const myId = getMyUPeerId();
    const isInternalSync = Boolean(data.isInternalSync && upeerId === myId);
    const msg = (await getMessageById(messageId)) as ChatEventMessageRecord | undefined;
    if (!msg || msg.chatUpeerId !== chatUpeerId || (msg.isMine && !isInternalSync)) return;

    const newContent = await resolveEditedContent(upeerId, data);
    if (typeof newContent !== 'string') return;

    updateMessageContent(messageId, newContent, signature, data.version);
    win?.webContents.send('message-updated', {
        id: messageId,
        upeerId,
        chatUpeerId,
        content: newContent,
        signature,
    });
}

export async function handleReadReceipt(
    _upeerId: string,
    data: ChatAckPayload,
    win: BrowserWindow | null
): Promise<void> {
    if (!isValidMessageId(data.id)) return;
    const messageId = data.id as string;
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
    const msg = (await getMessageById(messageId)) as ChatEventMessageRecord | undefined;
    if (!msg || msg.chatUpeerId !== chatUpeerId || (msg.isMine && !isInternalSync)) return;

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

    const isDelete = data.remove === true || Boolean(data.emojiToDelete);
    if (isDelete) {
        const emojiToRemove = data.emojiToDelete || data.emoji;
        if (typeof emojiToRemove !== 'string' || !emojiToRemove) return;
        deleteReaction(messageId, upeerId, emojiToRemove);
        win?.webContents.send('message-reaction-updated', {
            msgId: messageId,
            upeerId,
            chatUpeerId: data.chatUpeerId || upeerId,
            emoji: emojiToRemove,
            remove: true,
        });
        return;
    }

    const emoji = data.emoji || data.reaction;
    if (typeof emoji !== 'string' || !emoji) return;
    saveReaction(messageId, upeerId, emoji);
    win?.webContents.send('message-reaction-updated', {
        msgId: messageId,
        upeerId,
        chatUpeerId: data.chatUpeerId || upeerId,
        emoji,
        remove: false,
    });
}
