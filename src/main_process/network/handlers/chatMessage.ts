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
import type { RatchetHeader } from '../../security/ratchetShared.js';

type ChatSignedPreKeyBundle = {
    spkPub: string;
    spkSig: string;
    spkId: number;
};

type ChatX3dhInit = {
    ikPub: string;
    ekPub: string;
    spkId: number;
};

type ChatIncomingPayload = {
    id?: string;
    content: string;
    nonce?: string;
    ephemeralPublicKey?: string;
    replyTo?: string;
    x3dhInit?: ChatX3dhInit;
    ratchetHeader?: RatchetHeader;
    isInternalSync?: boolean;
    timestamp?: number;
    useRecipientEphemeral?: boolean;
};

type ChatContactRecord = {
    upeerId: string;
    publicKey?: string;
    name?: string;
    alias?: string;
};

type SaveMessageResult = {
    changes?: number;
} | undefined;

type AckPacket = {
    type: 'ACK';
    id?: string;
    status: 'delivered';
};

type DrResetPacket = {
    type: 'DR_RESET';
    signedPreKey: ChatSignedPreKeyBundle;
};

async function decryptDoubleRatchetContent(
    upeerId: string,
    data: ChatIncomingPayload,
    sendResponse: (ip: string, data: AckPacket | DrResetPacket) => void,
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
            const aliceIkPk = Buffer.from(ikPub, 'hex');
            const aliceEkPk = Buffer.from(ekPub, 'hex');
            const bobIkSk = getMyIdentitySkBuffer();
            const spkEntry = getSpkBySpkId(x3dhSpkId);

            if (!spkEntry) {
                error('X3DH: SPK no encontrado por ID', { x3dhSpkId, upeerId }, 'security');
                throw new Error('spk-not-found');
            }

            const sharedSecret = x3dhResponder(bobIkSk, spkEntry.spkSk, aliceIkPk, aliceEkPk);
            session = ratchetInitBob(sharedSecret, spkEntry.spkPk, spkEntry.spkSk);
            usedSpkId = x3dhSpkId;
            sharedSecret.fill(0);
        }

        if (!session) {
            sendResponse(fromAddress, { type: 'DR_RESET', signedPreKey: getMySignedPreKeyBundle() });
            warn('No DR session and no x3dhInit, sent DR_RESET', { upeerId }, 'security');
            return '🔒 [Sin sesión Double Ratchet]';
        }

        const ratchetHeader = data.ratchetHeader;
        if (!ratchetHeader) {
            throw new Error('ratchet-header-missing');
        }
        const nonce = data.nonce;
        if (!nonce) {
            throw new Error('nonce-missing');
        }

        const plaintext = ratchetDecrypt(session, ratchetHeader, data.content, nonce);
        if (plaintext) {
            saveRatchetSession(upeerId, session, usedSpkId);
            return plaintext.toString('utf-8');
        }

        if (data.x3dhInit) {
            const { ekPub, ikPub, spkId: x3dhSpkId } = data.x3dhInit;
            const spkEntry = getSpkBySpkId(x3dhSpkId);
            if (spkEntry) {
                const bobIkSk = getMyIdentitySkBuffer();
                const aliceIkPk = Buffer.from(ikPub, 'hex');
                const aliceEkPk = Buffer.from(ekPub, 'hex');
                const sharedSecret = x3dhResponder(bobIkSk, spkEntry.spkSk, aliceIkPk, aliceEkPk);
                const freshSession = ratchetInitBob(sharedSecret, spkEntry.spkPk, spkEntry.spkSk);
                sharedSecret.fill(0);
                const retry = ratchetDecrypt(freshSession, ratchetHeader, data.content, nonce);
                if (retry) {
                    saveRatchetSession(upeerId, freshSession, x3dhSpkId);
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

function decryptLegacyContent(data: ChatIncomingPayload, contact: ChatContactRecord): string {
    const nonce = data.nonce;
    if (!nonce) {
        throw new Error('nonce-missing');
    }

    const senderEphemeralKey = updateEphemeralKeyIfValid(contact.upeerId, data.ephemeralPublicKey);
    const senderKeyHex = senderEphemeralKey ?? contact.publicKey;
    if (!senderKeyHex) {
        throw new Error('La llave pública del remitente no está disponible');
    }

    const decrypted = decrypt(
        Buffer.from(nonce, 'hex'),
        Buffer.from(data.content, 'hex'),
        Buffer.from(senderKeyHex, 'hex')
    );
    const staticDecrypted = !decrypted && data.useRecipientEphemeral === false
        ? decryptWithIdentityKey(
            Buffer.from(nonce, 'hex'),
            Buffer.from(data.content, 'hex'),
            Buffer.from(senderKeyHex, 'hex')
        )
        : null;
    const resolvedDecrypted = decrypted ?? staticDecrypted;
    return resolvedDecrypted ? resolvedDecrypted.toString('utf-8') : '🔒 [Error de descifrado]';
}

export async function handleChatMessage(
    upeerId: string,
    contact: ChatContactRecord,
    data: ChatIncomingPayload,
    win: BrowserWindow | null,
    signature: string,
    fromAddress: string,
    sendResponse: (ip: string, data: AckPacket | DrResetPacket) => void
): Promise<void> {
    const myId = getMyUPeerId();
    const isInternalSync = Boolean(data.isInternalSync && upeerId === myId);
    const incomingId = isValidMessageId(data.id) ? data.id : undefined;

    if (isInternalSync && incomingId) {
        const existing = await getMessageById(incomingId);
        if (existing) return;
    }

    const msgId = incomingId ?? randomUUID();

    if (incomingId) {
        const collision = await getMessageById(incomingId);
        if (collision) {
            sendResponse(fromAddress, { type: 'ACK', id: incomingId, status: 'delivered' });
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
    const saveResult = saved as SaveMessageResult;
    const isNew = typeof saveResult?.changes === 'number' && saveResult.changes > 0;

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
        id: incomingId,
        status: 'delivered',
    });

    if (!isInternalSync && isNew) {
        issueVouch(upeerId, VouchType.HANDSHAKE).catch(err => warn('Failed to issue vouch', err, 'reputation'));
    }
}
