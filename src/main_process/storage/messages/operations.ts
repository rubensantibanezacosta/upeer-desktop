import { getDb, getSchema, eq, desc, or, and, lt, sql, runTransaction } from '../shared.js';
import { updateMessageStatus } from './status.js';

export async function saveMessage(id: string, chatUpeerId: string, isMine: boolean, message: string, replyTo?: string, signature?: string, status: 'sent' | 'delivered' | 'read' | 'vaulted' = 'sent', senderUpeerId?: string, timestamp?: number) {
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
    }).onConflictDoNothing().run();

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

    return msgs.map(m => {
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

export function deleteMessageLocally(id: string, timestamp?: number) {
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

export function deleteMessagesByChatId(chatUpeerId: string, clearTimestamp?: number): void {
    const db = getDb();
    const schema = getSchema();
    const timestamp = clearTimestamp || Date.now();

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

        const messagesToDelete = db.select({ id: schema.messages.id }).from(schema.messages)
            .where(and(
                eq(schema.messages.chatUpeerId, chatUpeerId),
                lt(schema.messages.timestamp, timestamp + 1000)
            ))
            .all();

        for (const msg of messagesToDelete) {
            db.delete(schema.reactions).where(eq(schema.reactions.messageId, msg.id)).run();
            db.delete(schema.messages).where(eq(schema.messages.id, msg.id)).run();
        }
    });
}

export function getMessageById(id: string) {
    const db = getDb();
    const schema = getSchema();

    return db.select().from(schema.messages)
        .where(eq(schema.messages.id, id))
        .get();
}

export async function saveFileMessage(id: string, chatUpeerId: string, isMine: boolean, fileName: string, fileId: string, fileSize: number, mimeType: string, signature?: string, status: 'sent' | 'delivered' | 'read' | 'vaulted' = 'sent', senderUpeerId?: string, timestamp?: number) {
    const db = getDb();
    const schema = getSchema();

    const messageJson = JSON.stringify({
        type: 'file',
        fileId,
        fileName,
        fileSize,
        mimeType
    });

    return saveMessage(id, chatUpeerId, isMine, messageJson, undefined, signature, status, senderUpeerId, timestamp);
}
