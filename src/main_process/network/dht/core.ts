import {
    getContacts,
    getContactByUpeerId
} from '../../storage/contacts/operations.js';
import {
    getMyUPeerId,
    incrementMyDhtSeq
} from '../../security/identity.js';
import {
    generateSignedLocationBlock,
    getNetworkAddresses
} from '../utils.js';
import { getKademliaInstance, publishLocationBlock, findNodeLocation, iterativeFindNode } from './handlers.js';
import { network, warn, error } from '../../security/secure-logger.js';

let lastKnownAddresses: string[] = [];

export function broadcastDhtUpdate(sendSecureUDPMessage: (ip: string, data: any) => void) {
    const addresses = getNetworkAddresses();
    if (addresses.length === 0) return;

    // Check if the set of addresses has changed
    const hasChanged = addresses.length !== lastKnownAddresses.length ||
        !addresses.every(addr => lastKnownAddresses.includes(addr));

    if (hasChanged) {
        lastKnownAddresses = [...addresses];
        const newSeq = incrementMyDhtSeq();

        network('Network addresses changed', undefined, { addresses, newSeq }, 'dht');

        // Generate signed block with ALL addresses
        const locBlock = generateSignedLocationBlock(addresses, newSeq);

        // 1. Publish to Kademlia DHT
        // Note: For Kademlia, we still publish it keyed by upeerId. 
        // We pass the full signed block to ensure signature verification and multi-channel support for consumers.
        publishLocationBlock(locBlock).catch(err => {
            warn('Failed to publish location block', err, 'kademlia');
        });

        // 2. Limited broadcast to intimate contacts with the FULL multi-channel block
        const contacts = getContacts();
        const intimateContacts = contacts
            .filter(c => c.status === 'connected')
            .slice(0, 10);

        for (const contact of intimateContacts) {
            sendSecureUDPMessage(contact.address, {
                type: 'DHT_UPDATE',
                locationBlock: locBlock
            });
        }

        network('Multi-channel update propagated', undefined, { intimateContacts: intimateContacts.length }, 'dht');
    }
}

export async function sendDhtExchange(targetUpeerId: string, sendSecureUDPMessage: (ip: string, data: any) => void) {
    const targetContact = await getContactByUpeerId(targetUpeerId);
    if (!targetContact || targetContact.status !== 'connected') return;

    const kademlia = getKademliaInstance();
    if (kademlia) {
        // With Kademlia, we can send a more targeted exchange
        // Find contacts closest to the target
        const closestContacts = (kademlia as any).findClosestContacts(targetUpeerId, 5);

        // BUG BJ fix: KademliaContact no incluye expiresAt ni renewalToken (son campos del
        // registro DB, no del routing table). Si se enviaban así, los receptores recibían
        // expiresAt: undefined → la firma no verificaba (signed con expiresAt) y se perdía
        // el renewalToken → imposibilidad de autorenovación para contactos vía Kademlia.
        // Se hace lookup en DB para cada contacto antes de construir el payload.
        const filteredContacts = closestContacts
            .filter((c: any) => c.upeerId !== targetUpeerId && c.dhtSignature);

        const payload = (await Promise.all(
            filteredContacts.map(async (c: any) => {
                const dbContact = await getContactByUpeerId(c.upeerId);
                // BUG BP fix: el campo Drizzle es dhtExpiresAt (columna dht_expires_at),
                // no expiresAt. renewalToken se almacena JSON.stringify → parsear al leer.

                let known: string[] | undefined;
                if (dbContact?.knownAddresses) {
                    try { known = JSON.parse(dbContact.knownAddresses); } catch { /* ignore */ }
                }

                return {
                    upeerId: c.upeerId,
                    publicKey: c.publicKey,
                    locationBlock: {
                        address: c.address,
                        addresses: known || [c.address], // Include all known addresses for multi-channel
                        dhtSeq: c.dhtSeq,
                        signature: c.dhtSignature,
                        expiresAt: dbContact?.dhtExpiresAt ?? undefined,
                        renewalToken: dbContact?.renewalToken
                            ? (() => { try { return JSON.parse(dbContact.renewalToken); } catch { return undefined; } })()
                            : undefined
                    }
                };
            })
        ));

        if (payload.length > 0) {
            sendSecureUDPMessage(targetContact.address, {
                type: 'DHT_EXCHANGE',
                peers: payload
            });
        }
    } else {
        // Legacy implementation
        const allContacts = getContacts() as any[];

        const distanceXOR = (idA: string, idB: string) => {
            try {
                return BigInt('0x' + idA) ^ BigInt('0x' + idB);
            } catch {
                return BigInt(0);
            }
        };

        const payload = allContacts
            .filter(c => c.status === 'connected' && c.dhtSignature && c.upeerId !== targetUpeerId)
            .map(c => ({
                upeerId: c.upeerId,
                publicKey: c.publicKey,
                locationBlock: {
                    address: c.address,
                    dhtSeq: c.dhtSeq,
                    signature: c.dhtSignature,
                    // BUG BP fix: campo Drizzle es dhtExpiresAt, no expiresAt.
                    // renewalToken se guarda como JSON string → parsear al leer.
                    expiresAt: c.dhtExpiresAt,
                    renewalToken: c.renewalToken
                        ? (() => { try { return JSON.parse(c.renewalToken); } catch { return undefined; } })()
                        : undefined
                },
                dist: distanceXOR(c.upeerId, targetUpeerId)
            }))
            .sort((a, b) => (a.dist < b.dist ? -1 : a.dist > b.dist ? 1 : 0))
            .map(({ dist: _dist, ...data }) => data);

        const limitedPayload = payload.slice(0, 5);

        if (limitedPayload.length > 0) {
            sendSecureUDPMessage(targetContact.address, {
                type: 'DHT_EXCHANGE',
                peers: limitedPayload
            });
        }
    }
}

export async function startDhtSearch(upeerId: string, sendSecureUDPMessage: (ip: string, data: any) => void) {
    network('Starting active DHT search', undefined, { upeerId }, 'dht-search');

    // First, try to find in Kademlia DHT
    const location = await findNodeLocation(upeerId);
    if (location) {
        network('Found via DHT lookup', undefined, { upeerId, location }, 'kademlia');
        return;
    }

    // If not found in DHT, perform iterative Kademlia search
    const kademlia = getKademliaInstance();
    if (kademlia) {
        network('Starting iterative search', undefined, { upeerId }, 'kademlia');
        iterativeFindNode(upeerId, sendSecureUDPMessage).catch(err => {
            warn('Iterative search failed', err, 'kademlia');
        });
    } else {
        // Legacy search with referral system
        const allContacts = getContacts() as any[];

        const distanceXOR = (idA: string, idB: string) => {
            try { return BigInt('0x' + idA) ^ BigInt('0x' + idB); }
            catch { return BigInt(0); }
        };

        const queryTargets = allContacts
            .filter(c => c.status === 'connected' && c.upeerId !== upeerId)
            .map(c => ({
                upeerId: c.upeerId,
                address: c.address,
                dist: distanceXOR(c.upeerId, upeerId),
                hasRenewalToken: !!c.renewalToken,
                expiresAt: c.expiresAt
            }))
            .sort((a, b) => {
                // Prioritize contacts with renewal tokens first
                if (a.hasRenewalToken && !b.hasRenewalToken) return -1;
                if (!a.hasRenewalToken && b.hasRenewalToken) return 1;
                // Then by distance
                return a.dist < b.dist ? -1 : a.dist > b.dist ? 1 : 0;
            })
            .slice(0, 5); // Query more contacts for better coverage

        for (const target of queryTargets) {
            sendSecureUDPMessage(target.address, {
                type: 'DHT_QUERY',
                targetId: upeerId,
                // Include referral context for better routing
                referralContext: {
                    requester: getMyUPeerId(),
                    timestamp: Date.now()
                }
            });
        }
    }
}

// ========================
// Aggressive Rediscovery Protocol for Extreme Resilience
// ========================

export async function aggressiveRediscovery(myId: string, sendSecureUDPMessage: (ip: string, data: any) => void): Promise<string | null> {
    network('Starting aggressive rediscovery', undefined, { myId }, 'rediscovery');

    // 1. DHT persistent (30 days)
    const dhtLocation = await findNodeLocation(myId);
    if (dhtLocation) {
        network('Found via persistent DHT', undefined, { myId, location: dhtLocation }, 'rediscovery');
        return dhtLocation;
    }

    // 2. Local contact cache (last 30 days)
    const recentContacts = getRecentContacts(30); // Get contacts seen in last 30 days
    for (const contact of recentContacts) {
        if (await pingContact(contact.lastKnownIp, sendSecureUDPMessage)) {
            // Ask "have you seen [myId] recently?"
            const response = await askAboutContact(contact, myId, sendSecureUDPMessage);
            if (response && response.newIp) {
                network('Found via contact query', undefined, { myId, via: contact.upeerId, location: response.newIp }, 'rediscovery');
                return response.newIp;
            }
        }
    }

    // 3. LAN discovery extended
    const lanPeers = await scanLanForUpeer(24, sendSecureUDPMessage); // Scan for 24h
    for (const peer of lanPeers) {
        const knownLocation = await queryPeerForContact(peer, myId, sendSecureUDPMessage);
        if (knownLocation) {
            network('Found via LAN peer', undefined, { myId, via: peer.upeerId, location: knownLocation }, 'rediscovery');
            return knownLocation;
        }
    }

    // 4. Enter "beacon" mode for 24h
    startBeaconMode(24 * 60 * 60 * 1000, sendSecureUDPMessage);
    network('Entering beacon mode', undefined, { myId, duration: '24h' }, 'rediscovery');
    return null; // Wait for someone to find me
}

// Helper functions for aggressive rediscovery
function getRecentContacts(days: number): Array<{
    upeerId: string;
    lastKnownIp: string;
    lastSeen: number;
}> {
    const allContacts = getContacts() as any[];
    const cutoff = Date.now() - (days * 24 * 60 * 60 * 1000);

    return allContacts
        .filter(c => c.lastSeen && c.lastSeen > cutoff && c.address)
        .map(c => ({
            upeerId: c.upeerId,
            lastKnownIp: c.address,
            lastSeen: c.lastSeen
        }))
        .sort((a, b) => b.lastSeen - a.lastSeen); // Most recent first
}

async function pingContact(ip: string, _sendSecureUDPMessage: (ip: string, data: any) => void): Promise<boolean> {
    return new Promise((resolve) => {
        // BUG AT fix: el código anterior sobreescribía el timeout de 5s (false) con un
        // setTimeout de 1s que siempre resolvía true, ignorando la reachability real.
        // pingContact no puede recibir el PONG (la integración con el handler UDP no
        // está implementada), por lo que lo correcto es resolver false tras el timeout.
        _sendSecureUDPMessage(ip, { type: 'PING' });
        // Note: In a full implementation, we would need to hook into the UDP response
        // handler to actually receive PONG before this timeout fires.
        setTimeout(() => resolve(false), 5000);
    });
}

async function askAboutContact(contact: any, targetId: string, _sendSecureUDPMessage: (ip: string, data: any) => void): Promise<{ newIp?: string }> {
    return new Promise((resolve) => {
        _sendSecureUDPMessage(contact.lastKnownIp, {
            type: 'DHT_QUERY',
            targetId: targetId
        });

        // Note: In a real implementation, we would need to listen for DHT_RESPONSE
        // This is simplified
        setTimeout(() => resolve({}), 3000);
    });
}

async function scanLanForUpeer(hours: number, _sendSecureUDPMessage: (ip: string, data: any) => void): Promise<Array<{ upeerId: string, address: string }>> {
    // Simplified LAN scanning - in practice would use multicast/broadcast
    network('Starting LAN scan', undefined, { duration: `${hours}h` }, 'lan-discovery');
    return []; // Placeholder - would return discovered peers
}

async function queryPeerForContact(peer: any, targetId: string, _sendSecureUDPMessage: (ip: string, data: any) => void): Promise<string | null> {
    return new Promise((resolve) => {
        _sendSecureUDPMessage(peer.address, {
            type: 'DHT_QUERY',
            targetId: targetId
        });

        // Note: In a real implementation, we would need to listen for DHT_RESPONSE
        setTimeout(() => resolve(null), 3000);
    });
}

function startBeaconMode(durationMs: number, sendSecureUDPMessage: (ip: string, data: any) => void) {
    network('Starting beacon mode', undefined, { duration: `${durationMs}ms` }, 'beacon');

    // 1. Send broadcast UDP every 5 minutes
    const beaconInterval = setInterval(() => {
        sendBeaconBroadcast(sendSecureUDPMessage).catch(err => {
            error('Beacon broadcast failed', err, 'beacon');
        });
    }, 5 * 60 * 1000);

    // 2. Listen actively for any upeer traffic
    // (already handled by main UDP server)

    // 3. Stop beacon mode after duration
    setTimeout(() => {
        clearInterval(beaconInterval);
        network('Beacon mode ended', undefined, {}, 'beacon');
    }, durationMs);
}

async function sendBeaconBroadcast(_sendSecureUDPMessage: (ip: string, data: any) => void) {
    const myId = getMyUPeerId();

    // Import getMyPublicKeyHex dynamically to avoid circular dependency
    const { getMyPublicKeyHex } = await import('../../security/identity.js');
    const myPublicKey = getMyPublicKeyHex();

    const _beaconData = {
        type: 'BEACON_NEW_NODE',
        upeerId: myId,
        publicKey: myPublicKey,
        seekingContacts: true,
        timestamp: Date.now()
    };

    // In practice, we would broadcast to LAN multicast/broadcast address
    // For now, we'll log it
    network('Sending beacon broadcast', undefined, { myId }, 'beacon');

    // Note: Actual broadcast implementation would need:
    // 1. LAN broadcast address (e.g., "ff02::1" for IPv6 link-local multicast)
    // 2. Proper multicast socket configuration
    // 3. TTL settings for multicast

    // This is a placeholder for the actual broadcast implementation
    // sendSecureUDPMessage("ff02::1", beaconData);
}

// ========================
// Enhanced Beacon Mode for Isolated Nodes
// ========================

export function startEnhancedBeaconMode(durationMs: number, sendSecureUDPMessage: (ip: string, data: any) => void) {
    network('Starting enhanced beacon mode', undefined, { duration: `${durationMs}ms` }, 'beacon-enhanced');

    const _myId = getMyUPeerId();
    // BUG AS fix: calcular el endTime absoluto una sola vez para que el inner
    // setTimeout use el tiempo *restante* en lugar de durationMs adicionales.
    // Sin esta corrección, el beacon corría min(durationMs,24h) + durationMs ms
    // (e.g., 2h configurados → 4h de ejecución real).
    const endTime = Date.now() + durationMs;
    const firstPhaseMs = Math.min(durationMs, 24 * 60 * 60 * 1000);

    // 1. Send broadcast UDP every 5 minutes
    const beaconInterval = setInterval(() => {
        sendEnhancedBeacon(sendSecureUDPMessage).catch(err => {
            error('Enhanced beacon failed', err, 'beacon-enhanced');
        });
    }, 5 * 60 * 1000);

    // 2. Start promiscuous listening mode
    startPromiscuousListening();

    // 3. After initial duration, reduce frequency
    setTimeout(() => {
        clearInterval(beaconInterval);
        // Reduce to every 30 minutes
        const reducedInterval = setInterval(() => {
            sendEnhancedBeacon(sendSecureUDPMessage).catch(err => {
                error('Enhanced beacon failed', err, 'beacon-enhanced');
            });
        }, 30 * 60 * 1000);

        // Stop completely after remaining time (not after durationMs again)
        const remaining = Math.max(0, endTime - Date.now());
        setTimeout(() => {
            clearInterval(reducedInterval);
            stopPromiscuousListening();
            network('Enhanced beacon mode ended', undefined, {}, 'beacon-enhanced');
        }, remaining);
    }, firstPhaseMs); // First phase: 24h or full duration
}

async function sendEnhancedBeacon(sendSecureUDPMessage: (ip: string, data: any) => void) {
    const myId = getMyUPeerId();
    // Import getMyPublicKeyHex dynamically to avoid circular dependency
    const { getMyPublicKeyHex } = await import('../../security/identity.js');
    const myPublicKey = getMyPublicKeyHex();

    const beaconData = {
        type: 'BEACON_ENHANCED',
        upeerId: myId,
        publicKey: myPublicKey,
        seekingContacts: true,
        timestamp: Date.now()
        // knownContacts removed for privacy reasons
    };

    network('Sending enhanced beacon', undefined, { myId }, 'beacon-enhanced');

    // Send to any known contact addresses (even if they might be stale)
    const allContacts = getContacts() as any[];
    for (const contact of allContacts) {
        if (contact.address) {
            sendSecureUDPMessage(contact.address, beaconData);
        }
    }
}

function startPromiscuousListening() {
    network('Starting promiscuous listening', undefined, {}, 'beacon');
    // In practice, this would:
    // 1. Listen on additional ports
    // 2. Accept connections from unknown sources
    // 3. Process any upeer protocol packets
}

function stopPromiscuousListening() {
    network('Stopping promiscuous listening', undefined, {}, 'beacon');
}

// Helper function for beacon mode

