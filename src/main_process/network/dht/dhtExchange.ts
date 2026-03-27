import { getContacts, getContactByUpeerId } from '../../storage/contacts/operations.js';
import { getMyUPeerId, incrementMyDhtSeq } from '../../security/identity.js';
import type { KademliaContact } from './kademlia/types.js';
import type { LocationBlock, RenewalToken } from '../types.js';
import {
    generateSignedLocationBlock,
    getDhtNetworkAddresses,
    getDeviceMetadata,
    isYggdrasilAddress,
} from '../utils.js';
import { getKademliaInstance, publishLocationBlock, findNodeLocation, iterativeFindNode } from './handlers.js';
import { network, warn } from '../../security/secure-logger.js';

let lastKnownAddresses: string[] = [];

type NetworkContactRecord = {
    upeerId: string;
    status: 'pending' | 'incoming' | 'connected' | 'offline' | 'blocked';
    address?: string;
    knownAddresses?: string | null;
    publicKey?: string;
    dhtSignature?: string | null;
    dhtSeq?: number | null;
    dhtExpiresAt?: number | null;
    renewalToken?: string | null;
    expiresAt?: number | null;
};

type DhtExchangePeer = {
    upeerId: string;
    publicKey: string;
    locationBlock: LocationBlock;
};

type DhtQueryPacket = {
    type: 'DHT_QUERY';
    targetId: string;
    referralContext: {
        requester: string;
        timestamp: number;
    };
};

type DhtUpdatePacket = {
    type: 'DHT_UPDATE';
    locationBlock: LocationBlock;
};

type DhtExchangePacket = {
    type: 'DHT_EXCHANGE';
    peers: DhtExchangePeer[];
};

type SendDhtPacket = (ip: string, data: DhtQueryPacket | DhtUpdatePacket | DhtExchangePacket) => void;

function distanceXor(idA: string, idB: string): bigint {
    try {
        return BigInt(`0x${idA}`) ^ BigInt(`0x${idB}`);
    } catch {
        return BigInt(0);
    }
}

function parseJsonValue<T>(value: string | null | undefined, fallback?: T): T | undefined {
    if (!value) {
        return fallback;
    }

    try {
        return JSON.parse(value) as T;
    } catch {
        return fallback;
    }
}

export function broadcastDhtUpdate(sendSecureUDPMessage: SendDhtPacket) {
    const addresses = getDhtNetworkAddresses();
    if (addresses.length === 0) {
        return;
    }

    const hasChanged = addresses.length !== lastKnownAddresses.length || !addresses.every(addr => lastKnownAddresses.includes(addr));
    if (!hasChanged) {
        return;
    }

    lastKnownAddresses = [...addresses];
    const newSeq = incrementMyDhtSeq();
    network('Network addresses changed', undefined, { addresses, newSeq }, 'dht');

    const deviceMeta = getDeviceMetadata();
    const locBlock = generateSignedLocationBlock(addresses, newSeq, undefined, undefined, deviceMeta);

    publishLocationBlock(locBlock).catch(err => {
        warn('Failed to publish location block', err, 'kademlia');
    });

    const connectedContacts = getContacts().filter(contact => contact.status === 'connected');
    for (const contact of connectedContacts) {
        const addressesToNotify = new Set<string>();
        if (contact.address && isYggdrasilAddress(contact.address)) {
            addressesToNotify.add(contact.address);
        }

        const knownAddresses = parseJsonValue<string[]>(contact.knownAddresses, contact.address ? [contact.address] : []);
        knownAddresses?.filter(isYggdrasilAddress).forEach(address => addressesToNotify.add(address));

        for (const address of addressesToNotify) {
            sendSecureUDPMessage(address, { type: 'DHT_UPDATE', locationBlock: locBlock });
        }
    }

    network('Multi-channel update propagated', undefined, { intimateContacts: connectedContacts.length }, 'dht');
}

export async function sendDhtExchange(targetUpeerId: string, sendSecureUDPMessage: SendDhtPacket) {
    const targetContact = await getContactByUpeerId(targetUpeerId);
    if (!targetContact || targetContact.status !== 'connected') {
        return;
    }

    const kademlia = getKademliaInstance();
    if (kademlia) {
        const closestContacts = kademlia
            .findClosestContacts(targetUpeerId, 5)
            .filter((contact: KademliaContact) => contact.upeerId !== targetUpeerId && !!contact.dhtSignature);

        const payload: DhtExchangePeer[] = await Promise.all(
            closestContacts.map(async (contact: KademliaContact) => {
                const dbContact = await getContactByUpeerId(contact.upeerId) as NetworkContactRecord | null;
                const knownAddresses = parseJsonValue<string[]>(dbContact?.knownAddresses, [contact.address]);
                const renewalToken = parseJsonValue<RenewalToken>(dbContact?.renewalToken);

                return {
                    upeerId: contact.upeerId,
                    publicKey: contact.publicKey,
                    locationBlock: {
                        address: contact.address,
                        addresses: knownAddresses || [contact.address],
                        dhtSeq: contact.dhtSeq,
                        signature: contact.dhtSignature,
                        expiresAt: dbContact?.dhtExpiresAt ?? undefined,
                        renewalToken,
                    },
                };
            })
        );

        if (payload.length > 0) {
            sendSecureUDPMessage(targetContact.address, { type: 'DHT_EXCHANGE', peers: payload });
        }
        return;
    }

    const payload: DhtExchangePeer[] = (getContacts() as NetworkContactRecord[])
        .filter(contact => contact.status === 'connected' && contact.dhtSignature && contact.upeerId !== targetUpeerId)
        .map(contact => ({
            upeerId: contact.upeerId,
            publicKey: contact.publicKey || '',
            locationBlock: {
                address: contact.address || '',
                dhtSeq: contact.dhtSeq || 0,
                signature: contact.dhtSignature,
                expiresAt: contact.dhtExpiresAt ?? undefined,
                renewalToken: parseJsonValue<RenewalToken>(contact.renewalToken),
            },
            dist: distanceXor(contact.upeerId, targetUpeerId),
        }))
        .sort((left, right) => (left.dist < right.dist ? -1 : left.dist > right.dist ? 1 : 0))
        .map(({ dist: _dist, ...data }) => data)
        .slice(0, 5);

    if (payload.length > 0) {
        sendSecureUDPMessage(targetContact.address, { type: 'DHT_EXCHANGE', peers: payload });
    }
}

export async function startDhtSearch(upeerId: string, sendSecureUDPMessage: SendDhtPacket) {
    network('Starting active DHT search', undefined, { upeerId }, 'dht-search');

    const location = await findNodeLocation(upeerId);
    if (location) {
        network('Found via DHT lookup', undefined, { upeerId, location }, 'kademlia');
        return;
    }

    const kademlia = getKademliaInstance();
    if (kademlia) {
        network('Starting iterative search', undefined, { upeerId }, 'kademlia');
        iterativeFindNode(upeerId, sendSecureUDPMessage).catch(err => {
            warn('Iterative search failed', err, 'kademlia');
        });
        return;
    }

    const queryTargets = (getContacts() as NetworkContactRecord[])
        .filter(contact => contact.status === 'connected' && contact.upeerId !== upeerId)
        .map(contact => ({
            upeerId: contact.upeerId,
            address: contact.address || '',
            dist: distanceXor(contact.upeerId, upeerId),
            hasRenewalToken: !!contact.renewalToken,
            expiresAt: contact.expiresAt,
        }))
        .sort((left, right) => {
            if (left.hasRenewalToken && !right.hasRenewalToken) {
                return -1;
            }
            if (!left.hasRenewalToken && right.hasRenewalToken) {
                return 1;
            }
            return left.dist < right.dist ? -1 : left.dist > right.dist ? 1 : 0;
        })
        .slice(0, 5);

    for (const target of queryTargets) {
        const packet: DhtQueryPacket = {
            type: 'DHT_QUERY',
            targetId: upeerId,
            referralContext: {
                requester: getMyUPeerId(),
                timestamp: Date.now(),
            },
        };
        sendSecureUDPMessage(target.address, packet);
    }
}