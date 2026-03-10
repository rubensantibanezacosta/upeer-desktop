import { getDb, getSchema, eq } from '../shared.js';

export function updateContactStatus(upeerId: string, status: 'pending' | 'incoming' | 'connected') {
    const db = getDb();
    const schema = getSchema();
    
    return db.update(schema.contacts)
        .set({ status })
        .where(eq(schema.contacts.upeerId, upeerId))
        .run();
}

export function updateLastSeen(upeerId: string) {
    const db = getDb();
    const schema = getSchema();
    
    return db.update(schema.contacts)
        .set({ lastSeen: new Date().toISOString() })
        .where(eq(schema.contacts.upeerId, upeerId))
        .run();
}