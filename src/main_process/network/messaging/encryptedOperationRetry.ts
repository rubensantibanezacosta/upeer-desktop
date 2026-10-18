import { warn } from '../../security/secure-logger.js';

type PendingEncryptedOperation = {
    key: string;
    upeerId: string;
    retry: () => Promise<void>;
    expiresAt: number;
};

const pendingEncryptedOperations = new Map<string, PendingEncryptedOperation>();
const retryingPeers = new Set<string>();

export function registerEncryptedOperationRetry(
    upeerId: string,
    key: string,
    retry: () => Promise<void>,
    ttlMs = 30_000,
): void {
    pendingEncryptedOperations.set(`${upeerId}:${key}`, {
        key,
        upeerId,
        retry,
        expiresAt: Date.now() + ttlMs,
    });
}

export function resetEncryptedOperationRetries(): void {
    pendingEncryptedOperations.clear();
    retryingPeers.clear();
}

export async function retryPendingEncryptedOperations(upeerId: string): Promise<number> {
    if (retryingPeers.has(upeerId)) return 0;

    retryingPeers.add(upeerId);
    try {
        const now = Date.now();
        const entries = Array.from(pendingEncryptedOperations.entries())
            .filter(([, entry]) => entry.upeerId === upeerId);

        let retried = 0;
        for (const [mapKey, entry] of entries) {
            if (entry.expiresAt < now) {
                pendingEncryptedOperations.delete(mapKey);
                continue;
            }

            try {
                await entry.retry();
                pendingEncryptedOperations.delete(mapKey);
                retried += 1;
            } catch (err) {
                warn('Failed to retry encrypted operation after DR_RESET', { upeerId, key: entry.key, err: String(err) }, 'security');
            }
        }

        return retried;
    } finally {
        retryingPeers.delete(upeerId);
    }
}

export async function retryPendingGroupEncryptedOperations(upeerId: string, groupId: string): Promise<number> {
    const retryPeerKey = `${upeerId}:group:${groupId}`;
    if (retryingPeers.has(upeerId) || retryingPeers.has(retryPeerKey)) return 0;

    retryingPeers.add(retryPeerKey);
    try {
        const entries = Array.from(pendingEncryptedOperations.entries())
            .filter(([, entry]) => entry.upeerId === upeerId && entry.key.startsWith(`group:${groupId}:`));
        let retried = 0;
        for (const [mapKey, entry] of entries) {
            if (entry.expiresAt < Date.now()) {
                pendingEncryptedOperations.delete(mapKey);
                continue;
            }
            try {
                await entry.retry();
                pendingEncryptedOperations.delete(mapKey);
                retried += 1;
            } catch (err) {
                warn('Failed to retry group encrypted operation after DR_RESET', { upeerId, groupId, key: entry.key, err: String(err) }, 'security');
            }
        }
        return retried;
    } finally {
        retryingPeers.delete(retryPeerKey);
    }
}

export function clearPendingGroupEncryptedOperations(upeerId: string, groupId: string): number {
    const groupPrefix = `group:${groupId}:`;
    let removed = 0;
    for (const [mapKey, entry] of pendingEncryptedOperations) {
        if (entry.upeerId === upeerId && entry.key.startsWith(groupPrefix)) {
            pendingEncryptedOperations.delete(mapKey);
            removed += 1;
        }
    }
    return removed;
}