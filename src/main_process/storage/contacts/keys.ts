import { getDb, getSchema, eq } from '../shared.js';

export function updateContactPublicKey(revelnestId: string, publicKey: string) {
    const db = getDb();
    const schema = getSchema();
    
    return db.update(schema.contacts)
        .set({ publicKey, status: 'connected' })
        .where(eq(schema.contacts.revelnestId, revelnestId))
        .run();
}

export function updateContactEphemeralPublicKey(revelnestId: string, ephemeralPublicKey: string) {
    const db = getDb();
    const schema = getSchema();
    
    return db.update(schema.contacts)
        .set({ ephemeralPublicKey })
        .where(eq(schema.contacts.revelnestId, revelnestId))
        .run();
}