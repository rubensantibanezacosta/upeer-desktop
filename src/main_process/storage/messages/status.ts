import { getDb, getSchema, eq } from '../shared.js';

export function updateMessageStatus(id: string, status: 'sent' | 'delivered' | 'read') {
    const db = getDb();
    const schema = getSchema();
    
    return db.update(schema.messages)
        .set({ status })
        .where(eq(schema.messages.id, id))
        .run();
}

export function getMessageStatus(id: string) {
    const db = getDb();
    const schema = getSchema();
    
    const msg = db.select({ status: schema.messages.status })
        .from(schema.messages)
        .where(eq(schema.messages.id, id))
        .get();
    return msg ? (msg as any).status : null;
}