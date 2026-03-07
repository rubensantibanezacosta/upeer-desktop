import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const messages = sqliteTable('messages', {
    id: text('id').primaryKey(),
    chatRevelnestId: text('chat_revelnest_id').notNull(),
    isMine: integer('is_mine', { mode: 'boolean' }).notNull(),
    message: text('message').notNull(),
    replyTo: text('reply_to'),
    signature: text('signature'),
    status: text('status').notNull().default('sent'),
    isDeleted: integer('is_deleted', { mode: 'boolean' }).notNull().default(false),
    isEdited: integer('is_edited', { mode: 'boolean' }).notNull().default(false),
    timestamp: text('timestamp').default(sql`CURRENT_TIMESTAMP`),
});

export const reactions = sqliteTable('reactions', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    messageId: text('message_id').notNull(),
    revelnestId: text('revelnest_id').notNull(),
    emoji: text('emoji').notNull(),
    timestamp: text('timestamp').default(sql`CURRENT_TIMESTAMP`),
});

export const contacts = sqliteTable('contacts', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    revelnestId: text('revelnest_id').unique(),
    address: text('address').notNull(),
    name: text('name').notNull(),
    publicKey: text('public_key'),
    ephemeralPublicKey: text('ephemeral_public_key'),
    dhtSeq: integer('dht_seq').notNull().default(0),
    dhtSignature: text('dht_signature'),
    dhtExpiresAt: integer('dht_expires_at'),
    renewalToken: text('renewal_token'),
    status: text('status').notNull().default('connected'),
    lastSeen: text('last_seen').default(sql`CURRENT_TIMESTAMP`),
});

export const backupSurvivalKit = sqliteTable('backup_survival_kit', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    kitId: text('kit_id').unique().notNull(),
    name: text('name').notNull(),
    description: text('description'),
    data: text('data').notNull(), // JSON string with contacts and location blocks
    created: text('created').default(sql`CURRENT_TIMESTAMP`),
    expires: integer('expires'), // Timestamp when kit expires
    isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
});
