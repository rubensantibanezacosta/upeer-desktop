export const pendingQueries = new Map<string, {
    resolve: (value: any) => void;
    reject: (error: any) => void;
    type: string;
    targetId: string;
    timestamp: number;
    timeoutId?: NodeJS.Timeout;
}>();

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

export function handleDhtFoundNodes(data: any, senderAddress: string, getKademliaInstance: () => any): void {
    if (data.queryId) {
        const query = pendingQueries.get(data.queryId);
        if (query) {
            if (query.timeoutId) clearTimeout(query.timeoutId);
            pendingQueries.delete(data.queryId);
            query.resolve({ nodes: data.nodes, senderAddress });
        }
    }

    const kademlia = getKademliaInstance();
    if (kademlia && data.nodes) {
        const kademliaInstance = kademlia as any;
        for (const node of data.nodes) {
            if (node.upeerId && node.address && node.publicKey) {
                kademliaInstance.updateContactFromMessage?.(node.upeerId, node.address);
            }
        }
    }
}

export function handleDhtFoundValue(data: any, senderAddress: string): void {
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
