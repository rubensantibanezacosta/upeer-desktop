import { getDb, getSchema, eq, and } from '../shared.js';
import { emitSyncEvent } from '../sync/eventSink.js';

export function saveReaction(messageId: string, upeerId: string, emoji: string) {
    const db = getDb();
    const schema = getSchema();

    const existing = db.select().from(schema.reactions)
        .where(and(
            eq(schema.reactions.messageId, messageId),
            eq(schema.reactions.upeerId, upeerId),
            eq(schema.reactions.emoji, emoji)
        )).get();

    if (!existing) {
        const result = db.insert(schema.reactions).values({
            messageId,
            upeerId,
            emoji,
            timestamp: Date.now()
        }).run();
        if ((result?.changes ?? 0) > 0) {
            emitSyncEvent('REACTION_SET', { messageId, upeerId, emoji, remove: false });
        }
        return result;
    }
}

export function deleteReaction(messageId: string, upeerId: string, emoji: string) {
    const db = getDb();
    const schema = getSchema();

    const result = db.delete(schema.reactions)
        .where(and(
            eq(schema.reactions.messageId, messageId),
            eq(schema.reactions.upeerId, upeerId),
            eq(schema.reactions.emoji, emoji)
        )).run();
    if ((result?.changes ?? 0) > 0) {
        emitSyncEvent('REACTION_SET', { messageId, upeerId, emoji, remove: true });
    }
    return result;
}

export function getReactionsForMessage(messageId: string): Array<{ upeerId: string; emoji: string; timestamp: number }> {
    const db = getDb();
    const schema = getSchema();
    return db.select().from(schema.reactions)
        .where(eq(schema.reactions.messageId, messageId))
        .all() as Array<{ upeerId: string; emoji: string; timestamp: number }>;
}