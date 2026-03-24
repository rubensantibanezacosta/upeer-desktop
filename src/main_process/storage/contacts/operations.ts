import { getDb, getSchema, eq, desc } from '../shared.js';
import { isYggdrasilAddress } from '../../network/utils.js';

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
    const messageRows = db.select().from(schema.messages)
        .orderBy(desc(schema.messages.timestamp))
        .all() as any[];

    const lastMessageByChat = new Map<string, any>();
    for (const message of messageRows) {
        if (!message?.chatUpeerId || lastMessageByChat.has(message.chatUpeerId)) continue;
        lastMessageByChat.set(message.chatUpeerId, message);
    }

    const result = contactsList.map(c => {
        const lastMsgObj = lastMessageByChat.get(c.upeerId || '');

        return {
            ...c,
            lastMessage: lastMsgObj?.message,
            lastMessageTime: lastMsgObj?.timestamp,
            lastMessageIsMine: lastMsgObj?.isMine,
            lastMessageStatus: lastMsgObj?.status
        };
    });

    const knownUpeerIds = new Set(result.map(contact => contact.upeerId));
    for (const [chatUpeerId, lastMsgObj] of lastMessageByChat.entries()) {
        if (!chatUpeerId || chatUpeerId.startsWith('grp-') || knownUpeerIds.has(chatUpeerId)) continue;

        result.push({
            upeerId: chatUpeerId,
            address: '',
            name: 'Contacto eliminado',
            status: 'offline',
            isConversationOnly: true,
            lastMessage: lastMsgObj?.message,
            lastMessageTime: lastMsgObj?.timestamp,
            lastMessageIsMine: lastMsgObj?.isMine,
            lastMessageStatus: lastMsgObj?.status
        });
    }

    result.sort((a, b) => {
        const tA = a.lastMessageTime ? Number(a.lastMessageTime) : 0;
        const tB = b.lastMessageTime ? Number(b.lastMessageTime) : 0;
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
    dhtExpiresAt?: number,
    addresses?: string[] // Optional array of multiple addresses
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

    // Solo almacenar direcciones Yggdrasil: las IPs locales no son canales válidos
    const incomingAddresses = (addresses || [address]).filter(isYggdrasilAddress);
    for (const addr of incomingAddresses) {
        const idx = known.indexOf(addr);
        if (idx !== -1) known.splice(idx, 1);
        known.unshift(addr); // Most recent to the front
    }

    // Ensure the designated primary address is at the very front
    const pIdx = known.indexOf(address);
    if (pIdx !== -1) {
        known.splice(pIdx, 1);
        known.unshift(address);
    }

    if (known.length > 20) known = known.slice(0, 20);
    const kAddresses = JSON.stringify(known);

    const now = new Date().toISOString();
    const ephemeralPublicKeyUpdatedAt = ephemeralPublicKey ? now : undefined;

    const valuesToInsert = {
        upeerId,
        address,
        name,
        publicKey,
        ephemeralPublicKey,
        ephemeralPublicKeyUpdatedAt,
        dhtSeq,
        dhtSignature,
        dhtExpiresAt,
        knownAddresses: kAddresses,
        status
    };

    return db.insert(schema.contacts).values(valuesToInsert).onConflictDoUpdate({
        target: schema.contacts.upeerId,
        set: {
            address,
            name,
            publicKey,
            ...(ephemeralPublicKey ? { ephemeralPublicKey, ephemeralPublicKeyUpdatedAt: now } : {}),
            dhtSeq,
            dhtSignature,
            dhtExpiresAt,
            knownAddresses: kAddresses,
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

    export function setContactFavorite(upeerId: string, isFavorite: boolean) {
        const db = getDb();
        const schema = getSchema();

        return db.update(schema.contacts)
        .set({ isFavorite })
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