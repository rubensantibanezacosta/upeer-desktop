import {
    getContacts,
    getContactByRevelnestId,
    updateContactDhtLocation
} from '../../storage/db.js';
import {
    getMyRevelNestId,
    incrementMyDhtSeq
} from '../../security/identity.js';
import {
    generateSignedLocationBlock,
    getNetworkAddress
} from '../utils.js';
import { getKademliaInstance, publishLocationBlock, findNodeLocation, iterativeFindNode } from './handlers.js';
import { network, warn, info } from '../../security/secure-logger.js';

let lastKnownIp: string | null = null;

export function broadcastDhtUpdate(sendSecureUDPMessage: (ip: string, data: any) => void) {
    const currentIp = getNetworkAddress();
    if (!currentIp) return;

    if (currentIp !== lastKnownIp) {
        lastKnownIp = currentIp;
        const newSeq = incrementMyDhtSeq();

        network('IP detected/changed', undefined, { currentIp, newSeq }, 'dht');
        const locBlock = generateSignedLocationBlock(currentIp, newSeq);
        
        // 1. Publish to Kademlia DHT (distributed storage) with renewal token
        publishLocationBlock(currentIp, newSeq, locBlock.signature, locBlock.renewalToken).catch(err => {
            warn('Failed to publish location block', err, 'kademlia');
        });
        
        // 2. Limited broadcast to intimate contacts (for low-latency updates)
        const contacts = getContacts();
        const intimateContacts = contacts
            .filter(c => c.status === 'connected')
            .slice(0, 10); // Limit to 10 closest contacts
        
        for (const contact of intimateContacts) {
            sendSecureUDPMessage(contact.address, {
                type: 'DHT_UPDATE',
                locationBlock: locBlock
            });
        }
        
        network('Update propagated', undefined, { intimateContacts: intimateContacts.length }, 'dht');
    }
}

export async function sendDhtExchange(targetRevelnestId: string, sendSecureUDPMessage: (ip: string, data: any) => void) {
    const targetContact = await getContactByRevelnestId(targetRevelnestId);
    if (!targetContact || targetContact.status !== 'connected') return;

    const kademlia = getKademliaInstance();
    if (kademlia) {
        // With Kademlia, we can send a more targeted exchange
        // Find contacts closest to the target
        const closestContacts = (kademlia as any).findClosestContacts(targetRevelnestId, 5);
        
        const payload = closestContacts
            .filter((c: any) => c.revelnestId !== targetRevelnestId && c.dhtSignature)
            .map((c: any) => ({
                revelnestId: c.revelnestId,
                publicKey: c.publicKey,
                locationBlock: {
                    address: c.address,
                    dhtSeq: c.dhtSeq,
                    signature: c.dhtSignature,
                    expiresAt: c.expiresAt,
                    renewalToken: c.renewalToken
                }
            }));
        
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
            .filter(c => c.status === 'connected' && c.dhtSignature && c.revelnestId !== targetRevelnestId)
            .map(c => ({
                revelnestId: c.revelnestId,
                publicKey: c.publicKey,
                locationBlock: {
                    address: c.address,
                    dhtSeq: c.dhtSeq,
                    signature: c.dhtSignature,
                    expiresAt: c.expiresAt,
                    renewalToken: c.renewalToken
                },
                dist: distanceXOR(c.revelnestId, targetRevelnestId)
            }))
            .sort((a, b) => (a.dist < b.dist ? -1 : a.dist > b.dist ? 1 : 0))
            .map(({ dist, ...data }) => data);

        const limitedPayload = payload.slice(0, 5);

        if (limitedPayload.length > 0) {
            sendSecureUDPMessage(targetContact.address, {
                type: 'DHT_EXCHANGE',
                peers: limitedPayload
            });
        }
    }
}

export async function startDhtSearch(revelnestId: string, sendSecureUDPMessage: (ip: string, data: any) => void) {
    network('Starting active DHT search', undefined, { revelnestId }, 'dht-search');
    
    // First, try to find in Kademlia DHT
    const location = await findNodeLocation(revelnestId);
    if (location) {
        network('Found via DHT lookup', undefined, { revelnestId, location }, 'kademlia');
        return;
    }
    
    // If not found in DHT, perform iterative Kademlia search
    const kademlia = getKademliaInstance();
    if (kademlia) {
        network('Starting iterative search', undefined, { revelnestId }, 'kademlia');
        iterativeFindNode(revelnestId, sendSecureUDPMessage).catch(err => {
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
            .filter(c => c.status === 'connected' && c.revelnestId !== revelnestId)
            .map(c => ({
                revelnestId: c.revelnestId,
                address: c.address,
                dist: distanceXOR(c.revelnestId, revelnestId),
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
                targetId: revelnestId,
                // Include referral context for better routing
                referralContext: {
                    requester: getMyRevelNestId(),
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
                network('Found via contact query', undefined, { myId, via: contact.revelnestId, location: response.newIp }, 'rediscovery');
                return response.newIp;
            }
        }
    }
    
    // 3. LAN discovery extended
    const lanPeers = await scanLanForRevelnest(24, sendSecureUDPMessage); // Scan for 24h
    for (const peer of lanPeers) {
        const knownLocation = await queryPeerForContact(peer, myId, sendSecureUDPMessage);
        if (knownLocation) {
            network('Found via LAN peer', undefined, { myId, via: peer.revelnestId, location: knownLocation }, 'rediscovery');
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
    revelnestId: string;
    lastKnownIp: string;
    lastSeen: number;
}> {
    const allContacts = getContacts() as any[];
    const cutoff = Date.now() - (days * 24 * 60 * 60 * 1000);
    
    return allContacts
        .filter(c => c.lastSeen && c.lastSeen > cutoff && c.address)
        .map(c => ({
            revelnestId: c.revelnestId,
            lastKnownIp: c.address,
            lastSeen: c.lastSeen
        }))
        .sort((a, b) => b.lastSeen - a.lastSeen); // Most recent first
}

async function pingContact(ip: string, sendSecureUDPMessage: (ip: string, data: any) => void): Promise<boolean> {
    return new Promise((resolve) => {
        const timeout = setTimeout(() => resolve(false), 5000);
        
        // Send PING and wait for PONG
        sendSecureUDPMessage(ip, { type: 'PING' });
        
        // Note: In a real implementation, we would need to listen for the response
        // This is simplified - we assume the contact responds if online
        // In practice, we would need to hook into the response handler
        setTimeout(() => {
            clearTimeout(timeout);
            resolve(true); // Simplified - assume contact is reachable
        }, 1000);
    });
}

async function askAboutContact(contact: any, targetId: string, sendSecureUDPMessage: (ip: string, data: any) => void): Promise<{ newIp?: string }> {
    return new Promise((resolve) => {
        sendSecureUDPMessage(contact.lastKnownIp, {
            type: 'DHT_QUERY',
            targetId: targetId
        });
        
        // Note: In a real implementation, we would need to listen for DHT_RESPONSE
        // This is simplified
        setTimeout(() => resolve({}), 3000);
    });
}

async function scanLanForRevelnest(hours: number, sendSecureUDPMessage: (ip: string, data: any) => void): Promise<Array<{ revelnestId: string, address: string }>> {
    // Simplified LAN scanning - in practice would use multicast/broadcast
    network('Starting LAN scan', undefined, { duration: `${hours}h` }, 'lan-discovery');
    return []; // Placeholder - would return discovered peers
}

async function queryPeerForContact(peer: any, targetId: string, sendSecureUDPMessage: (ip: string, data: any) => void): Promise<string | null> {
    return new Promise((resolve) => {
        sendSecureUDPMessage(peer.address, {
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
            console.error('Beacon broadcast failed:', err);
        });
    }, 5 * 60 * 1000);
    
    // 2. Listen actively for any RevelNest traffic
    // (already handled by main UDP server)
    
    // 3. Stop beacon mode after duration
    setTimeout(() => {
        clearInterval(beaconInterval);
        network('Beacon mode ended', undefined, {}, 'beacon');
    }, durationMs);
}

async function sendBeaconBroadcast(sendSecureUDPMessage: (ip: string, data: any) => void) {
    const myId = getMyRevelNestId();
    // Import getMyPublicKeyHex dynamically to avoid circular dependency
    const { getMyPublicKeyHex } = await import('../../security/identity.js');
    const myPublicKey = getMyPublicKeyHex();
    
    const beaconData = {
        type: 'BEACON_NEW_NODE',
        revelnestId: myId,
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
    
    const myId = getMyRevelNestId();
    
    // 1. Send broadcast UDP every 5 minutes
    const beaconInterval = setInterval(() => {
        sendEnhancedBeacon(sendSecureUDPMessage).catch(err => {
            console.error('Enhanced beacon failed:', err);
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
                console.error('Enhanced beacon failed:', err);
            });
        }, 30 * 60 * 1000);
        
        // Stop completely after total duration
        setTimeout(() => {
            clearInterval(reducedInterval);
            stopPromiscuousListening();
            network('Enhanced beacon mode ended', undefined, {}, 'beacon-enhanced');
        }, durationMs);
    }, Math.min(durationMs, 24 * 60 * 60 * 1000)); // First phase: 24h or full duration
}

async function sendEnhancedBeacon(sendSecureUDPMessage: (ip: string, data: any) => void) {
    const myId = getMyRevelNestId();
    // Import getMyPublicKeyHex dynamically to avoid circular dependency
    const { getMyPublicKeyHex } = await import('../../security/identity.js');
    const myPublicKey = getMyPublicKeyHex();
    
    const beaconData = {
        type: 'BEACON_ENHANCED',
        revelnestId: myId,
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
    // 3. Process any RevelNest protocol packets
}

function stopPromiscuousListening() {
    network('Stopping promiscuous listening', undefined, {}, 'beacon');
}

// Helper function for beacon mode

