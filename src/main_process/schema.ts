import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const messages = sqliteTable('messages', {
    id: text('id').primaryKey(),
    chatRevelnestId: text('chat_revelnest_id').notNull(), // Linked to identity
    isMine: integer('is_mine', { mode: 'boolean' }).notNull(),
    message: text('message').notNull(),
    replyTo: text('reply_to'),
    signature: text('signature'),
    status: text('status').notNull().default('sent'),
    timestamp: text('timestamp').default(sql`CURRENT_TIMESTAMP`),
});

export const contacts = sqliteTable('contacts', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    revelnestId: text('revelnest_id').unique(), // Primary cryptographic ID
    address: text('address').notNull(),
    name: text('name').notNull(),
    publicKey: text('public_key'),
    status: text('status').notNull().default('connected'),
    lastSeen: text('last_seen').default(sql`CURRENT_TIMESTAMP`),
});
