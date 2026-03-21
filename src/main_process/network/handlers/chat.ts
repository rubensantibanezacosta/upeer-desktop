import { randomUUID } from 'node:crypto';
import { BrowserWindow, Notification as ElectronNotification, app } from 'electron';
import { getMainWindow } from '../../core/windowManager.js';
import {
    saveMessage,
    updateMessageStatus,
    updateMessageContent,
    deleteMessageLocally,
    getMessageById,
} from '../../storage/messages/operations.js';
import {
    saveReaction,
    deleteReaction,
} from '../../storage/messages/reactions.js';
import {
    updateContactEphemeralPublicKey,
} from '../../storage/contacts/keys.js';
import {
    decrypt,
    getMyUPeerId,
} from '../../security/identity.js';
import { issueVouch, VouchType } from '../../security/reputation/vouches.js';
import { error, warn, info } from '../../security/secure-logger.js';

const _UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function handleChatMessage(
    upeerId: string,
    contact: any,
    data: any,
    win: BrowserWindow | null,
    signature: any,
    fromAddress: string,
    sendResponse: (ip: string, data: any) => void
) {
    const myId = getMyUPeerId();
    if (data.isInternalSync && upeerId === myId) {
        const existing = await getMessageById(data.id);
        if (existing) return;
    }

    const msgId = (data.id && _UUID_RE.test(String(data.id))) ? data.id : randomUUID();

    if (data.id && _UUID_RE.test(String(data.id))) {
        const collision = await getMessageById(data.id);
        if (collision) {
            sendResponse(fromAddress, { type: 'CHAT_ACK', id: data.id, status: 'delivered' });
            return;
        }
    }

    if (data.ephemeralPublicKey && typeof data.ephemeralPublicKey === 'string' && /^[0-9a-f]{64}$/i.test(data.ephemeralPublicKey)) {
        updateContactEphemeralPublicKey(upeerId, data.ephemeralPublicKey);
    }

    let displayContent = data.content;
    if (data.ratchetHeader) {
        const { getMySignedPreKeyBundle: _getSpk } = await import('../../security/identity.js');
        try {
            const { getRatchetSession, saveRatchetSession } = await import('../../storage/ratchet/operations.js');
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
                const { spkPk: bobSpkPk, spkSk: bobSpkSk } = spkEntry;

                const sharedSecret = x3dhResponder(bobIkSk, bobSpkSk, aliceIkPk, aliceEkPk);
                session = ratchetInitBob(sharedSecret, bobSpkPk, bobSpkSk);
                usedSpkId = x3dhSpkId as number;
                sharedSecret.fill(0);
            }

            if (session) {
                const plaintext = ratchetDecrypt(session, data.ratchetHeader, data.content, data.nonce);
                if (plaintext) {
                    saveRatchetSession(upeerId, session, usedSpkId);
                    displayContent = plaintext.toString('utf-8');
                } else if (data.x3dhInit) {
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
                            displayContent = retry.toString('utf-8');
                            info('DR race resolved: replaced stale Alice session with Bob session', { upeerId }, 'security');
                        } else {
                            const { deleteRatchetSession } = await import('../../storage/ratchet/operations.js');
                            deleteRatchetSession(upeerId);
                            sendResponse(fromAddress, { type: 'DR_RESET', signedPreKey: _getSpk() });
                            displayContent = '🔒 [Error de descifrado DR]';
                            error('Double Ratchet decrypt returned null after x3dh retry', { upeerId }, 'security');
                        }
                    } else {
                        const { deleteRatchetSession } = await import('../../storage/ratchet/operations.js');
                        deleteRatchetSession(upeerId);
                        sendResponse(fromAddress, { type: 'DR_RESET', signedPreKey: _getSpk() });
                        displayContent = '🔒 [Error de descifrado DR]';
                        error('Double Ratchet decrypt null, x3dh SPK not found', { upeerId }, 'security');
                    }
                } else {
                    const { deleteRatchetSession } = await import('../../storage/ratchet/operations.js');
                    deleteRatchetSession(upeerId);
                    sendResponse(fromAddress, { type: 'DR_RESET', signedPreKey: _getSpk() });
                    displayContent = '🔒 [Error de descifrado DR]';
                    error('Double Ratchet decrypt returned null', { upeerId }, 'security');
                }
            } else {
                sendResponse(fromAddress, { type: 'DR_RESET', signedPreKey: _getSpk() });
                displayContent = '🔒 [Sin sesión Double Ratchet]';
                warn('No DR session and no x3dhInit, sent DR_RESET', { upeerId }, 'security');
            }
        } catch (err) {
            const { deleteRatchetSession } = await import('../../storage/ratchet/operations.js');
            deleteRatchetSession(upeerId);
            sendResponse(fromAddress, { type: 'DR_RESET', signedPreKey: _getSpk() });
            displayContent = '🔒 [Error crítico DR]';
            error('Double Ratchet decrypt failed, sent DR_RESET', err, 'security');
        }
    } else if (data.nonce) {
        try {
            const senderKeyHex = data.useRecipientEphemeral ? data.ephemeralPublicKey : contact.publicKey;
            if (!senderKeyHex) throw new Error("La llave pública del remitente no está disponible");

            const decrypted = decrypt(
                Buffer.from(data.nonce, 'hex'),
                Buffer.from(data.content, 'hex'),
                Buffer.from(senderKeyHex, 'hex')
            );
            if (decrypted) {
                displayContent = decrypted.toString('utf-8');
            } else {
                displayContent = "🔒 [Error de descifrado]";
            }
        } catch (err) {
            displayContent = "🔒 [Error crítico de seguridad]";
            error('Decryption failed', err, 'security');
        }
    }

    const saved = await saveMessage(msgId, upeerId, false, displayContent, data.replyTo, signature, 'delivered', upeerId, data.timestamp);
    const isNew = (saved as any)?.changes > 0;

    if (isNew) {
        win?.webContents.send('receive-p2p-message', {
            id: msgId,
            upeerId: upeerId,
            isMine: false,
            message: displayContent,
            replyTo: data.replyTo,
            status: 'delivered',
            encrypted: !!data.nonce
        });

        const notifWin = getMainWindow();
        if (notifWin && !notifWin.isFocused() && ElectronNotification.isSupported()) {
            const contactName = contact?.name || contact?.alias || upeerId.slice(0, 8);
            const body = displayContent.startsWith('\uD83D\uDD12')
                ? 'Nuevo mensaje cifrado'
                : displayContent.length > 80 ? displayContent.slice(0, 77) + '...' : displayContent;
            const notif = new ElectronNotification({ title: contactName, body });
            notif.on('click', () => {
                info('[Notif] Click en notificación de chat', { upeerId }, 'notifications');
                const currentWin = getMainWindow();
                if (!currentWin) return;
                app.focus({ steal: true });
                if (currentWin.isMinimized()) currentWin.restore();
                if (!currentWin.isVisible()) currentWin.show();
                currentWin.setAlwaysOnTop(true, 'normal');
                currentWin.moveTop();
                currentWin.focus();
                setTimeout(() => {
                    currentWin.setAlwaysOnTop(false);
                    currentWin.webContents.send('focus-conversation', { upeerId });
                }, 200);
            });
            notif.show();
        }
    }

    sendResponse(fromAddress, {
        type: 'CHAT_ACK',
        id: data.id,
        status: 'delivered'
    });

    if (isNew) {
        issueVouch(upeerId, VouchType.HANDSHAKE).catch(err => warn('Failed to issue vouch', err, 'reputation'));
    }
}

export async function handleChatAck(
    upeerId: string,
    data: any,
    win: BrowserWindow | null
) {
    if (!data.id || !_UUID_RE.test(String(data.id))) return;
    const msg = (await getMessageById(data.id)) as any;
    if (msg && msg.chatUpeerId === upeerId && msg.isMine) {
        updateMessageStatus(data.id, data.status || 'delivered');
        win?.webContents.send('message-status-updated', {
            id: data.id,
            status: data.status || 'delivered'
        });
    }
}

export async function handleChatClear(
    upeerId: string,
    data: any,
    win: BrowserWindow | null
) {
    const { deleteMessagesByChatId } = await import('../../storage/messages/operations.js');
    deleteMessagesByChatId(upeerId, data.clearTimestamp);
    win?.webContents.send('chat-cleared', { upeerId });
}

export async function handleChatEdit(
    upeerId: string,
    data: any,
    win: BrowserWindow | null,
    signature: string
) {
    if (!data.id || !_UUID_RE.test(String(data.id))) return;
    const msg = (await getMessageById(data.id)) as any;
    if (msg && msg.chatUpeerId === upeerId && !msg.isMine) {
        updateMessageContent(data.id, data.newContent, signature);
        win?.webContents.send('message-edited', {
            id: data.id,
            newContent: data.newContent
        });
    }
}

export async function handleReadReceipt(
    upeerId: string,
    data: any,
    win: BrowserWindow | null
) {
    if (!data.id || !_UUID_RE.test(String(data.id))) return;
    updateMessageStatus(data.id, 'read');
    win?.webContents.send('message-status-updated', {
        id: data.id,
        status: 'read'
    });
}

export async function handleChatDelete(
    upeerId: string,
    data: any,
    win: BrowserWindow | null
) {
    if (!data.id || !_UUID_RE.test(String(data.id))) return;
    const msg = (await getMessageById(data.id)) as any;
    if (msg && msg.chatUpeerId === upeerId && !msg.isMine) {
        deleteMessageLocally(data.id);
        win?.webContents.send('message-deleted', { id: data.id });
    }
}

export async function handleChatReaction(
    upeerId: string,
    data: any,
    win: BrowserWindow | null
) {
    if (!data.id || !_UUID_RE.test(String(data.id))) return;
    if (data.reaction) {
        saveReaction(data.id, upeerId, data.reaction);
        win?.webContents.send('reaction-added', {
            messageId: data.id,
            upeerId: upeerId,
            reaction: data.reaction
        });
    } else if (data.emojiToDelete) {
        deleteReaction(data.id, upeerId, data.emojiToDelete);
        win?.webContents.send('reaction-removed', {
            messageId: data.id,
            upeerId: upeerId,
            reaction: data.emojiToDelete
        });
    }
}
