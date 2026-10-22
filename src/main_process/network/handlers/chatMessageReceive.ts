import { randomUUID } from 'node:crypto';
import { BrowserWindow } from 'electron';
import { getMainWindow } from '../../core/windowManager.js';
import { showDesktopNotification } from '../../utils/desktopNotification.js';
import { focusWindow } from '../../utils/windowFocus.js';
import { saveMessage, getMessageById } from '../../storage/messages/operations.js';
import { getMyUPeerId } from '../../security/identity.js';
import { issueVouch, VouchType } from '../../security/reputation/vouches.js';
import { decompressMessage } from '../../utils/messageCompression.js';
import { warn, info } from '../../security/secure-logger.js';
import { isValidMessageId } from './chatShared.js';
import { decryptDoubleRatchetContent, type DecryptedChatPayload } from './chatMessageDecrypt.js';
import { createDrResetPacket } from './drResetPacket.js';
import type { ChatAckPacket, ChatContactRecord, ChatDrResetPacket, ChatIncomingPayload } from './chatMessageTypes.js';

type SaveMessageResult = { changes?: number } | undefined;
type SendResponse = (ip: string, data: ChatAckPacket | ChatDrResetPacket) => void;

export async function receiveChatMessage(
    upeerId: string,
    contact: ChatContactRecord,
    data: ChatIncomingPayload,
    win: BrowserWindow | null,
    signature: string,
    fromAddress: string,
    sendResponse: SendResponse,
): Promise<void> {
    const myId = getMyUPeerId();
    const isInternalSync = Boolean(data.isInternalSync && upeerId === myId);
    const incomingId = isValidMessageId(data.id) ? data.id : undefined;

    const existingMessage = incomingId
        ? await getMessageById(incomingId) as (Awaited<ReturnType<typeof getMessageById>> & { chatUpeerId?: string; message?: string }) | undefined
        : undefined;

    if (existingMessage && isInternalSync) return;

    if (existingMessage) {
        if (existingMessage.chatUpeerId !== upeerId) {
            warn('Chat message ID collision across conversations', { upeerId, msgId: incomingId }, 'security');
            return;
        }
        if (!data.ratchetHeader) {
            sendResponse(fromAddress, { type: 'ACK', id: incomingId, status: 'delivered' });
            return;
        }
    }

    const msgId = incomingId ?? randomUUID();
    let displayContent = data.content;
    const ratchetResult = data.ratchetHeader
        ? await decryptDoubleRatchetContent(upeerId, data, sendResponse, fromAddress, Boolean(existingMessage))
        : null;

    if (data.ratchetHeader) {
        if (!ratchetResult) {
            warn('Dropping chat message that could not be decrypted with Double Ratchet', { upeerId, msgId }, 'security');
            return;
        }
        if ('alreadyConsumed' in ratchetResult) {
            if (existingMessage && incomingId) {
                sendResponse(fromAddress, { type: 'ACK', id: incomingId, status: 'delivered' });
            }
            return;
        }
        displayContent = decompressMessage(ratchetResult.plaintext);
        if (incomingId && existingMessage) {
            if (existingMessage.message !== displayContent) {
                warn('Chat retry does not match its stored plaintext', { upeerId, msgId: incomingId }, 'security');
                return;
            }
            const { commitRatchetIncomingMessage } = await import('../../storage/ratchet/incomingMessageTransaction.js');
            commitRatchetIncomingMessage({
                id: incomingId as string,
                chatUpeerId: upeerId,
                isMine: Boolean(existingMessage.isMine),
                message: existingMessage.message ?? '',
                signature,
                status: 'delivered',
                senderUpeerId: upeerId,
                timestamp: data.timestamp,
            }, ratchetResult.session, ratchetResult.spkIdUsed);
            sendResponse(fromAddress, { type: 'ACK', id: incomingId, status: 'delivered' });
            return;
        }
    } else if (data.nonce) {
        sendResponse(fromAddress, createDrResetPacket('direct', { useDeviceIdentity: Boolean(data.senderDeviceId) }));
        warn('Dropping non-DR chat message', { upeerId, msgId }, 'security');
        return;
    }

    const saved = ratchetResult
        && !('alreadyConsumed' in ratchetResult)
        ? (await import('../../storage/ratchet/incomingMessageTransaction.js')).commitRatchetIncomingMessage({
            id: msgId,
            chatUpeerId: upeerId,
            isMine: isInternalSync,
            message: displayContent,
            replyTo: data.replyTo,
            signature,
            status: isInternalSync ? 'read' : 'delivered',
            senderUpeerId: isInternalSync ? myId : upeerId,
            timestamp: data.timestamp,
        }, (ratchetResult as DecryptedChatPayload).session, (ratchetResult as DecryptedChatPayload).spkIdUsed)
        : await saveMessage(msgId, upeerId, isInternalSync, displayContent, data.replyTo, signature,
            isInternalSync ? 'read' : 'delivered', isInternalSync ? myId : upeerId, data.timestamp);
    const changes = (saved as SaveMessageResult)?.changes;
    const isNew = typeof changes === 'number' && changes > 0;

    if (isNew) {
        win?.webContents.send('receive-p2p-message', {
            id: msgId,
            upeerId,
            isMine: isInternalSync,
            message: displayContent,
            replyTo: data.replyTo,
            status: isInternalSync ? 'read' : 'delivered',
            encrypted: !!data.nonce,
            timestamp: typeof data.timestamp === 'number' ? data.timestamp : Date.now(),
        });
        const notificationWindow = getMainWindow();
        if (!isInternalSync && notificationWindow && !notificationWindow.isFocused()) {
            const contactName = contact?.name || contact?.alias || upeerId.slice(0, 8);
            const body = displayContent.startsWith('🔒') ? 'Nuevo mensaje cifrado'
                : displayContent.length > 80 ? `${displayContent.slice(0, 77)}...` : displayContent;
            showDesktopNotification({
                title: contactName,
                body,
                onClick: () => {
                    info('[Notif] Click en notificación de chat', { upeerId }, 'notifications');
                    const currentWindow = getMainWindow();
                    if (!currentWindow) return;
                    focusWindow(currentWindow);
                    currentWindow.webContents.send('focus-conversation', { upeerId });
                },
            });
        }
    }

    if (existingMessage && incomingId) {
        sendResponse(fromAddress, { type: 'ACK', id: incomingId, status: 'delivered' });
        return;
    }

    sendResponse(fromAddress, { type: 'ACK', id: incomingId, status: 'delivered' });
    if (!isInternalSync && isNew) issueVouch(upeerId, VouchType.HANDSHAKE).catch(err => warn('Failed to issue vouch', err, 'reputation'));
}