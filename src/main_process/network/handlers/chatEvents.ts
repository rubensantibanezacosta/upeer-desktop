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

async function resolveEditedContent(upeerId: string, data: any): Promise<string | null> {
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
        const contact = await getContactByUpeerId(upeerId);
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
    data: any,
    win: BrowserWindow | null
): Promise<void> {
    if (!isValidMessageId(data.id)) return;
    const msg = (await getMessageById(data.id)) as any;
    if (msg && msg.chatUpeerId === upeerId && msg.isMine) {
        updateMessageStatus(data.id, data.status || 'delivered');
        win?.webContents.send('message-status-updated', {
            id: data.id,
            status: data.status || 'delivered',
        });
    }
}

export async function handleChatClear(
    upeerId: string,
    data: any,
    win: BrowserWindow | null
): Promise<void> {
    const chatUpeerId = data.chatUpeerId || upeerId;
    deleteMessagesByChatId(chatUpeerId, data.clearTimestamp ?? data.timestamp);
    win?.webContents.send('chat-cleared', { upeerId: chatUpeerId });
}

export async function handleChatEdit(
    upeerId: string,
    data: any,
    win: BrowserWindow | null,
    signature: string
): Promise<void> {
    const msgId = data.msgId || data.id;
    if (!isValidMessageId(msgId)) return;

    const chatUpeerId = data.chatUpeerId || upeerId;
    const myId = getMyUPeerId();
    const isInternalSync = Boolean(data.isInternalSync && upeerId === myId);
    const msg = (await getMessageById(msgId)) as any;
    if (!msg || msg.chatUpeerId !== chatUpeerId || (msg.isMine && !isInternalSync)) return;

    const newContent = await resolveEditedContent(upeerId, data);
    if (typeof newContent !== 'string') return;

    updateMessageContent(msgId, newContent, signature, data.version);
    win?.webContents.send('message-updated', {
        id: msgId,
        upeerId,
        chatUpeerId,
        content: newContent,
        signature,
    });
}

export async function handleReadReceipt(
    _upeerId: string,
    data: any,
    win: BrowserWindow | null
): Promise<void> {
    if (!isValidMessageId(data.id)) return;
    updateMessageStatus(data.id, 'read');
    win?.webContents.send('message-status-updated', {
        id: data.id,
        status: 'read',
    });
}

export async function handleChatDelete(
    upeerId: string,
    data: any,
    win: BrowserWindow | null
): Promise<void> {
    const msgId = data.msgId || data.id;
    if (!isValidMessageId(msgId)) return;

    const chatUpeerId = data.chatUpeerId || upeerId;
    const myId = getMyUPeerId();
    const isInternalSync = Boolean(data.isInternalSync && upeerId === myId);
    const msg = (await getMessageById(msgId)) as any;
    if (!msg || msg.chatUpeerId !== chatUpeerId || (msg.isMine && !isInternalSync)) return;

    const { extractLocalAttachmentInfo, cleanupLocalAttachmentFile } = await import('../../utils/localAttachmentCleanup.js');
    const attachment = extractLocalAttachmentInfo(msg.message);
    if (attachment?.fileId) {
        const { fileTransferManager } = await import('../file-transfer/transfer-manager.js');
        fileTransferManager.cancelTransfer(attachment.fileId, 'message deleted');
    }

    await cleanupLocalAttachmentFile(attachment?.filePath);
    deleteMessageLocally(msgId, data.timestamp);
    win?.webContents.send('message-deleted', { id: msgId, upeerId, chatUpeerId });
}

export async function handleChatReaction(
    upeerId: string,
    data: any,
    win: BrowserWindow | null
): Promise<void> {
    const id = data.msgId || data.id;
    if (!isValidMessageId(id)) return;

    const isDelete = data.remove === true || Boolean(data.emojiToDelete);
    if (isDelete) {
        const emojiToRemove = data.emojiToDelete || data.emoji;
        if (typeof emojiToRemove !== 'string' || !emojiToRemove) return;
        deleteReaction(id, upeerId, emojiToRemove);
        win?.webContents.send('message-reaction-updated', {
            msgId: id,
            upeerId,
            chatUpeerId: data.chatUpeerId || upeerId,
            emoji: emojiToRemove,
            remove: true,
        });
        return;
    }

    const emoji = data.emoji || data.reaction;
    if (typeof emoji !== 'string' || !emoji) return;
    saveReaction(id, upeerId, emoji);
    win?.webContents.send('message-reaction-updated', {
        msgId: id,
        upeerId,
        chatUpeerId: data.chatUpeerId || upeerId,
        emoji,
        remove: false,
    });
}
