import { getDb, getSchema, eq, desc } from '../shared.js';

export function getContactByUpeerId(upeerId: string) {
    const db = getDb();
    const schema = getSchema();

    return db.select().from(schema.contacts)
        .where(eq(schema.contacts.upeerId, upeerId))
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
            .where(eq(schema.messages.chatUpeerId, c.upeerId || ''))
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
    upeerId: string,
    address: string,
    name: string,
    publicKey?: string,
    status: 'pending' | 'incoming' | 'connected' | 'offline' = 'connected',
    ephemeralPublicKey?: string,
    dhtSeq?: number,
    dhtSignature?: string,
    dhtExpiresAt?: number
) {
    const db = getDb();
    const schema = getSchema();

    // Merge address into knownAddresses when upserting.
    const existing = db.select({ knownAddresses: schema.contacts.knownAddresses })
        .from(schema.contacts)
        .where(eq(schema.contacts.upeerId, upeerId))
        .get() as { knownAddresses: string } | undefined;

    let known: string[] = [];
    try { known = JSON.parse(existing?.knownAddresses ?? '[]'); } catch { known = []; }
    if (!known.includes(address)) {
        known.unshift(address);
        if (known.length > 20) known = known.slice(0, 20);
    }
    const knownAddresses = JSON.stringify(known);

    const now = new Date().toISOString();
    const ephemeralPublicKeyUpdatedAt = ephemeralPublicKey ? now : undefined;

    return db.insert(schema.contacts).values({
        upeerId,
        address,
        name,
        publicKey,
        ephemeralPublicKey,
        ephemeralPublicKeyUpdatedAt,
        dhtSeq,
        dhtSignature,
        dhtExpiresAt,
        knownAddresses,
        status
    }).onConflictDoUpdate({
        target: schema.contacts.upeerId,
        set: {
            address,
            name,
            publicKey,
            ...(ephemeralPublicKey ? { ephemeralPublicKey, ephemeralPublicKeyUpdatedAt: now } : {}),
            dhtSeq,
            dhtSignature,
            dhtExpiresAt,
            knownAddresses,
            status
        }
    }).run();
}

export function deleteContact(upeerId: string) {
    const db = getDb();
    const schema = getSchema();

    return db.delete(schema.contacts).where(eq(schema.contacts.upeerId, upeerId)).run();
}

export function updateContactName(upeerId: string, name: string) {
    const db = getDb();
    const schema = getSchema();

    return db.update(schema.contacts)
        .set({ name })
        .where(eq(schema.contacts.upeerId, upeerId))
        .run();
}

export function updateContactAvatar(upeerId: string, avatar: string) {
    const db = getDb();
    const schema = getSchema();

    return db.update(schema.contacts)
        .set({ avatar })
        .where(eq(schema.contacts.upeerId, upeerId))
        .run();
}

export function blockContact(upeerId: string) {
    const db = getDb();
    const schema = getSchema();

    return db.update(schema.contacts)
        .set({ status: 'blocked', blockedAt: new Date().toISOString() })
        .where(eq(schema.contacts.upeerId, upeerId))
        .run();
}

export function unblockContact(upeerId: string) {
    const db = getDb();
    const schema = getSchema();

    return db.update(schema.contacts)
        .set({ status: 'incoming', blockedAt: null })
        .where(eq(schema.contacts.upeerId, upeerId))
        .run();
}

export function getBlockedContacts() {
    const db = getDb();
    const schema = getSchema();

    return db.select().from(schema.contacts)
        .where(eq(schema.contacts.status, 'blocked'))
        .all();
}

export function isContactBlocked(upeerId: string): boolean {
    const db = getDb();
    const schema = getSchema();

    const contact = db.select({ status: schema.contacts.status })
        .from(schema.contacts)
        .where(eq(schema.contacts.upeerId, upeerId))
        .get() as { status: string } | undefined;

    return contact?.status === 'blocked';
}