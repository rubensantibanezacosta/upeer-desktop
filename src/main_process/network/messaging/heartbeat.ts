import {
    getMyUPeerId,
    getMyAlias,
    getMyAvatar,
    getMyDhtSeq,
    isSessionLocked,
} from '../../security/identity.js';
import { getContacts } from '../../storage/db.js';
import { warn, network } from '../../security/secure-logger.js';
import { getNetworkAddress, generateSignedLocationBlock } from '../utils.js';
import { sendSecureUDPMessage } from '../server/transport.js';
import { sendDhtExchange, broadcastDhtUpdate as coreBroadcastDhtUpdate } from '../dht/core.js';
import { isIPBlocked } from '../server/circuitBreaker.js';

export function checkHeartbeat(contacts: any[]) {
    for (const contact of contacts) {
        if (contact.status === 'connected') {
            // Si la IP está en backoff (falla repetida), omitir este ciclo
            if (isIPBlocked(contact.address)) continue;

            sendSecureUDPMessage(contact.address, {
                type: 'PING',
                alias: getMyAlias() || undefined,
                avatar: getMyAvatar() || undefined,
            });
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

export async function distributedHeartbeat(contact: any, sendSecureUDPMessage: (ip: string, data: any) => void) {
    const myId = getMyUPeerId();

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
    send: (ip: string, data: any) => void,
): Promise<void> {
    try {
        const { getGossipIds } = await import('../../security/reputation/vouches.js');
        const ids = getGossipIds();
        if (ids.length === 0) return;
        send(contact.address, { type: 'REPUTATION_GOSSIP', ids });
    } catch {
        // No bloquear el heartbeat si el módulo falla
    }
}

async function exchangeLocationBlocks(contact: any, sendSecureUDPMessage: (ip: string, data: any) => void) {
    // Send our current location block
    const currentIp = getNetworkAddress();
    if (!currentIp) return;

    // BUG AV fix: usar getMyDhtSeq() (lectura) en lugar de incrementMyDhtSeq() (escritura).
    // exchangeLocationBlocks se llama una vez por contacto conectado en cada heartbeat;
    // con N contactos, incrementMyDhtSeq() se ejecutaba N veces por ciclo, haciendo
    // que distintos contactos recibieran seqs dispares (N, N+1, …, N+M-1) y que el seq
    // se agotara M veces más rápido de lo necesario. broadcastDhtUpdate() ya incrementa
    // el seq cuando detecta un cambio de IP — esa es la fuente autorizada de incremento.
    const currentSeq = getMyDhtSeq();

    // generateSignedLocationBlock genera internamente el renewalToken con nuestro propio ID
    // como targetId si no se le pasa ninguno — que es lo correcto para nuestro propio bloque.
    const locBlock = generateSignedLocationBlock(currentIp, currentSeq);

    sendSecureUDPMessage(contact.address, {
        type: 'DHT_UPDATE',
        locationBlock: locBlock
    });
}

function getContactsSeenLast24h(): Array<{
    upeerId: string;
    lastSeen: number;
    address: string;
}> {
    const allContacts = getContacts() as any[];
    const cutoff = Date.now() - (24 * 60 * 60 * 1000);

    return allContacts
        .filter(c => c.lastSeen && c.lastSeen > cutoff && c.address)
        .map(c => ({
            upeerId: c.upeerId,
            lastSeen: c.lastSeen,
            address: c.address
        }));
}

async function sendContactList(contact: any, aliveContacts: any[], sendSecureUDPMessage: (ip: string, data: any) => void) {
    if (aliveContacts.length === 0) return;

    sendSecureUDPMessage(contact.address, {
        type: 'DHT_EXCHANGE',
        peers: aliveContacts
            // BUG AY fix: publicKey es obligatoria en validateDhtExchange; sin ella
            // todos los paquetes DHT_EXCHANGE de heartbeat eran rechazados silenciosamente.
            // Además filtrar peers sin publicKey para no enviar entradas incompletas.
            .filter(c => c.publicKey && c.upeerId)
            .map(c => ({
                upeerId: c.upeerId,
                publicKey: c.publicKey,
                address: c.address,
                lastSeen: c.lastSeen
            }))
    });
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

async function shareBlocks(contact: any, blocksToShare: any[], sendSecureUDPMessage: (ip: string, data: any) => void) {
    if (blocksToShare.length === 0) return;

    // Share blocks that need renewal
    sendSecureUDPMessage(contact.address, {
        type: 'DHT_EXCHANGE',
        peers: blocksToShare
    });
}

export function wrappedBroadcastDhtUpdate() {
    if (isSessionLocked()) return;
    coreBroadcastDhtUpdate(sendSecureUDPMessage);
}