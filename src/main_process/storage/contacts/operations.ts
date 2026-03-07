import { getDb, getSchema, eq, desc } from '../shared.js';

export function getContactByRevelnestId(revelnestId: string) {
    const db = getDb();
    const schema = getSchema();
    
    return db.select().from(schema.contacts)
        .where(eq(schema.contacts.revelnestId, revelnestId))
        .get() as any;
}

export function getContactByAddress(address: string) {
    const db = getDb();
    const schema = getSchema();
    
    return db.select().from(schema.contacts)
        .where(eq(schema.contacts.address, address))
        .get() as any;
}

export function getContacts() {
    const db = getDb();
    const schema = getSchema();
    
    const contactsList = db.select().from(schema.contacts).all();
    const result = contactsList.map(c => {
        const lastMsgObj = db.select().from(schema.messages)
            .where(eq(schema.messages.chatRevelnestId, c.revelnestId || ''))
            .orderBy(desc(schema.messages.timestamp))
            .limit(1).get() as any;

        return {
            ...c,
            lastMessage: lastMsgObj?.message,
            lastMessageTime: lastMsgObj?.timestamp,
            lastMessageIsMine: lastMsgObj?.isMine,
            lastMessageStatus: lastMsgObj?.status
        };
    });

    result.sort((a, b) => {
        const tA = a.lastMessageTime ? new Date(a.lastMessageTime).getTime() : 0;
        const tB = b.lastMessageTime ? new Date(b.lastMessageTime).getTime() : 0;
        return tB - tA;
    });
    return result;
}

export function addOrUpdateContact(
    revelnestId: string, 
    address: string, 
    name: string, 
    publicKey?: string, 
    status: 'pending' | 'incoming' | 'connected' = 'connected', 
    ephemeralPublicKey?: string, 
    dhtSeq?: number, 
    dhtSignature?: string, 
    dhtExpiresAt?: number
) {
    const db = getDb();
    const schema = getSchema();
    
    return db.insert(schema.contacts).values({
        revelnestId,
        address,
        name,
        publicKey,
        ephemeralPublicKey,
        dhtSeq,
        dhtSignature,
        dhtExpiresAt,
        status
    }).onConflictDoUpdate({
        target: schema.contacts.revelnestId,
        set: { 
            address, 
            name, 
            publicKey, 
            ephemeralPublicKey,
            dhtSeq,
            dhtSignature,
            dhtExpiresAt,
            status 
        }
    }).run();
}

export function deleteContact(revelnestId: string) {
    const db = getDb();
    const schema = getSchema();
    
    return db.delete(schema.contacts).where(eq(schema.contacts.revelnestId, revelnestId)).run();
}