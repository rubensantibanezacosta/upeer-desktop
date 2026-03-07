import { getDb, getSchema, eq } from '../shared.js';

export function updateContactStatus(revelnestId: string, status: 'pending' | 'incoming' | 'connected') {
    const db = getDb();
    const schema = getSchema();
    
    return db.update(schema.contacts)
        .set({ status })
        .where(eq(schema.contacts.revelnestId, revelnestId))
        .run();
}

export function updateLastSeen(revelnestId: string) {
    const db = getDb();
    const schema = getSchema();
    
    return db.update(schema.contacts)
        .set({ lastSeen: new Date().toISOString() })
        .where(eq(schema.contacts.revelnestId, revelnestId))
        .run();
}