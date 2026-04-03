import crypto from 'node:crypto';
import {
    getMyUPeerId,
} from '../../security/identity.js';
import { getContactByUpeerId } from '../../storage/contacts/operations.js';
import { getGroupById } from '../../storage/groups/operations.js';
import {
    saveMessage,
    updateMessageStatus,
} from '../../storage/messages/operations.js';
import { error, warn } from '../../security/secure-logger.js';
import { buildMessagePayload } from '../messagePayload.js';
import { sendSecureUDPMessage } from '../server/transport.js';
import { startDhtSearch } from '../dht/core.js';
import { MAX_MESSAGE_SIZE_BYTES } from '../server/constants.js';
import { sendConnectedChatMessage } from './chatDirectDelivery.js';
import {
    emitMessageStatusUpdated,
    getFanOutAddresses,
    markMessageAsFailed,
    vaultChatForOfflineDelivery,
} from './chatSupport.js';

const CHAT_ACK_TIMEOUT_MS = 2500;

type LinkPreviewPayload = Record<string, unknown>;

type ChatOutboundMessage = {
    content: string;
    linkPreview?: LinkPreviewPayload | null;
};

type ChatContactRecord = {
    upeerId: string;
    publicKey?: string | null;
    address?: string | null;
    knownAddresses?: string | string[] | null;
    status?: 'pending' | 'incoming' | 'connected' | 'offline' | 'disconnected';
    signedPreKey?: string | null;
    signedPreKeyId?: number | null;
};

type GroupRecordLike = {
    status: 'active' | 'invited';
    members: string[];
};

function parseKnownAddresses(value: ChatContactRecord['knownAddresses'], upeerId: string, context: string): string[] {
    if (!value) return [];

    try {
        const parsed = typeof value === 'string' ? JSON.parse(value) : value;
        if (!Array.isArray(parsed)) return [];
        return parsed.filter((address): address is string => typeof address === 'string');
    } catch (err) {
        warn(context, { upeerId, err: String(err) }, 'network');
        return [];
    }
}

async function buildPayload(content: string, providedLinkPreview: LinkPreviewPayload | null): Promise<string> {
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


export async function sendUDPMessage(
    upeerId: string,
    message: string | ChatOutboundMessage,
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

    const contact = await getContactByUpeerId(upeerId) as ChatContactRecord | undefined;
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
            const nodes = await vaultChatForOfflineDelivery(upeerId, contact, msgId, payload, replyTo, selfId, timestamp);
            if (nodes > 0 && await updateMessageStatus(msgId, 'vaulted')) {
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
    const knownAddresses = parseKnownAddresses(contact.knownAddresses, upeerId, 'Failed to parse knownAddresses for message send');
    await sendConnectedChatMessage({
        contact,
        knownAddresses,
        msgId,
        payload,
        replyTo,
        selfId,
        timestamp,
        upeerId,
        ackTimeoutMs: CHAT_ACK_TIMEOUT_MS,
    });

    return { id: msgId, savedMessage: payload, timestamp };
}

export async function sendTypingIndicator(upeerId: string): Promise<void> {
    if (upeerId.startsWith('grp-')) {
        const group = getGroupById(upeerId) as GroupRecordLike | null;
        if (!group || group.status !== 'active') return;
        const myId = getMyUPeerId();
        const data = { type: 'TYPING', groupId: upeerId };
        for (const memberId of group.members) {
            if (memberId === myId) continue;
            const contact = await getContactByUpeerId(memberId) as ChatContactRecord | undefined;
            if (contact?.status === 'connected' && contact.publicKey) {
                for (const address of getFanOutAddresses(contact)) {
                    sendSecureUDPMessage(address, data, contact.publicKey);
                }
            }
        }
        return;
    }

    const contact = await getContactByUpeerId(upeerId) as ChatContactRecord | undefined;
    if (!contact || contact.status !== 'connected' || !contact.publicKey) return;
    for (const address of getFanOutAddresses(contact)) {
        sendSecureUDPMessage(address, { type: 'TYPING' }, contact.publicKey);
    }
}
