import { BrowserWindow } from 'electron';
import { error } from '../../security/secure-logger.js';
import { getKademliaInstance } from './shared.js';
import { handleDhtFoundNodes, handleDhtFoundValue } from './pendingQueries.js';
import { handleDhtExchange, handleDhtQuery, handleDhtResponse, handleDhtUpdate } from './legacyHandlers.js';
import type { KademliaContactInfo, LocationBlock } from '../types.js';

type DhtFoundNodesPayload = {
    queryId?: string;
    nodes?: KademliaContactInfo[];
};

type DhtFoundValuePayload = {
    queryId?: string;
    value?: unknown;
};

type DhtLegacyPacket = {
    type?: string;
    targetId?: string;
    locationBlock?: Record<string, unknown>;
    neighbors?: Array<Record<string, unknown>>;
    peers?: Array<Record<string, unknown>>;
    referralContext?: unknown;
    queryId?: string;
    value?: unknown;
    nodes?: KademliaContactInfo[];
    publicKey?: string;
};

type RouterSendResponse = (ip: string, data: Record<string, unknown>) => void;

type KademliaPacketHandler = {
    handleMessage: (senderUpeerId: string, data: unknown, senderAddress: string) => Promise<Record<string, unknown> | null>;
};

type DhtLocationBlock = LocationBlock & {
    powProof?: string;
};

type KademliaLegacyLookup = {
    storeLocationBlock: (upeerId: string, block: DhtLocationBlock) => Promise<void>;
    findLocationBlock: (upeerId: string) => Promise<DhtLocationBlock | null>;
    findClosestContacts?: (targetId: string, count: number) => Array<{
        upeerId: string;
        address: string;
        publicKey: string;
    }>;
};

function getLegacyKademliaInstance(): KademliaLegacyLookup | null {
    const instance = getKademliaInstance();
    if (!instance) return null;

    return {
        storeLocationBlock: (upeerId, block) => instance.storeLocationBlock(upeerId, block),
        findLocationBlock: async (upeerId) => {
            const block = await instance.findLocationBlock(upeerId);
            return block as DhtLocationBlock | null;
        },
        findClosestContacts: typeof instance.findClosestContacts === 'function'
            ? (targetId, count) => instance.findClosestContacts(targetId, count).map((contact) => ({
                upeerId: contact.upeerId,
                address: contact.address,
                publicKey: contact.publicKey,
            }))
            : undefined,
    };
}

export async function handleDhtPacket(
    type: string,
    data: DhtLegacyPacket,
    senderUpeerId: string,
    senderAddress: string,
    win: BrowserWindow | null,
    sendResponse: RouterSendResponse
): Promise<boolean> {
    const kademlia = getKademliaInstance() as KademliaPacketHandler | null;
    const legacyKademlia = getLegacyKademliaInstance();
    if (!kademlia) return false;

    try {
        if (type === 'DHT_UPDATE') {
            await handleDhtUpdate(senderUpeerId, data as { locationBlock?: DhtLocationBlock }, () => legacyKademlia, win);
            return true;
        }
        if (type === 'DHT_EXCHANGE') {
            await handleDhtExchange(senderUpeerId, data);
            return true;
        }
        if (type === 'DHT_QUERY') {
            await handleDhtQuery(senderUpeerId, data, senderAddress, sendResponse, () => legacyKademlia);
            return true;
        }
        if (type === 'DHT_RESPONSE') {
            await handleDhtResponse(data as {
                targetId?: string;
                publicKey?: string;
                locationBlock?: import('../types.js').LocationBlock;
                neighbors?: Array<{
                    upeerId?: string;
                    address?: string;
                    publicKey?: string;
                    locationBlock?: import('../types.js').LocationBlock;
                }>;
            }, sendResponse);
            return true;
        }
        if (type === 'DHT_FOUND_NODES') {
            handleDhtFoundNodes(data as DhtFoundNodesPayload, senderAddress, getKademliaInstance);
            return true;
        }
        if (type === 'DHT_FOUND_VALUE') {
            handleDhtFoundValue(data as DhtFoundValuePayload, senderAddress);
            return true;
        }
        if (type.startsWith('DHT_')) {
            const response = await kademlia.handleMessage(senderUpeerId, data, senderAddress);
            if (response) {
                sendResponse(senderAddress, response);
            }
            return true;
        }
    } catch (err) {
        error(`Error handling ${type}`, err, 'dht');
    }

    return false;
}
