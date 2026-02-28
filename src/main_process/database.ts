import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import path from 'node:path';
import { app } from 'electron';
import * as schema from './schema.js';
import { eq, desc, or } from 'drizzle-orm';

let sqlite: Database.Database;
let db: ReturnType<typeof drizzle<typeof schema>>;

export function initDB() {
    const dbPath = path.join(app.getPath('userData'), 'p2p-chat.db');
    sqlite = new Database(dbPath);
    db = drizzle(sqlite, { schema });

    // Canonical Identity-First Schema (RevelNest ID)
    sqlite.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      chat_revelnest_id TEXT NOT NULL,
      is_mine BOOLEAN NOT NULL,
      message TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'sent',
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      reply_to TEXT,
      signature TEXT
    );
    CREATE TABLE IF NOT EXISTS contacts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      revelnest_id TEXT UNIQUE,
      address TEXT NOT NULL,
      name TEXT NOT NULL,
      public_key TEXT,
      status TEXT NOT NULL DEFAULT 'connected',
      last_seen DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_contacts_revelnest_id ON contacts(revelnest_id);
  `);
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
    return db.select().from(schema.messages)
        .where(eq(schema.messages.chatRevelnestId, chatRevelnestId))
        .orderBy(desc(schema.messages.timestamp))
        .limit(100)
        .all();
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

export function updateMessageStatus(id: string, status: 'sent' | 'delivered' | 'read') {
    return db.update(schema.messages)
        .set({ status })
        .where(eq(schema.messages.id, id))
        .run();
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

export function addOrUpdateContact(revelnestId: string, address: string, name: string, publicKey?: string, status: 'pending' | 'incoming' | 'connected' = 'connected') {
    return db.insert(schema.contacts).values({
        revelnestId,
        address,
        name,
        publicKey,
        status
    }).onConflictDoUpdate({
        target: schema.contacts.revelnestId,
        set: { address, name, publicKey, status }
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
