import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { like, gte, lte } from 'drizzle-orm';
import { getDb, getSchema, getSqlite, eq, desc, and, runTransaction } from '../shared.js';
import { updateMessageStatus, getMessageStatus, type MessageDeliveryStatus } from './status.js';

export { updateMessageStatus, getMessageStatus };

const sanitizedTempDir = path.join(os.tmpdir(), 'chat-p2p-sanitized');

function isBrokenLegacySanitizedMessage(message: any): boolean {
    if (!message || typeof message.message !== 'string' || !message.message.startsWith('{')) return false;

    try {
        const parsed = JSON.parse(message.message);
        if (parsed?.type !== 'file' || typeof parsed.savedPath !== 'string' || !parsed.savedPath) return false;
        return parsed.savedPath.startsWith(sanitizedTempDir) && !fs.existsSync(parsed.savedPath);
    } catch {
        return false;
    }
}

function purgeBrokenLegacySanitizedMessages(messages: any[], db: any, schema: any) {
    const validMessages: any[] = [];

    for (const message of messages) {
        if (!isBrokenLegacySanitizedMessage(message)) {
            validMessages.push(message);
            continue;
        }

        db.delete(schema.reactions).where(eq(schema.reactions.messageId, message.id)).run();
        db.delete(schema.messages).where(eq(schema.messages.id, message.id)).run();
    }

    return validMessages;
}

export async function saveMessage(id: string, chatUpeerId: string, isMine: boolean, message: string, replyTo?: string, signature?: string, status: MessageDeliveryStatus = 'sent', senderUpeerId?: string, timestamp?: number) {
    const db = getDb();
    const schema = getSchema();

    let lastClearedAt = 0;
    if (chatUpeerId.startsWith('grp-')) {
        const group = db.select({ lastClearedAt: schema.groups.lastClearedAt })
            .from(schema.groups)
            .where(eq(schema.groups.groupId, chatUpeerId))
            .get();
        if (group) lastClearedAt = group.lastClearedAt;
    } else {
        const contact = db.select({ lastClearedAt: schema.contacts.lastClearedAt })
            .from(schema.contacts)
            .where(eq(schema.contacts.upeerId, chatUpeerId))
            .get();
        if (contact) lastClearedAt = contact.lastClearedAt;
    }

    const messageTimestamp = timestamp ? Number(timestamp) : Date.now();

    if (lastClearedAt > 0 && messageTimestamp <= lastClearedAt) {
        return { changes: 0 };
    }

    const result = db.insert(schema.messages).values({
        id,
        chatUpeerId,
        senderUpeerId,
        isMine,
        message,
        replyTo,
        signature,
        status,
        timestamp: messageTimestamp
    }).onConflictDoUpdate({
        target: schema.messages.id,
        set: {
            message,
            replyTo,
            signature,
            senderUpeerId,
            status,
            timestamp: messageTimestamp
        }
    }).run();

    if (result.changes === 0) {
        await updateMessageStatus(id, status);
    }

    return result;
}

export function getMessages(chatUpeerId: string) {
    const db = getDb();
    const schema = getSchema();

    const msgs = db.select().from(schema.messages)
        .where(eq(schema.messages.chatUpeerId, chatUpeerId))
        .orderBy(desc(schema.messages.timestamp))
        .limit(100)
        .all();

    const validMessages = purgeBrokenLegacySanitizedMessages(msgs, db, schema);

    return validMessages.map(m => {
        const msgReactions = db.select().from(schema.reactions)
            .where(eq(schema.reactions.messageId, m.id))
            .all();
        return { ...m, reactions: msgReactions };
    });
}

export function updateMessageContent(id: string, newMessage: string, signature?: string, version?: number) {
    const db = getDb();
    const schema = getSchema();

    const updates: any = {
        message: newMessage,
        isEdited: true,
        signature: signature
    };
    if (version !== undefined) updates.version = version;

    return db.update(schema.messages)
        .set(updates)
        .where(eq(schema.messages.id, id))
        .run();
}

export function deleteMessageLocally(id: string, _timestamp?: number) {
    const db = getDb();
    const schema = getSchema();

    return db.update(schema.messages)
        .set({
            message: "Mensaje eliminado",
            isDeleted: true
        })
        .where(eq(schema.messages.id, id))
        .run();
}

export function deleteMessagesByChatId(chatUpeerId: string, clearTimestamp?: number) {
    const db = getDb();
    const sqlite = getSqlite();
    const schema = getSchema();
    const timestamp = clearTimestamp || Date.now();
    let deletedMessages = 0;
    let deletedReactions = 0;

    runTransaction(() => {
        if (chatUpeerId.startsWith('grp-')) {
            db.update(schema.groups)
                .set({ lastClearedAt: timestamp })
                .where(eq(schema.groups.groupId, chatUpeerId))
                .run();
        } else {
            db.update(schema.contacts)
                .set({ lastClearedAt: timestamp })
                .where(eq(schema.contacts.upeerId, chatUpeerId))
                .run();
        }

        deletedReactions = sqlite.prepare('DELETE FROM reactions WHERE message_id IN (SELECT id FROM messages WHERE chat_upeer_id = ?)').run(chatUpeerId).changes;
        deletedMessages = sqlite.prepare('DELETE FROM messages WHERE chat_upeer_id = ?').run(chatUpeerId).changes;
    });

    return { deletedMessages, deletedReactions, timestamp };
}

export function getMessageById(id: string) {
    const db = getDb();
    const schema = getSchema();

    return db.select().from(schema.messages)
        .where(eq(schema.messages.id, id))
        .get();
}

export function getMessagesAround(chatUpeerId: string, targetMsgId: string, context = 60) {
    const db = getDb();
    const schema = getSchema();

    const target = db.select({ timestamp: schema.messages.timestamp })
        .from(schema.messages)
        .where(eq(schema.messages.id, targetMsgId))
        .get();

    if (!target) return [];

    const half = Math.floor(context / 2);

    const before = db.select().from(schema.messages)
        .where(and(
            eq(schema.messages.chatUpeerId, chatUpeerId),
            lte(schema.messages.timestamp, target.timestamp)
        ))
        .orderBy(desc(schema.messages.timestamp))
        .limit(half + 1)
        .all();

    const after = db.select().from(schema.messages)
        .where(and(
            eq(schema.messages.chatUpeerId, chatUpeerId),
            gte(schema.messages.timestamp, target.timestamp + 1)
        ))
        .orderBy(schema.messages.timestamp)
        .limit(half)
        .all();

    const merged = purgeBrokenLegacySanitizedMessages([...before, ...after], db, schema);
    const unique = Array.from(new Map(merged.map(m => [m.id, m])).values())
        .sort((a, b) => a.timestamp - b.timestamp);

    return unique.map(m => {
        const msgReactions = db.select().from(schema.reactions)
            .where(eq(schema.reactions.messageId, m.id))
            .all();
        return { ...m, reactions: msgReactions };
    });
}

export function searchMessages(query: string, limit = 25) {
    const db = getDb();
    const schema = getSchema();
    const q = `%${query}%`;
    return db.select()
        .from(schema.messages)
        .where(
            and(
                like(schema.messages.message, q),
                eq(schema.messages.isDeleted, false)
            )
        )
        .orderBy(desc(schema.messages.timestamp))
        .limit(limit)
        .all();
}

export async function saveFileMessage(id: string, chatUpeerId: string, isMine: boolean, fileName: string, fileId: string, fileSize: number, mimeType: string, savedPath?: string, signature?: string, status: MessageDeliveryStatus = 'sent', senderUpeerId?: string, timestamp?: number, thumbnail?: string, caption?: string, isVoiceNote?: boolean) {
    const _db = getDb();
    const _schema = getSchema();

    const messageJson = JSON.stringify({
        type: 'file',
        fileId,
        fileName,
        fileSize,
        mimeType,
        savedPath,
        thumbnail,
        caption,
        ...(isVoiceNote ? { isVoiceNote: true } : {})
    });

    return saveMessage(id, chatUpeerId, isMine, messageJson, undefined, signature, status, senderUpeerId, timestamp);
}
