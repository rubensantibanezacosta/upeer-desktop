import { warn } from '../../security/secure-logger.js';

type PendingDirectMessage = {
    messageId: string;
    upeerId: string;
    payload: string;
    knownAddresses: string[];
    replyTo?: string;
    timestamp: number;
    attempts: number;
};

const pendingDirectMessages = new Map<string, PendingDirectMessage>();
const retryingPeers = new Set<string>();

export function registerPendingDirectMessage(entry: Omit<PendingDirectMessage, 'attempts'>): void {
    pendingDirectMessages.set(entry.messageId, {
        ...entry,
        attempts: (pendingDirectMessages.get(entry.messageId)?.attempts ?? 0) + 1,
    });
}

export function clearPendingDirectMessage(messageId: string): void {
    pendingDirectMessages.delete(messageId);
}

export function resetPendingDirectMessages(): void {
    pendingDirectMessages.clear();
    retryingPeers.clear();
}

export async function retryPendingDirectMessages(upeerId: string): Promise<number> {
    if (retryingPeers.has(upeerId)) return 0;

    retryingPeers.add(upeerId);
    try {
        const pending = Array.from(pendingDirectMessages.values())
            .filter((entry) => entry.upeerId === upeerId)
            .sort((left, right) => left.timestamp - right.timestamp);

        if (pending.length === 0) return 0;

        const { resendPendingDirectMessage } = await import('./chatDirectDelivery.js');
        let retried = 0;

        for (const entry of pending) {
            try {
                await resendPendingDirectMessage(entry.upeerId, entry.payload, entry.knownAddresses, entry.replyTo, entry.messageId, entry.timestamp);
                retried += 1;
            } catch (err) {
                warn('Failed to retry pending direct message after DR_RESET', { upeerId, messageId: entry.messageId, err: String(err) }, 'security');
            }
        }

        return retried;
    } finally {
        retryingPeers.delete(upeerId);
    }
}