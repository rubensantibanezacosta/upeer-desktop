import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import path from 'node:path';
import * as schema from './schema.js';
import { eq, desc, or, and } from 'drizzle-orm';

import { migrate } from 'drizzle-orm/better-sqlite3/migrator';

let sqlite: Database.Database;
let db: ReturnType<typeof drizzle<typeof schema>>;

export async function initDB(userDataPath: string) {
    const dbPath = path.join(userDataPath, 'p2p-chat.db');
    sqlite = new Database(dbPath);
    db = drizzle(sqlite, { schema });

    // Canonical Migration System
    try {
        // En desarrollo (tsx/etc) process.cwd(), en prod/electron process.resourcesPath
        // Intentamos detectar dónde están las migraciones
        let migrationsPath = path.join(process.cwd(), 'drizzle');

        // Si estamos en Electron, podemos ser más precisos
        try {
            const { app: electronApp } = await import('electron');
            if (electronApp?.isPackaged) {
                migrationsPath = path.join(process.resourcesPath, 'drizzle');
            }
        } catch (e) {
            // No estamos en Electron o no podemos importar app, usamos el fallback de cwd
        }

        migrate(db, { migrationsFolder: migrationsPath });
        console.log('[DB] Migraciones aplicadas correctamente.');
    } catch (err) {
        console.error('[DB] Error en migraciones:', err);
    }
}

export function saveMessage(id: string, chatRevelnestId: string, isMine: boolean, message: string, replyTo?: string, signature?: string) {
    return db.insert(schema.messages).values({
        id,
        chatRevelnestId,
        isMine,
        message,
        replyTo,
        signature
    }).run();
}

export function getMessages(chatRevelnestId: string) {
    const msgs = db.select().from(schema.messages)
        .where(eq(schema.messages.chatRevelnestId, chatRevelnestId))
        .orderBy(desc(schema.messages.timestamp))
        .limit(100)
        .all();

    return msgs.map(m => {
        const msgReactions = db.select().from(schema.reactions)
            .where(eq(schema.reactions.messageId, m.id))
            .all();
        return { ...m, reactions: msgReactions };
    });
}

export function saveReaction(messageId: string, revelnestId: string, emoji: string) {
    // Evitar duplicados del mismo usuario con el mismo emoji
    const existing = db.select().from(schema.reactions)
        .where(and(
            eq(schema.reactions.messageId, messageId),
            eq(schema.reactions.revelnestId, revelnestId),
            eq(schema.reactions.emoji, emoji)
        )).get();

    if (!existing) {
        return db.insert(schema.reactions).values({
            messageId,
            revelnestId,
            emoji
        }).run();
    }
}

export function deleteReaction(messageId: string, revelnestId: string, emoji: string) {
    return db.delete(schema.reactions)
        .where(and(
            eq(schema.reactions.messageId, messageId),
            eq(schema.reactions.revelnestId, revelnestId),
            eq(schema.reactions.emoji, emoji)
        )).run();
}

export function updateMessageContent(id: string, newMessage: string, signature?: string) {
    return db.update(schema.messages)
        .set({
            message: newMessage,
            isEdited: true,
            signature: signature
        })
        .where(eq(schema.messages.id, id))
        .run();
}

export function deleteMessageLocally(id: string) {
    return db.update(schema.messages)
        .set({
            message: "Mensaje eliminado",
            isDeleted: true
        })
        .where(eq(schema.messages.id, id))
        .run();
}

export function getContactByRevelnestId(revelnestId: string) {
    return db.select().from(schema.contacts)
        .where(eq(schema.contacts.revelnestId, revelnestId))
        .get() as any;
}

export function getContactByAddress(address: string) {
    return db.select().from(schema.contacts)
        .where(eq(schema.contacts.address, address))
        .get() as any;
}

export function updateContactLocation(revelnestId: string, address: string) {
    return db.update(schema.contacts)
        .set({ address, lastSeen: new Date().toISOString() })
        .where(eq(schema.contacts.revelnestId, revelnestId))
        .run();
}

export function updateContactDhtLocation(revelnestId: string, address: string, dhtSeq: number, dhtSignature: string) {
    return db.update(schema.contacts)
        .set({ address, dhtSeq, dhtSignature, lastSeen: new Date().toISOString() })
        .where(eq(schema.contacts.revelnestId, revelnestId))
        .run();
}

export function updateContactStatus(revelnestId: string, status: 'pending' | 'incoming' | 'connected') {
    return db.update(schema.contacts)
        .set({ status })
        .where(eq(schema.contacts.revelnestId, revelnestId))
        .run();
}

export function updateContactPublicKey(revelnestId: string, publicKey: string) {
    return db.update(schema.contacts)
        .set({ publicKey, status: 'connected' })
        .where(eq(schema.contacts.revelnestId, revelnestId))
        .run();
}

export function updateContactEphemeralPublicKey(revelnestId: string, ephemeralPublicKey: string) {
    return db.update(schema.contacts)
        .set({ ephemeralPublicKey })
        .where(eq(schema.contacts.revelnestId, revelnestId))
        .run();
}

export function updateMessageStatus(id: string, status: 'sent' | 'delivered' | 'read') {
    return db.update(schema.messages)
        .set({ status })
        .where(eq(schema.messages.id, id))
        .run();
}

export function getMessageStatus(id: string) {
    const msg = db.select({ status: schema.messages.status })
        .from(schema.messages)
        .where(eq(schema.messages.id, id))
        .get();
    return msg ? (msg as any).status : null;
}

export function getContacts() {
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

export function addOrUpdateContact(revelnestId: string, address: string, name: string, publicKey?: string, status: 'pending' | 'incoming' | 'connected' = 'connected', ephemeralPublicKey?: string) {
    return db.insert(schema.contacts).values({
        revelnestId,
        address,
        name,
        publicKey,
        ephemeralPublicKey,
        status
    }).onConflictDoUpdate({
        target: schema.contacts.revelnestId,
        set: { address, name, publicKey, status, ephemeralPublicKey }
    }).run();
}

export function deleteContact(revelnestId: string) {
    return db.delete(schema.contacts).where(eq(schema.contacts.revelnestId, revelnestId)).run();
}

export function updateLastSeen(revelnestId: string) {
    return db.update(schema.contacts)
        .set({ lastSeen: new Date().toISOString() })
        .where(eq(schema.contacts.revelnestId, revelnestId))
        .run();
}

export function closeDB() {
    if (sqlite) sqlite.close();
}
