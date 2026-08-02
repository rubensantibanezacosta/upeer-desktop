import { getContacts } from '../../storage/contacts/operations.js';
import { getMyUPeerId } from '../../security/identity.js';
import { findNodeLocation } from './handlers.js';
import { network, error } from '../../security/secure-logger.js';

type ContactSnapshot = {
    upeerId: string;
    lastKnownIp: string;
    lastSeen: number;
};

type LanPeer = {
    upeerId: string;
    address: string;
};

type RediscoveryContact = {
    upeerId: string;
    address?: string;
    lastSeen?: number;
};

type PingPacket = { type: 'PING' };
type PongPacket = { type: 'PONG' };
type DhtQueryPacket = { type: 'DHT_QUERY'; targetId: string };
type DhtQueryResponsePacket = { type: 'DHT_QUERY_RESPONSE'; address?: string };
type BeaconEnhancedPacket = {
    type: 'BEACON_ENHANCED';
    upeerId: string;
    publicKey: string;
    seekingContacts: true;
    timestamp: number;
};

type RediscoveryPacket = PingPacket | PongPacket | DhtQueryPacket | DhtQueryResponsePacket | BeaconEnhancedPacket;

type SendRediscoveryPacket = (ip: string, data: RediscoveryPacket) => void;
type OnRediscoveryPacket = (handler: (ip: string, data: RediscoveryPacket) => void) => (() => void);

function getRecentContacts(days: number): ContactSnapshot[] {
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    return (getContacts() as RediscoveryContact[])
        .filter((contact): contact is RediscoveryContact & { lastSeen: number; address: string } =>
            !!contact.lastSeen && contact.lastSeen > cutoff && !!contact.address
        )
        .map(contact => ({
            upeerId: contact.upeerId,
            lastKnownIp: contact.address,
            lastSeen: contact.lastSeen,
        }))
        .sort((left, right) => right.lastSeen - left.lastSeen);
}

// Global state para response tracking
const pendingPongs = new Map<string, { resolve: (ok: boolean) => void; timer: ReturnType<typeof setTimeout> }>();
const pendingQueryResponses = new Map<string, { resolve: (result: { newIp?: string }) => void; timer: ReturnType<typeof setTimeout> }>();
let packetCleanup: (() => void) | null = null;
let handlerRegistered = false;

function ensurePacketHandler(onPacket: OnRediscoveryPacket): void {
    if (handlerRegistered) return;
    handlerRegistered = true;
    const cleanup = onPacket((ip: string, data: RediscoveryPacket) => {
        if (data.type === 'PONG') {
            const pending = pendingPongs.get(ip);
            if (pending) {
                clearTimeout(pending.timer);
                pending.resolve(true);
                pendingPongs.delete(ip);
            }
        } else if (data.type === 'DHT_QUERY_RESPONSE') {
            const pending = pendingQueryResponses.get(ip);
            if (pending) {
                clearTimeout(pending.timer);
                pending.resolve(data.address ? { newIp: data.address } : {});
                pendingQueryResponses.delete(ip);
            }
        }
    });
    if (typeof cleanup === 'function') {
        packetCleanup = cleanup;
    }
}

async function pingContact(ip: string, sendSecureUDPMessage: SendRediscoveryPacket, onPacket: OnRediscoveryPacket): Promise<boolean> {
    ensurePacketHandler(onPacket);
    return new Promise(resolve => {
        const existing = pendingPongs.get(ip);
        if (existing) clearTimeout(existing.timer);
        const timer = setTimeout(() => {
            pendingPongs.delete(ip);
            resolve(false);
        }, 5000);
        pendingPongs.set(ip, { resolve, timer });
        sendSecureUDPMessage(ip, { type: 'PING' });
    });
}

async function askAboutContact(contact: ContactSnapshot, targetId: string, sendSecureUDPMessage: SendRediscoveryPacket, onPacket: OnRediscoveryPacket): Promise<{ newIp?: string }> {
    ensurePacketHandler(onPacket);
    return new Promise(resolve => {
        const existing = pendingQueryResponses.get(contact.lastKnownIp);
        if (existing) clearTimeout(existing.timer);
        const timer = setTimeout(() => {
            pendingQueryResponses.delete(contact.lastKnownIp);
            resolve({});
        }, 3000);
        pendingQueryResponses.set(contact.lastKnownIp, { resolve, timer });
        sendSecureUDPMessage(contact.lastKnownIp, { type: 'DHT_QUERY', targetId });
    });
}

async function scanLanForUpeer(hours: number, _sendSecureUDPMessage: SendRediscoveryPacket, _onPacket: OnRediscoveryPacket): Promise<LanPeer[]> {
    network('Starting LAN scan', undefined, { duration: `${hours}h` }, 'lan-discovery');
    return [];
}

async function queryPeerForContact(peer: LanPeer, targetId: string, sendSecureUDPMessage: SendRediscoveryPacket, onPacket: OnRediscoveryPacket): Promise<string | null> {
    const result = await askAboutContact(
        { upeerId: peer.upeerId, lastKnownIp: peer.address, lastSeen: Date.now() },
        targetId,
        sendSecureUDPMessage,
        onPacket
    );
    return result.newIp ?? null;
}

async function sendBeaconBroadcast(_sendSecureUDPMessage: SendRediscoveryPacket) {
    const myId = getMyUPeerId();
    network('Sending beacon broadcast', undefined, { myId }, 'beacon');
}

function startBeaconMode(durationMs: number, sendSecureUDPMessage: SendRediscoveryPacket) {
    network('Starting beacon mode', undefined, { duration: `${durationMs}ms` }, 'beacon');
    const beaconInterval = setInterval(() => {
        sendBeaconBroadcast(sendSecureUDPMessage).catch(err => {
            error('Beacon broadcast failed', err, 'beacon');
        });
    }, 5 * 60 * 1000);
    setTimeout(() => {
        clearInterval(beaconInterval);
        network('Beacon mode ended', undefined, {}, 'beacon');
    }, durationMs);
}

function startPromiscuousListening() {
    network('Starting promiscuous listening', undefined, {}, 'beacon');
}

function stopPromiscuousListening() {
    network('Stopping promiscuous listening', undefined, {}, 'beacon');
}

async function sendEnhancedBeacon(sendSecureUDPMessage: SendRediscoveryPacket) {
    const myId = getMyUPeerId();
    const { getMyPublicKeyHex } = await import('../../security/identity.js');
    const myPublicKey = getMyPublicKeyHex();
    const beaconData: BeaconEnhancedPacket = {
        type: 'BEACON_ENHANCED',
        upeerId: myId,
        publicKey: myPublicKey,
        seekingContacts: true,
        timestamp: Date.now(),
    };
    network('Sending enhanced beacon', undefined, { myId }, 'beacon-enhanced');
    for (const contact of getContacts() as RediscoveryContact[]) {
        if (contact.address) {
            sendSecureUDPMessage(contact.address, beaconData);
        }
    }
}

export async function aggressiveRediscovery(myId: string, sendSecureUDPMessage: SendRediscoveryPacket, onPacket?: OnRediscoveryPacket): Promise<string | null> {
    network('Starting aggressive rediscovery', undefined, { myId }, 'rediscovery');

    const dhtLocation = await findNodeLocation(myId);
    if (dhtLocation?.address) {
        network('Found via persistent DHT', undefined, { myId, location: dhtLocation }, 'rediscovery');
        return dhtLocation.address;
    }

    if (!onPacket) return null;

    // Limpiar estado global
    for (const [, p] of pendingPongs) clearTimeout(p.timer);
    for (const [, p] of pendingQueryResponses) clearTimeout(p.timer);
    pendingPongs.clear();
    pendingQueryResponses.clear();
    if (packetCleanup) {
        packetCleanup();
        packetCleanup = null;
    }
    handlerRegistered = false;

    for (const contact of getRecentContacts(30)) {
        if (await pingContact(contact.lastKnownIp, sendSecureUDPMessage, onPacket)) {
            const response = await askAboutContact(contact, myId, sendSecureUDPMessage, onPacket);
            if (response && response.newIp) {
                network('Found via contact query', undefined, { myId, via: contact.upeerId, location: response.newIp }, 'rediscovery');
                return response.newIp;
            }
        }
    }

    for (const peer of await scanLanForUpeer(24, sendSecureUDPMessage, onPacket)) {
        const knownLocation = await queryPeerForContact(peer, myId, sendSecureUDPMessage, onPacket);
        if (knownLocation) {
            network('Found via LAN peer', undefined, { myId, via: peer.upeerId, location: knownLocation }, 'rediscovery');
            return knownLocation;
        }
    }

    startBeaconMode(24 * 60 * 60 * 1000, sendSecureUDPMessage);
    network('Entering beacon mode', undefined, { myId, duration: '24h' }, 'rediscovery');
    return null;
}

export function startEnhancedBeaconMode(durationMs: number, sendSecureUDPMessage: SendRediscoveryPacket) {
    network('Starting enhanced beacon mode', undefined, { duration: `${durationMs}ms` }, 'beacon-enhanced');
    const endTime = Date.now() + durationMs;
    const firstPhaseMs = Math.min(durationMs, 24 * 60 * 60 * 1000);
    const beaconInterval = setInterval(() => {
        sendEnhancedBeacon(sendSecureUDPMessage).catch(err => {
            error('Enhanced beacon failed', err, 'beacon-enhanced');
        });
    }, 5 * 60 * 1000);
    startPromiscuousListening();
    setTimeout(() => {
        clearInterval(beaconInterval);
        const reducedInterval = setInterval(() => {
            sendEnhancedBeacon(sendSecureUDPMessage).catch(err => {
                error('Enhanced beacon failed', err, 'beacon-enhanced');
            });
        }, 30 * 60 * 1000);
        const remaining = Math.max(0, endTime - Date.now());
        setTimeout(() => {
            clearInterval(reducedInterval);
            stopPromiscuousListening();
            network('Enhanced beacon mode ended', undefined, {}, 'beacon-enhanced');
        }, remaining);
    }, firstPhaseMs);
}