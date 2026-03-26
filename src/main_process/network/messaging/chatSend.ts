import crypto from 'node:crypto';
import {
    encrypt,
    getMyEphemeralPublicKeyHex,
    getMyIdentitySkBuffer,
    getMyPublicKey,
    getMyPublicKeyHex,
    getMyUPeerId,
    sign,
} from '../../security/identity.js';
import { getContactByUpeerId } from '../../storage/contacts/operations.js';
import { getGroupById } from '../../storage/groups/operations.js';
import {
    saveMessage,
    updateMessageStatus,
} from '../../storage/messages/operations.js';
import { error, warn } from '../../security/secure-logger.js';
import { buildMessagePayload } from '../messagePayload.js';
import { canonicalStringify } from '../utils.js';
import { sendSecureUDPMessage } from '../server/transport.js';
import { startDhtSearch } from '../dht/core.js';
import { MAX_MESSAGE_SIZE_BYTES } from '../server/constants.js';
import {
    emitMessageStatusUpdated,
    getFanOutAddresses,
    getSelfAddresses,
    markMessageAsFailed,
    vaultChatForOfflineDelivery,
} from './chatSupport.js';

const CHAT_ACK_TIMEOUT_MS = 2500;

async function buildPayload(content: string, providedLinkPreview: { [key: string]: any } | null): Promise<string> {
    const urlFirstRegex = /(https?:\/\/[^\s<>"']+)/i;
    const urlMatch = urlFirstRegex.exec(content);
    let payload = content;
    if (providedLinkPreview) {
        payload = await buildMessagePayload(content, providedLinkPreview as never);
    } else if (urlMatch) {
        const { fetchOgPreview } = await import('../og-fetcher.js');
        const preview = await fetchOgPreview(urlMatch[1]);
        if (preview) payload = await buildMessagePayload(content, preview);
    }
    return payload;
}

async function encryptChatPayload(upeerId: string, payload: string, contact: any): Promise<Record<string, unknown>> {
    let ratchetHeader: Record<string, unknown> | undefined;
    let x3dhInit: Record<string, unknown> | undefined;
    let contentHex: string;
    let nonceHex: string;
    let ephemeralPublicKey: string | undefined;
    let useRecipientEphemeral: boolean | undefined;

    try {
        const { getRatchetSession, saveRatchetSession } = await import('../../storage/ratchet/operations.js');
        const { x3dhInitiator, ratchetEncrypt, ratchetInitAlice } = await import('../../security/ratchet.js');
        const sessionResult = getRatchetSession(upeerId);
        let session = sessionResult?.state;
        let usedSpkId = sessionResult?.spkIdUsed;

        if (!session && contact.signedPreKey) {
            const myIdentitySecretKey = getMyIdentitySkBuffer();
            const myIdentityPublicKey = Buffer.from(getMyPublicKeyHex(), 'hex');
            const bobIdentityPublicKey = Buffer.from(contact.publicKey, 'hex');
            const bobSignedPreKey = Buffer.from(contact.signedPreKey as string, 'hex');
            const { ekPub, sharedSecret } = x3dhInitiator(myIdentitySecretKey, myIdentityPublicKey, bobIdentityPublicKey, bobSignedPreKey);
            session = ratchetInitAlice(sharedSecret, bobSignedPreKey);
            sharedSecret.fill(0);
            usedSpkId = contact.signedPreKeyId;
            x3dhInit = {
                ekPub: ekPub.toString('hex'),
                spkId: usedSpkId,
                ikPub: myIdentityPublicKey.toString('hex'),
            };
        }

        if (!session) {
            throw new Error('no-session');
        }

        const encrypted = ratchetEncrypt(session, Buffer.from(payload, 'utf-8'));
        saveRatchetSession(upeerId, session, usedSpkId);
        ratchetHeader = encrypted.header as unknown as Record<string, unknown>;
        contentHex = encrypted.ciphertext;
        nonceHex = encrypted.nonce;
    } catch (err) {
        if (!(err instanceof Error && err.message === 'no-session')) {
            warn('Double Ratchet unavailable, falling back to legacy crypto_box', { upeerId, err: String(err) }, 'network');
        }
        ephemeralPublicKey = getMyEphemeralPublicKeyHex();
        const encrypted = encrypt(Buffer.from(payload, 'utf-8'), Buffer.from(contact.publicKey, 'hex'));
        useRecipientEphemeral = false;
        contentHex = encrypted.ciphertext;
        nonceHex = encrypted.nonce;
    }

    return {
        content: contentHex,
        nonce: nonceHex,
        ...(ratchetHeader ? { ratchetHeader } : {}),
        ...(x3dhInit ? { x3dhInit } : {}),
        ...(ephemeralPublicKey ? { ephemeralPublicKey } : {}),
        ...(useRecipientEphemeral !== undefined ? { useRecipientEphemeral } : {}),
    };
}

export async function sendUDPMessage(
    upeerId: string,
    message: string | { [key: string]: any },
    replyTo?: string,
    messageId?: string,
): Promise<{ id: string; savedMessage: string; timestamp: number } | undefined> {
    const selfId = getMyUPeerId();
    const msgId = messageId || crypto.randomUUID();
    const content = typeof message === 'string' ? message : message.content;
    const providedLinkPreview = typeof message === 'string' ? null : message.linkPreview ?? null;

    if (content.length > MAX_MESSAGE_SIZE_BYTES) {
        error(`Message size exceeds limit (${content.length} > ${MAX_MESSAGE_SIZE_BYTES})`, { upeerId, msgId }, 'security');
        return undefined;
    }

    const payload = await buildPayload(content, providedLinkPreview);
    if (payload.length > MAX_MESSAGE_SIZE_BYTES) {
        error(`Message payload size exceeds limit (${payload.length} > ${MAX_MESSAGE_SIZE_BYTES})`, { upeerId, msgId }, 'security');
        return undefined;
    }

    const contact = await getContactByUpeerId(upeerId);
    if (!contact || !contact.publicKey) {
        if (contact && !contact.publicKey) {
            await saveMessage(msgId, upeerId, true, content, replyTo, '', 'sent');
            const { savePendingOutboxMessage } = await import('../../storage/pending-outbox.js');
            await savePendingOutboxMessage(upeerId, msgId, content, replyTo);
            warn('No pubkey for contact, message queued in pending outbox', { upeerId }, 'vault');
            return { id: msgId, savedMessage: content, timestamp: Date.now() };
        }
        return undefined;
    }

    if (contact.status !== 'connected') {
        const timestamp = Date.now();
        await saveMessage(msgId, upeerId, true, payload, replyTo, '', 'sent', selfId, timestamp);
        let vaulted = false;
        try {
            const nodes = await vaultChatForOfflineDelivery(upeerId, contact.publicKey, msgId, payload, replyTo, selfId, timestamp);
            if (nodes > 0 && await updateMessageStatus(msgId, 'vaulted' as any)) {
                vaulted = true;
                setTimeout(() => { void emitMessageStatusUpdated(msgId, 'vaulted'); }, 0);
            }
        } catch (err) {
            error('Immediate vault replication failed for offline contact', err, 'vault');
        }
        if (!vaulted) await markMessageAsFailed(msgId);
        startDhtSearch(upeerId, sendSecureUDPMessage);
        return { id: msgId, savedMessage: payload, timestamp };
    }

    const timestamp = Date.now();
    const encryptedData = await encryptChatPayload(upeerId, payload, contact);
    const data = {
        type: 'CHAT',
        id: msgId,
        timestamp,
        ...encryptedData,
        replyTo,
    };
    const signature = sign(Buffer.from(canonicalStringify(data)));
    const isToSelf = upeerId === selfId;
    await saveMessage(msgId, upeerId, true, payload, replyTo, signature.toString('hex'), isToSelf ? 'read' : 'sent', selfId, timestamp);

    const selfAddresses = await getSelfAddresses(selfId);
    const chatAddresses: string[] = [];
    if (contact.address) chatAddresses.push(contact.address);
    for (const address of selfAddresses) {
        if (!chatAddresses.includes(address)) chatAddresses.push(address);
    }
    try {
        const knownAddresses: string[] = JSON.parse((contact as any).knownAddresses ?? '[]');
        for (const address of knownAddresses) {
            if (!chatAddresses.includes(address)) chatAddresses.push(address);
        }
    } catch (err) {
        warn('Failed to parse knownAddresses for message send', { upeerId, err: String(err) }, 'network');
    }

    const myPublicKey = getMyPublicKey().toString('hex');
    for (const address of chatAddresses) {
        const isSelf = selfAddresses.includes(address);
        const targetSealedKey = isSelf ? myPublicKey : contact.publicKey;
        sendSecureUDPMessage(address, data, targetSealedKey, isSelf);
    }

    if (selfAddresses.length < 2) {
        import('../vault/manager.js').then(async ({ VaultManager }) => {
            try {
                const selfVaultEncrypted = encrypt(Buffer.from(payload, 'utf-8'), Buffer.from(myPublicKey, 'hex'));
                const syncPacket = {
                    type: 'CHAT',
                    id: msgId,
                    content: selfVaultEncrypted.ciphertext,
                    nonce: selfVaultEncrypted.nonce,
                    timestamp,
                    ephemeralPublicKey: getMyEphemeralPublicKeyHex(),
                    useRecipientEphemeral: false,
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

    setTimeout(async () => {
        try {
            const { getMessageStatus } = await import('../../storage/messages/status.js');
            const status = getMessageStatus(msgId);
            if (status === 'sent') {
                warn('Message not delivered, starting vault replication', { msgId, upeerId }, 'vault');
                const freshContact = await getContactByUpeerId(upeerId);
                if (!freshContact?.publicKey) return;
                const nodes = await vaultChatForOfflineDelivery(upeerId, freshContact.publicKey, msgId, payload, replyTo, selfId, timestamp);
                if (nodes > 0) {
                    if (await updateMessageStatus(msgId, 'vaulted' as any)) {
                        await emitMessageStatusUpdated(msgId, 'vaulted');
                    }
                } else {
                    await markMessageAsFailed(msgId);
                }
                startDhtSearch(upeerId, sendSecureUDPMessage);
            }
        } catch (err) {
            error('Vault fallback setTimeout failed', err, 'vault');
            await markMessageAsFailed(msgId);
        }
    }, CHAT_ACK_TIMEOUT_MS);

    return { id: msgId, savedMessage: payload, timestamp };
}

export async function sendTypingIndicator(upeerId: string): Promise<void> {
    if (upeerId.startsWith('grp-')) {
        const group = getGroupById(upeerId);
        if (!group || group.status !== 'active') return;
        const myId = getMyUPeerId();
        const data = { type: 'TYPING', groupId: upeerId };
        for (const memberId of group.members) {
            if (memberId === myId) continue;
            const contact = await getContactByUpeerId(memberId);
            if (contact?.status === 'connected') {
                for (const address of getFanOutAddresses(contact)) {
                    sendSecureUDPMessage(address, data, contact.publicKey);
                }
            }
        }
        return;
    }

    const contact = await getContactByUpeerId(upeerId);
    if (!contact || contact.status !== 'connected') return;
    for (const address of getFanOutAddresses(contact)) {
        sendSecureUDPMessage(address, { type: 'TYPING' }, contact.publicKey);
    }
}
