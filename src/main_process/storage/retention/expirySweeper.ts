import { getDb, getSchema, runTransaction, sql } from '../shared.js';
import { debug, error } from '../../security/secure-logger.js';

const EXPIRED_CLAUSE = sql`expires_at IS NOT NULL AND expires_at > 0 AND expires_at <= `;

export function sweepExpiredMessages(now = Date.now()): string[] {
    try {
        const db = getDb();
        const schema = getSchema();

        const expired = db.select({ chatUpeerId: schema.messages.chatUpeerId })
            .from(schema.messages)
            .where(sql`${EXPIRED_CLAUSE}${now}`)
            .all() as { chatUpeerId: string }[];

        if (expired.length === 0) return [];

        const chatIds = [...new Set(expired.map((row) => row.chatUpeerId).filter(Boolean))];

        runTransaction(() => {
            db.delete(schema.reactions)
                .where(sql`message_id IN (SELECT id FROM messages WHERE expires_at IS NOT NULL AND expires_at > 0 AND expires_at <= ${now})`)
                .run();
            db.delete(schema.messages)
                .where(sql`${EXPIRED_CLAUSE}${now}`)
                .run();
        });

        debug('Mensajes temporales borrados', { messages: expired.length, chats: chatIds.length }, 'storage');
        return chatIds;
    } catch (err) {
        error('No se pudieron borrar los mensajes temporales', err, 'storage');
        return [];
    }
}

export interface ExpirySweeperOptions {
    intervalMs?: number;
    onExpired: (chatIds: string[]) => void;
}

export function startExpirySweeper({ intervalMs = 60_000, onExpired }: ExpirySweeperOptions): () => void {
    const run = () => {
        const chatIds = sweepExpiredMessages();
        if (chatIds.length > 0) onExpired(chatIds);
    };

    run();
    const timer = setInterval(run, intervalMs);
    timer.unref?.();

    return () => clearInterval(timer);
}
