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
type DhtQueryPacket = { type: 'DHT_QUERY'; targetId: string };
type BeaconEnhancedPacket = {
    type: 'BEACON_ENHANCED';
    upeerId: string;
    publicKey: string;
    seekingContacts: true;
    timestamp: number;
};

type RediscoveryPacket = PingPacket | DhtQueryPacket | BeaconEnhancedPacket;

type SendRediscoveryPacket = (ip: string, data: RediscoveryPacket) => void;

function getRecentContacts(days: number): ContactSnapshot[] {
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    return (getContacts() as RediscoveryContact[])
        .filter(contact => contact.lastSeen && contact.lastSeen > cutoff && contact.address)
        .map(contact => ({
            upeerId: contact.upeerId,
            lastKnownIp: contact.address as string,
            lastSeen: contact.lastSeen,
        }))
        .sort((left, right) => right.lastSeen - left.lastSeen);
}

async function pingContact(ip: string, sendSecureUDPMessage: SendRediscoveryPacket): Promise<boolean> {
    return new Promise(resolve => {
        sendSecureUDPMessage(ip, { type: 'PING' });
        setTimeout(() => resolve(false), 5000);
    });
}

async function askAboutContact(contact: ContactSnapshot, targetId: string, sendSecureUDPMessage: SendRediscoveryPacket): Promise<{ newIp?: string }> {
    return new Promise(resolve => {
        sendSecureUDPMessage(contact.lastKnownIp, { type: 'DHT_QUERY', targetId });
        setTimeout(() => resolve({}), 3000);
    });
}

async function scanLanForUpeer(hours: number, _sendSecureUDPMessage: SendRediscoveryPacket): Promise<LanPeer[]> {
    network('Starting LAN scan', undefined, { duration: `${hours}h` }, 'lan-discovery');
    return [];
}

async function queryPeerForContact(peer: LanPeer, targetId: string, sendSecureUDPMessage: SendRediscoveryPacket): Promise<string | null> {
    return new Promise(resolve => {
        sendSecureUDPMessage(peer.address, { type: 'DHT_QUERY', targetId });
        setTimeout(() => resolve(null), 3000);
    });
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
    const beaconData = {
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

export async function aggressiveRediscovery(myId: string, sendSecureUDPMessage: SendRediscoveryPacket): Promise<string | null> {
    network('Starting aggressive rediscovery', undefined, { myId }, 'rediscovery');

    const dhtLocation = await findNodeLocation(myId);
    if (dhtLocation) {
        network('Found via persistent DHT', undefined, { myId, location: dhtLocation }, 'rediscovery');
        return dhtLocation;
    }

    for (const contact of getRecentContacts(30)) {
        if (await pingContact(contact.lastKnownIp, sendSecureUDPMessage)) {
            const response = await askAboutContact(contact, myId, sendSecureUDPMessage);
            if (response && response.newIp) {
                network('Found via contact query', undefined, { myId, via: contact.upeerId, location: response.newIp }, 'rediscovery');
                return response.newIp;
            }
        }
    }

    for (const peer of await scanLanForUpeer(24, sendSecureUDPMessage)) {
        const knownLocation = await queryPeerForContact(peer, myId, sendSecureUDPMessage);
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