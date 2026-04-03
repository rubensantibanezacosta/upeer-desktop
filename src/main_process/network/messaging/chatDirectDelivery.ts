import crypto from 'node:crypto';
import {
    getMyUPeerId,
    getMyPublicKey,
    getMySignedPreKey,
    sign,
} from '../../security/identity.js';
import { getContactByUpeerId } from '../../storage/contacts/operations.js';
import {
    saveMessage,
    updateMessageStatus,
} from '../../storage/messages/operations.js';
import { error, warn } from '../../security/secure-logger.js';
import { canonicalStringify } from '../utils.js';
import { sendSecureUDPMessage } from '../server/transport.js';
import { startDhtSearch } from '../dht/core.js';
import { encryptChatPayload } from './chatEncryption.js';
import {
    emitMessageStatusUpdated,
    getSelfAddresses,
    markMessageAsFailed,
    vaultChatForOfflineDelivery,
} from './chatSupport.js';
import {
    clearPendingDirectMessage,
    registerPendingDirectMessage,
} from './chatRetry.js';

type ChatContactRecord = {
    publicKey?: string | null;
    address?: string | null;
    status?: 'pending' | 'incoming' | 'connected' | 'offline' | 'disconnected';
    signedPreKey?: string | null;
    signedPreKeyId?: number | null;
};

type ConnectedSendOptions = {
    contact: ChatContactRecord;
    knownAddresses: string[];
    msgId: string;
    payload: string;
    replyTo?: string;
    selfId: string;
    timestamp: number;
    upeerId: string;
    ackTimeoutMs: number;
    persistMessage?: boolean;
    scheduleVaultFallback?: boolean;
    syncOwnDevices?: boolean;
};

export async function sendConnectedChatMessage({
    contact,
    knownAddresses,
    msgId,
    payload,
    replyTo,
    selfId,
    timestamp,
    upeerId,
    ackTimeoutMs,
    persistMessage = true,
    scheduleVaultFallback = true,
    syncOwnDevices = true,
}: ConnectedSendOptions): Promise<void> {
    const encryptedData = await encryptChatPayload(upeerId, payload, contact);
    const contactPublicKey = contact.publicKey ?? undefined;
    const peerPacket = {
        type: 'CHAT',
        id: msgId,
        timestamp,
        ...encryptedData,
        replyTo,
    };
    const signature = sign(Buffer.from(canonicalStringify(peerPacket)));
    const isToSelf = upeerId === selfId;

    if (persistMessage) {
        await saveMessage(msgId, upeerId, true, payload, replyTo, signature.toString('hex'), isToSelf ? 'read' : 'sent', selfId, timestamp);
    }

    const selfAddresses = syncOwnDevices ? await getSelfAddresses(selfId) : [];
    const peerAddresses: string[] = [];
    if (contact.address) peerAddresses.push(contact.address);
    for (const address of knownAddresses) {
        if (!peerAddresses.includes(address)) peerAddresses.push(address);
    }

    for (const address of peerAddresses) {
        sendSecureUDPMessage(address, peerPacket, contactPublicKey, false);
    }

    if (!isToSelf) {
        registerPendingDirectMessage({
            messageId: msgId,
            upeerId,
            payload,
            knownAddresses,
            replyTo,
            timestamp,
        });
    }

    const myPublicKey = getMyPublicKey().toString('hex');
    if (syncOwnDevices && selfAddresses.length > 0) {
        const mySignedPreKey = getMySignedPreKey();
        const selfEncryptedData = await encryptChatPayload(selfId, payload, {
            publicKey: myPublicKey,
            signedPreKey: mySignedPreKey.spkPub,
            signedPreKeyId: mySignedPreKey.spkId,
        });
        const selfPacket = {
            type: 'CHAT',
            id: msgId,
            timestamp,
            ...selfEncryptedData,
            replyTo,
        };
        for (const address of selfAddresses) {
            sendSecureUDPMessage(address, selfPacket, myPublicKey, true);
        }
    }

    if (syncOwnDevices && selfAddresses.length < 2) {
        import('../vault/manager.js').then(async ({ VaultManager }) => {
            try {
                const mySignedPreKey = getMySignedPreKey();
                const selfVaultEncrypted = await encryptChatPayload(selfId, payload, {
                    publicKey: myPublicKey,
                    signedPreKey: mySignedPreKey.spkPub,
                    signedPreKeyId: mySignedPreKey.spkId,
                });
                const syncPacket = {
                    type: 'CHAT',
                    id: msgId,
                    content: selfVaultEncrypted.content,
                    nonce: selfVaultEncrypted.nonce,
                    timestamp,
                    ...(selfVaultEncrypted.ratchetHeader ? { ratchetHeader: selfVaultEncrypted.ratchetHeader } : {}),
                    ...(selfVaultEncrypted.x3dhInit ? { x3dhInit: selfVaultEncrypted.x3dhInit } : {}),
                    ...(selfVaultEncrypted.ephemeralPublicKey ? { ephemeralPublicKey: selfVaultEncrypted.ephemeralPublicKey } : {}),
                    ...(selfVaultEncrypted.useRecipientEphemeral !== undefined ? { useRecipientEphemeral: selfVaultEncrypted.useRecipientEphemeral } : {}),
                    replyTo,
                    senderUpeerId: selfId,
                };
                const syncSignature = sign(Buffer.from(canonicalStringify(syncPacket)));
                await VaultManager.replicateToVaults(selfId, { ...syncPacket, signature: syncSignature.toString('hex') });
            } catch (err) {
                error('Multi-device: failed to vault sync packet', err, 'vault');
            }
        }).catch((err) => error('Multi-device: failed to load VaultManager for sync', err, 'vault'));
    }

    if (scheduleVaultFallback) {
        setTimeout(async () => {
            try {
                const { getMessageStatus } = await import('../../storage/messages/status.js');
                const status = getMessageStatus(msgId);
                if (status === 'sent') {
                    warn('Message not delivered, starting vault replication', { msgId, upeerId }, 'vault');
                    const freshContact = await getContactByUpeerId(upeerId) as ChatContactRecord | undefined;
                    if (!freshContact?.publicKey) return;
                    const nodes = await vaultChatForOfflineDelivery(upeerId, freshContact, msgId, payload, replyTo, selfId, timestamp);
                    if (nodes > 0) {
                        if (await updateMessageStatus(msgId, 'vaulted')) {
                            clearPendingDirectMessage(msgId);
                            await emitMessageStatusUpdated(msgId, 'vaulted');
                        }
                    } else {
                        clearPendingDirectMessage(msgId);
                        await markMessageAsFailed(msgId);
                    }
                    startDhtSearch(upeerId, sendSecureUDPMessage);
                }
            } catch (err) {
                error('Vault fallback setTimeout failed', err, 'vault');
                clearPendingDirectMessage(msgId);
                await markMessageAsFailed(msgId);
            }
        }, ackTimeoutMs);
    }
}

export async function resendPendingDirectMessage(
    upeerId: string,
    payload: string,
    knownAddresses: string[],
    replyTo?: string,
    messageId?: string,
    timestamp?: number,
): Promise<{ id: string; savedMessage: string; timestamp: number } | undefined> {
    const msgId = messageId ?? crypto.randomUUID();
    const retryTimestamp = timestamp ?? Date.now();
    const selfId = getMyUPeerId();
    const contact = await getContactByUpeerId(upeerId) as ChatContactRecord | undefined;
    if (!contact?.publicKey || contact.status !== 'connected') return undefined;

    await sendConnectedChatMessage({
        contact,
        knownAddresses,
        msgId,
        payload,
        replyTo,
        selfId,
        timestamp: retryTimestamp,
        upeerId,
        ackTimeoutMs: 2500,
        persistMessage: false,
        scheduleVaultFallback: false,
        syncOwnDevices: false,
    });

    return { id: msgId, savedMessage: payload, timestamp: retryTimestamp };
}