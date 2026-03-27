import {
    getMyAlias,
    getMyAvatar,
    getMyDhtSeq,
    getMySignedPreKeyBundle,
    isSessionLocked,
} from '../../security/identity.js';
import { getContacts } from '../../storage/contacts/operations.js';
import { warn, network } from '../../security/secure-logger.js';
import { getDhtNetworkAddresses, generateSignedLocationBlock, getDeviceMetadata, isYggdrasilAddress } from '../utils.js';
import { sendSecureUDPMessage } from '../server/transport.js';
import { sendDhtExchange, broadcastDhtUpdate as coreBroadcastDhtUpdate } from '../dht/core.js';
import { isIPBlocked } from '../server/circuitBreaker.js';
import { sendContactRequest } from './contacts.js';

type ContactStatus = 'pending' | 'incoming' | 'connected' | 'offline' | 'blocked';

type HeartbeatContact = {
    upeerId: string;
    status: ContactStatus;
    address?: string;
    knownAddresses?: string | string[] | null;
    publicKey?: string;
    dhtSignature?: string | null;
    dhtExpiresAt?: number | null;
    dhtSeq?: number | null;
    renewalToken?: string | null;
    lastSeen?: string | Date | null;
};

type HeartbeatPeer = {
    upeerId: string;
    publicKey: string;
    address: string;
    lastSeen: number;
};

type RenewableBlock = {
    upeerId: string;
    publicKey: string;
    locationBlock: {
        address: string;
        dhtSeq: number;
        signature: string;
        expiresAt?: number;
        renewalToken?: unknown;
    };
};

/**
 * Helper to get all verified addresses for a contact (primary + known)
 */
function getFanOutAddresses(contact: HeartbeatContact): string[] {
    const addresses = new Set<string>();
    if (contact.address && isYggdrasilAddress(contact.address)) addresses.add(contact.address);
    if (contact.knownAddresses) {
        try {
            const known = typeof contact.knownAddresses === 'string'
                ? JSON.parse(contact.knownAddresses)
                : contact.knownAddresses;
            if (Array.isArray(known)) {
                known.filter(isYggdrasilAddress).forEach((a: string) => addresses.add(a));
            }
        } catch (err) {
            warn('Failed to parse knownAddresses', err, 'heartbeat');
        }
    }
    return Array.from(addresses);
}

export function checkHeartbeat(contacts: HeartbeatContact[]) {
    for (const contact of contacts) {
        if (contact.status === 'pending' && contact.address && isYggdrasilAddress(contact.address) && !isIPBlocked(contact.address)) {
            sendContactRequest(contact.address).catch(err => {
                warn('Failed to retry pending contact request', err, 'heartbeat');
            });
        }
        if (contact.status === 'connected') {
            // Si la IP está en backoff (falla repetida), omitir este ciclo
            const addresses = getFanOutAddresses(contact);
            for (const addr of addresses) {
                if (isIPBlocked(addr)) continue;
                sendSecureUDPMessage(addr, {
                    type: 'PING',
                    alias: getMyAlias() || undefined,
                    avatar: getMyAvatar() || undefined,
                    signedPreKey: getMySignedPreKeyBundle(),
                }, contact.publicKey);
            }
            sendDhtExchange(contact.upeerId, sendSecureUDPMessage);

            // Enhanced distributed heartbeat with contact cache exchange
            distributedHeartbeat(contact, sendSecureUDPMessage).catch(err => {
                warn('Distributed heartbeat failed', err, 'heartbeat');
            });
        }
    }
}

// ========================
// Distributed Heartbeat Protocol for Extreme Resilience
// ========================

export async function distributedHeartbeat(contact: HeartbeatContact, sendSecureUDPMessage: (ip: string, data: unknown, pubKey?: string, internal?: boolean) => void) {
    // 1. Exchange location blocks
    await exchangeLocationBlocks(contact, sendSecureUDPMessage);

    // 2. Exchange lists of alive contacts
    const aliveContacts = getContactsSeenLast24h();
    await sendContactList(contact, aliveContacts, sendSecureUDPMessage);

    // 3. Synchronize DHT (send blocks that need renewal)
    const blocksToShare = getLocationBlocksForRenewal();
    await shareBlocks(contact, blocksToShare, sendSecureUDPMessage);

    // 4. Gossip de reputación (G-Set CRDT anti-entropía)
    await exchangeReputationGossip(contact, sendSecureUDPMessage);

    network('Distributed heartbeat completed', undefined, { contact: contact.upeerId }, 'heartbeat');
}

async function exchangeReputationGossip(
    contact: HeartbeatContact,
    send: (ip: string, data: unknown, pubKey?: string, internal?: boolean) => void,
): Promise<void> {
    try {
        const { getGossipIds } = await import('../../security/reputation/vouches.js');
        const ids = getGossipIds();
        if (ids.length === 0) return;
        const addresses = getFanOutAddresses(contact);
        for (const addr of addresses) {
            send(addr, { type: 'REPUTATION_GOSSIP', ids }, contact.publicKey);
        }
    } catch {
        // No bloquear el heartbeat si el módulo falla
    }
}

async function exchangeLocationBlocks(contact: HeartbeatContact, sendSecureUDPMessage: (ip: string, data: unknown, pubKey?: string, internal?: boolean) => void) {
    const currentAddresses = getDhtNetworkAddresses();
    if (currentAddresses.length === 0) return;

    const currentSeq = getMyDhtSeq();
    const deviceMeta = getDeviceMetadata();

    const locBlock = generateSignedLocationBlock(currentAddresses, currentSeq, undefined, undefined, deviceMeta);

    const addresses = getFanOutAddresses(contact);
    for (const addr of addresses) {
        sendSecureUDPMessage(addr, {
            type: 'DHT_UPDATE',
            locationBlock: locBlock
        }, contact.publicKey);
    }
}

function getContactsSeenLast24h(): HeartbeatPeer[] {
    const allContacts = getContacts() as HeartbeatContact[];
    const cutoff = Date.now() - (24 * 60 * 60 * 1000);

    return allContacts
        .filter(c => {
            if (!c.lastSeen || !c.address) return false;
            const lastSeenTs = new Date(c.lastSeen).getTime();
            return lastSeenTs > cutoff;
        })
        .map(c => ({
            upeerId: c.upeerId,
            lastSeen: new Date(c.lastSeen).getTime(),
            address: c.address || '',
            publicKey: c.publicKey || ''
        }));
}

async function sendContactList(contact: HeartbeatContact, aliveContacts: HeartbeatPeer[], sendSecureUDPMessage: (ip: string, data: unknown, pubKey?: string, internal?: boolean) => void) {
    if (aliveContacts.length === 0) return;

    const packet = {
        type: 'DHT_EXCHANGE',
        peers: aliveContacts
            .filter(c => c.publicKey && c.upeerId)
            .map(c => ({
                upeerId: c.upeerId,
                publicKey: c.publicKey,
                address: c.address,
                lastSeen: c.lastSeen
            }))
    };

    const addresses = getFanOutAddresses(contact);
    for (const addr of addresses) {
        sendSecureUDPMessage(addr, packet, contact.publicKey);
    }
}

function getLocationBlocksForRenewal(): RenewableBlock[] {
    const allContacts = getContacts() as HeartbeatContact[];
    const now = Date.now();
    const renewalThreshold = 3 * 24 * 60 * 60 * 1000; // 3 days

    return allContacts
        .filter(c => c.dhtSignature && c.dhtExpiresAt && c.publicKey && c.upeerId)
        .filter(c => {
            // BUG BP fix: campo Drizzle es dhtExpiresAt (columna dht_expires_at), no expiresAt.
            const timeToExpire = c.dhtExpiresAt - now;
            return timeToExpire < renewalThreshold && timeToExpire > 0;
        })
        .map(c => ({
            upeerId: c.upeerId,
            publicKey: c.publicKey || '',
            locationBlock: {
                address: c.address || '',
                dhtSeq: c.dhtSeq || 0,
                signature: c.dhtSignature,
                expiresAt: c.dhtExpiresAt,
                renewalToken: c.renewalToken
                    ? (() => { try { return JSON.parse(c.renewalToken); } catch { return undefined; } })()
                    : undefined
            }
        }));
}

async function shareBlocks(contact: HeartbeatContact, blocksToShare: RenewableBlock[], sendSecureUDPMessage: (ip: string, data: unknown, pubKey?: string, internal?: boolean) => void) {
    if (blocksToShare.length === 0) return;

    // Share blocks that need renewal
    const packet = {
        type: 'DHT_EXCHANGE',
        peers: blocksToShare
    };

    const addresses = getFanOutAddresses(contact);
    for (const addr of addresses) {
        sendSecureUDPMessage(addr, packet, contact.publicKey);
    }
}

export function broadcastDhtUpdate() {
    if (isSessionLocked()) return;
    coreBroadcastDhtUpdate(sendSecureUDPMessage);
}