import { getDb, getSchema, eq, and } from '../shared.js';

export function saveReaction(messageId: string, upeerId: string, emoji: string) {
    const db = getDb();
    const schema = getSchema();
    
    // Evitar duplicados del mismo usuario con el mismo emoji
    const existing = db.select().from(schema.reactions)
        .where(and(
            eq(schema.reactions.messageId, messageId),
            eq(schema.reactions.upeerId, upeerId),
            eq(schema.reactions.emoji, emoji)
        )).get();

    if (!existing) {
        return db.insert(schema.reactions).values({
            messageId,
            upeerId,
            emoji
        }).run();
    }
}

export function deleteReaction(messageId: string, upeerId: string, emoji: string) {
    const db = getDb();
    const schema = getSchema();
    
    return db.delete(schema.reactions)
        .where(and(
            eq(schema.reactions.messageId, messageId),
            eq(schema.reactions.upeerId, upeerId),
            eq(schema.reactions.emoji, emoji)
        )).run();
}