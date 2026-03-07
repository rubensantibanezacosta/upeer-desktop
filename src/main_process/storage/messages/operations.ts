import { getDb, getSchema, eq, desc } from '../shared.js';

export function saveMessage(id: string, chatRevelnestId: string, isMine: boolean, message: string, replyTo?: string, signature?: string, status: 'sent' | 'delivered' | 'read' = 'sent') {
    const db = getDb();
    const schema = getSchema();

    return db.insert(schema.messages).values({
        id,
        chatRevelnestId,
        isMine,
        message,
        replyTo,
        signature,
        status
    }).onConflictDoNothing().run();
}

export function getMessages(chatRevelnestId: string) {
    const db = getDb();
    const schema = getSchema();

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

export function saveFileMessage(
    id: string,
    chatRevelnestId: string,
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
    status: 'sent' | 'delivered' | 'read' = 'sent'
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
        chatRevelnestId,
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