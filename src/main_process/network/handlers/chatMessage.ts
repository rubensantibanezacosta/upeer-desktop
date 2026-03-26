import { randomUUID } from 'node:crypto';
import { BrowserWindow } from 'electron';
import { getMainWindow } from '../../core/windowManager.js';
import { showDesktopNotification } from '../../utils/desktopNotification.js';
import { focusWindow } from '../../utils/windowFocus.js';
import {
    saveMessage,
    getMessageById,
} from '../../storage/messages/operations.js';
import {
    decrypt,
    decryptWithIdentityKey,
    getMyUPeerId,
} from '../../security/identity.js';
import { issueVouch, VouchType } from '../../security/reputation/vouches.js';
import { error, warn, info } from '../../security/secure-logger.js';
import { isValidMessageId, updateEphemeralKeyIfValid } from './chatShared.js';

async function decryptDoubleRatchetContent(
    upeerId: string,
    data: any,
    sendResponse: (ip: string, data: any) => void,
    fromAddress: string
): Promise<string> {
    const { getMySignedPreKeyBundle } = await import('../../security/identity.js');

    try {
        const { getRatchetSession, saveRatchetSession, deleteRatchetSession } = await import('../../storage/ratchet/operations.js');
        const { x3dhResponder, ratchetInitBob, ratchetDecrypt } = await import('../../security/ratchet.js');
        const { getMyIdentitySkBuffer, getSpkBySpkId } = await import('../../security/identity.js');

        const sessionResult = getRatchetSession(upeerId);
        let session = sessionResult?.state;
        let usedSpkId = sessionResult?.spkIdUsed;

        if (!session && data.x3dhInit) {
            const { ekPub, ikPub, spkId: x3dhSpkId } = data.x3dhInit;
            const aliceIkPk = Buffer.from(ikPub as string, 'hex');
            const aliceEkPk = Buffer.from(ekPub as string, 'hex');
            const bobIkSk = getMyIdentitySkBuffer();
            const spkEntry = getSpkBySpkId(x3dhSpkId as number);

            if (!spkEntry) {
                error('X3DH: SPK no encontrado por ID', { x3dhSpkId, upeerId }, 'security');
                throw new Error('spk-not-found');
            }

            const sharedSecret = x3dhResponder(bobIkSk, spkEntry.spkSk, aliceIkPk, aliceEkPk);
            session = ratchetInitBob(sharedSecret, spkEntry.spkPk, spkEntry.spkSk);
            usedSpkId = x3dhSpkId as number;
            sharedSecret.fill(0);
        }

        if (!session) {
            sendResponse(fromAddress, { type: 'DR_RESET', signedPreKey: getMySignedPreKeyBundle() });
            warn('No DR session and no x3dhInit, sent DR_RESET', { upeerId }, 'security');
            return '🔒 [Sin sesión Double Ratchet]';
        }

        const plaintext = ratchetDecrypt(session, data.ratchetHeader, data.content, data.nonce);
        if (plaintext) {
            saveRatchetSession(upeerId, session, usedSpkId);
            return plaintext.toString('utf-8');
        }

        if (data.x3dhInit) {
            const { ekPub, ikPub, spkId: x3dhSpkId } = data.x3dhInit;
            const spkEntry = getSpkBySpkId(x3dhSpkId as number);
            if (spkEntry) {
                const bobIkSk = getMyIdentitySkBuffer();
                const aliceIkPk = Buffer.from(ikPub as string, 'hex');
                const aliceEkPk = Buffer.from(ekPub as string, 'hex');
                const sharedSecret = x3dhResponder(bobIkSk, spkEntry.spkSk, aliceIkPk, aliceEkPk);
                const freshSession = ratchetInitBob(sharedSecret, spkEntry.spkPk, spkEntry.spkSk);
                sharedSecret.fill(0);
                const retry = ratchetDecrypt(freshSession, data.ratchetHeader, data.content, data.nonce);
                if (retry) {
                    saveRatchetSession(upeerId, freshSession, x3dhSpkId as number);
                    info('DR race resolved: replaced stale Alice session with Bob session', { upeerId }, 'security');
                    return retry.toString('utf-8');
                }
            }
            deleteRatchetSession(upeerId);
            sendResponse(fromAddress, { type: 'DR_RESET', signedPreKey: getMySignedPreKeyBundle() });
            error('Double Ratchet decrypt returned null after x3dh retry', { upeerId }, 'security');
            return '🔒 [Error de descifrado DR]';
        }

        deleteRatchetSession(upeerId);
        sendResponse(fromAddress, { type: 'DR_RESET', signedPreKey: getMySignedPreKeyBundle() });
        error('Double Ratchet decrypt returned null', { upeerId }, 'security');
        return '🔒 [Error de descifrado DR]';
    } catch (err) {
        const { deleteRatchetSession } = await import('../../storage/ratchet/operations.js');
        deleteRatchetSession(upeerId);
        sendResponse(fromAddress, { type: 'DR_RESET', signedPreKey: getMySignedPreKeyBundle() });
        error('Double Ratchet decrypt failed, sent DR_RESET', err, 'security');
        return '🔒 [Error crítico DR]';
    }
}

function decryptLegacyContent(data: any, contact: any): string {
    const senderEphemeralKey = updateEphemeralKeyIfValid(contact.upeerId, data.ephemeralPublicKey);
    const senderKeyHex = senderEphemeralKey ?? contact.publicKey;
    if (!senderKeyHex) {
        throw new Error('La llave pública del remitente no está disponible');
    }

    const decrypted = decrypt(
        Buffer.from(data.nonce, 'hex'),
        Buffer.from(data.content, 'hex'),
        Buffer.from(senderKeyHex, 'hex')
    );
    const staticDecrypted = !decrypted && data.useRecipientEphemeral === false
        ? decryptWithIdentityKey(
            Buffer.from(data.nonce, 'hex'),
            Buffer.from(data.content, 'hex'),
            Buffer.from(senderKeyHex, 'hex')
        )
        : null;
    const resolvedDecrypted = decrypted ?? staticDecrypted;
    return resolvedDecrypted ? resolvedDecrypted.toString('utf-8') : '🔒 [Error de descifrado]';
}

export async function handleChatMessage(
    upeerId: string,
    contact: any,
    data: any,
    win: BrowserWindow | null,
    signature: any,
    fromAddress: string,
    sendResponse: (ip: string, data: any) => void
): Promise<void> {
    const myId = getMyUPeerId();
    const isInternalSync = Boolean(data.isInternalSync && upeerId === myId);
    if (isInternalSync) {
        const existing = await getMessageById(data.id);
        if (existing) return;
    }

    const msgId = isValidMessageId(data.id) ? data.id : randomUUID();

    if (isValidMessageId(data.id)) {
        const collision = await getMessageById(data.id);
        if (collision) {
            sendResponse(fromAddress, { type: 'ACK', id: data.id, status: 'delivered' });
            return;
        }
    }

    updateEphemeralKeyIfValid(upeerId, data.ephemeralPublicKey);

    let displayContent = data.content;
    if (data.ratchetHeader) {
        displayContent = await decryptDoubleRatchetContent(upeerId, data, sendResponse, fromAddress);
    } else if (data.nonce) {
        try {
            displayContent = decryptLegacyContent(data, { ...contact, upeerId });
        } catch (err) {
            displayContent = '🔒 [Error crítico de seguridad]';
            error('Decryption failed', err, 'security');
        }
    }

    const saved = await saveMessage(
        msgId,
        upeerId,
        isInternalSync,
        displayContent,
        data.replyTo,
        signature,
        isInternalSync ? 'read' : 'delivered',
        isInternalSync ? myId : upeerId,
        data.timestamp
    );
    const isNew = (saved as any)?.changes > 0;

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

        const notifWin = getMainWindow();
        if (!isInternalSync && notifWin && !notifWin.isFocused()) {
            const contactName = contact?.name || contact?.alias || upeerId.slice(0, 8);
            const body = displayContent.startsWith('🔒')
                ? 'Nuevo mensaje cifrado'
                : displayContent.length > 80 ? `${displayContent.slice(0, 77)}...` : displayContent;
            showDesktopNotification({
                title: contactName,
                body,
                onClick: () => {
                    info('[Notif] Click en notificación de chat', { upeerId }, 'notifications');
                    const currentWin = getMainWindow();
                    if (!currentWin) return;
                    focusWindow(currentWin);
                    currentWin.webContents.send('focus-conversation', { upeerId });
                },
            });
        }
    }

    sendResponse(fromAddress, {
        type: 'ACK',
        id: data.id,
        status: 'delivered',
    });

    if (!isInternalSync && isNew) {
        issueVouch(upeerId, VouchType.HANDSHAKE).catch(err => warn('Failed to issue vouch', err, 'reputation'));
    }
}
