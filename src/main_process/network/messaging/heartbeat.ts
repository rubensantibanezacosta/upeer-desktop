import {
    getMyAlias,
    getMyAvatar,
    getMyDhtSeq,
    getMySignedPreKeyBundle,
    isSessionLocked,
} from '../../security/identity.js';
import { getContacts } from '../../storage/contacts/operations.js';
import { warn, network } from '../../security/secure-logger.js';
import { getNetworkAddresses, generateSignedLocationBlock, getDeviceMetadata, isYggdrasilAddress } from '../utils.js';
import { sendSecureUDPMessage } from '../server/transport.js';
import { sendDhtExchange, broadcastDhtUpdate as coreBroadcastDhtUpdate } from '../dht/core.js';
import { isIPBlocked } from '../server/circuitBreaker.js';

/**
 * Helper to get all verified addresses for a contact (primary + known)
 */
function getFanOutAddresses(contact: any): string[] {
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

export function checkHeartbeat(contacts: any[]) {
    for (const contact of contacts) {
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

export async function distributedHeartbeat(contact: any, sendSecureUDPMessage: (ip: string, data: any, pubKey?: string, internal?: boolean) => void) {
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
    contact: any,
    send: (ip: string, data: any, pubKey?: string, internal?: boolean) => void,
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

async function exchangeLocationBlocks(contact: any, sendSecureUDPMessage: (ip: string, data: any, pubKey?: string, internal?: boolean) => void) {
    // Send our current location blocks for all available channels
    const currentAddresses = getNetworkAddresses();
    if (currentAddresses.length === 0) return;

    const currentSeq = getMyDhtSeq();
    const deviceMeta = getDeviceMetadata();

    // generateSignedLocationBlock now accepts string[] and handles plural 'addresses'
    const locBlock = generateSignedLocationBlock(currentAddresses, currentSeq, undefined, undefined, deviceMeta);

    const addresses = getFanOutAddresses(contact);
    for (const addr of addresses) {
        sendSecureUDPMessage(addr, {
            type: 'DHT_UPDATE',
            locationBlock: locBlock
        }, contact.publicKey);
    }
}

function getContactsSeenLast24h(): Array<{
    upeerId: string;
    lastSeen: number;
    address: string;
}> {
    const allContacts = getContacts() as any[];
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
            address: c.address,
            publicKey: c.publicKey // Ensure publicKey is passed
        }));
}

async function sendContactList(contact: any, aliveContacts: any[], sendSecureUDPMessage: (ip: string, data: any, pubKey?: string, internal?: boolean) => void) {
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

function getLocationBlocksForRenewal(): Array<{
    upeerId: string;
    locationBlock: any;
}> {
    const allContacts = getContacts() as any[];
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
            // BUG AY fix: publicKey es obligatoria en validateDhtExchange — sin ella
            // el receptor rechaza el paquete y shareBlocks no servía de nada.
            publicKey: c.publicKey,
            locationBlock: {
                address: c.address,
                dhtSeq: c.dhtSeq,
                signature: c.dhtSignature,
                expiresAt: c.dhtExpiresAt,
                // BUG CI fix: incluir renewalToken para que el receptor pueda auto-renovar
                // el bloque cuando expira. Sin el token, la propagación era inefectiva.
                renewalToken: c.renewalToken
                    ? (() => { try { return JSON.parse(c.renewalToken); } catch { return undefined; } })()
                    : undefined
            }
        }));
}

async function shareBlocks(contact: any, blocksToShare: any[], sendSecureUDPMessage: (ip: string, data: any, pubKey?: string, internal?: boolean) => void) {
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