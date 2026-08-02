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

const MAX_RETRY_ATTEMPTS = 10;
const MAX_PENDING_MESSAGES = 500;
const PENDING_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 días

const pendingDirectMessages = new Map<string, PendingDirectMessage>();
const retryingPeers = new Set<string>();

// BUG CHAT-RETRY fix: añadir límite máximo de reintentos y limpieza periódica.
// Sin límite, un mensaje que no puede entregarse (ej. contacto offline permanente)
// se reintenta cada vez que el peer reconecta, para siempre — consumiendo CPU
// y memoria sin progreso real. Además, la Map crece sin límite.
export function registerPendingDirectMessage(entry: Omit<PendingDirectMessage, 'attempts'>): void {
    // Limpieza TTL siempre: evitar fugas aunque el Map no esté lleno
    const now = Date.now();
    for (const [msgId, msg] of pendingDirectMessages.entries()) {
        if (now - msg.timestamp > PENDING_TTL_MS) {
            pendingDirectMessages.delete(msgId);
        }
    }
    // Limpieza LRU si el map supera el límite
    if (pendingDirectMessages.size >= MAX_PENDING_MESSAGES) {
        const entries = Array.from(pendingDirectMessages.entries())
            .sort(([, a], [, b]) => a.timestamp - b.timestamp);
        const toRemove = Math.ceil(MAX_PENDING_MESSAGES * 0.1); // eliminar 10% más viejos
        for (let i = 0; i < toRemove && i < entries.length; i++) {
            pendingDirectMessages.delete(entries[i][0]);
        }
    }

    const existing = pendingDirectMessages.get(entry.messageId);
    const attempts = (existing?.attempts ?? 0) + 1;

    if (attempts > MAX_RETRY_ATTEMPTS) {
        warn('Pending direct message exceeded max retry attempts, discarding', { messageId: entry.messageId, upeerId: entry.upeerId, attempts }, 'security');
        pendingDirectMessages.delete(entry.messageId);
        return;
    }

    pendingDirectMessages.set(entry.messageId, {
        ...entry,
        attempts,
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
                const result = await resendPendingDirectMessage(entry.upeerId, entry.payload, entry.knownAddresses, entry.replyTo, entry.messageId, entry.timestamp);
                if (result) {
                    clearPendingDirectMessage(entry.messageId);
                    retried += 1;
                }
            } catch (err) {
                warn('Failed to retry pending direct message after DR_RESET', { upeerId, messageId: entry.messageId, err: String(err) }, 'security');
            }
        }

        return retried;
    } finally {
        retryingPeers.delete(upeerId);
    }
}