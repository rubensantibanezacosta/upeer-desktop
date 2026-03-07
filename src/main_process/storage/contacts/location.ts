import { getDb, getSchema, eq } from '../shared.js';

export function updateContactLocation(revelnestId: string, address: string) {
    const db = getDb();
    const schema = getSchema();
    
    return db.update(schema.contacts)
        .set({ address, lastSeen: new Date().toISOString() })
        .where(eq(schema.contacts.revelnestId, revelnestId))
        .run();
}

export function updateContactDhtLocation(
    revelnestId: string, 
    address: string, 
    dhtSeq: number, 
    dhtSignature: string, 
    dhtExpiresAt?: number,
    renewalToken?: any
) {
    const db = getDb();
    const schema = getSchema();
    
    const updateData: any = { address, dhtSeq, dhtSignature, lastSeen: new Date().toISOString() };
    if (dhtExpiresAt !== undefined) {
        updateData.dhtExpiresAt = dhtExpiresAt;
    }
    if (renewalToken !== undefined) {
        updateData.renewalToken = JSON.stringify(renewalToken);
    }
    return db.update(schema.contacts)
        .set(updateData)
        .where(eq(schema.contacts.revelnestId, revelnestId))
        .run();
}