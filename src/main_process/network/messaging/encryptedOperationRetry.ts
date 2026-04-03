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
            if (entry.expiresAt < now) continue;

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