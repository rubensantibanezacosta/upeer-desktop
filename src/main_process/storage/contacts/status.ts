import { getDb, getSchema, eq } from '../shared.js';

export function updateContactStatus(upeerId: string, status: 'pending' | 'incoming' | 'connected') {
    const db = getDb();
    const schema = getSchema();
    
    return db.update(schema.contacts)
        .set({ status })
        .where(eq(schema.contacts.upeerId, upeerId))
        .run();
}

export function updateLastActive(upeerId: string, activeAt: number) {
    if (!Number.isFinite(activeAt) || activeAt <= 0) return Promise.resolve();
    const db = getDb();
    const schema = getSchema();
    const iso = new Date(Math.min(activeAt, Date.now())).toISOString();

    return db.update(schema.contacts)
        .set({ lastActive: iso })
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