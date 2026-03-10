import { getDb, getSchema, eq, desc } from '../shared.js';

export function saveMessage(id: string, chatUpeerId: string, isMine: boolean, message: string, replyTo?: string, signature?: string, status: 'sent' | 'delivered' | 'read' | 'vaulted' = 'sent') {
    const db = getDb();
    const schema = getSchema();

    return db.insert(schema.messages).values({
        id,
        chatUpeerId,
        isMine,
        message,
        replyTo,
        signature,
        status
    }).onConflictDoNothing().run();
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

export function updateMessageContent(id: string, newMessage: string, signature?: string) {
    const db = getDb();
    const schema = getSchema();

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

export function deleteMessagesByChatId(chatUpeerId: string): void {
    const db = getDb();
    const schema = getSchema();
    // Delete reactions for all messages in this chat
    const msgIds = db.select({ id: schema.messages.id }).from(schema.messages)
        .where(eq(schema.messages.chatUpeerId, chatUpeerId))
        .all()
        .map(m => m.id);
    for (const id of msgIds) {
        db.delete(schema.reactions).where(eq(schema.reactions.messageId, id)).run();
    }
    db.delete(schema.messages).where(eq(schema.messages.chatUpeerId, chatUpeerId)).run();
}

export function getMessageById(id: string) {
    const db = getDb();
    const schema = getSchema();

    return db.select().from(schema.messages)
        .where(eq(schema.messages.id, id))
        .get();
}

export function saveFileMessage(
    id: string,
    chatUpeerId: string,
    isMine: boolean,
    fileInfo: {
        fileName: string;
        fileSize: number;
        mimeType: string;
        fileHash: string;
        tempPath?: string;
        filePath?: string;
        direction: 'sending' | 'receiving';
        transferId: string;
        thumbnail?: string;
        state?: string;
    },
    signature?: string,
    status: 'sent' | 'delivered' | 'read' | 'vaulted' = 'sent'
) {
    const db = getDb();
    const schema = getSchema();

    // Create a structured message that can be parsed by the frontend
    const fileMessage = {
        type: 'file' as const,
        ...fileInfo
    };

    return db.insert(schema.messages).values({
        id,
        chatUpeerId,
        isMine,
        message: JSON.stringify(fileMessage),
        replyTo: undefined,
        signature,
        status
    }).onConflictDoUpdate({
        target: schema.messages.id,
        set: {
            message: JSON.stringify(fileMessage),
            status: status
        }
    }).run();
}