import { toKademliaId, type KademliaContact } from './kademlia/types.js';
import type { KademliaContactInfo } from '../types.js';

type DhtFoundNodesResult = {
    nodes: KademliaContactInfo[];
    senderAddress: string;
};

type DhtFoundValueResult = {
    value: unknown;
    senderAddress: string;
};

type PendingQueryResult = DhtFoundNodesResult | DhtFoundValueResult;

type PendingQuery = {
    resolve: (value: PendingQueryResult) => void;
    reject: (error: Error) => void;
    type: string;
    targetId: string;
    timestamp: number;
    timeoutId?: NodeJS.Timeout;
};

type DhtFoundNodesData = {
    queryId?: string;
    nodes?: KademliaContactInfo[];
};

type DhtFoundValueData = {
    queryId?: string;
    value?: unknown;
};

type KademliaQueryUpdater = {
    addContact: (contact: KademliaContact) => void;
};

export const pendingQueries = new Map<string, PendingQuery>();

export function cleanupPendingQueries(): void {
    const now = Date.now();
    const timeout = 30_000;
    for (const [queryId, query] of pendingQueries.entries()) {
        if (now - query.timestamp > timeout) {
            query.reject(new Error('Query timeout'));
            pendingQueries.delete(queryId);
        }
    }
}

export function handleDhtFoundNodes(data: DhtFoundNodesData, senderAddress: string, getKademliaInstance: () => KademliaQueryUpdater | null): void {
    if (data.queryId) {
        const query = pendingQueries.get(data.queryId);
        if (query) {
            if (query.timeoutId) clearTimeout(query.timeoutId);
            pendingQueries.delete(data.queryId);
            query.resolve({ nodes: data.nodes ?? [], senderAddress });
        }
    }

    const kademlia = getKademliaInstance();
    if (kademlia && data.nodes) {
        for (const node of data.nodes) {
            if (node.upeerId && node.address && node.publicKey) {
                kademlia.addContact({
                    nodeId: toKademliaId(node.upeerId),
                    upeerId: node.upeerId,
                    address: node.address,
                    publicKey: node.publicKey,
                    lastSeen: Date.now(),
                });
            }
        }
    }
}

export function handleDhtFoundValue(data: DhtFoundValueData, senderAddress: string): void {
    if (!data.queryId) {
        return;
    }

    const query = pendingQueries.get(data.queryId);
    if (!query) {
        return;
    }

    if (query.timeoutId) clearTimeout(query.timeoutId);
    pendingQueries.delete(data.queryId);
    query.resolve({ value: data.value, senderAddress });
}
