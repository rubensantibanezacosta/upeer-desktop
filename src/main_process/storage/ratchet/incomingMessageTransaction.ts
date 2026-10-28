import { eq } from 'drizzle-orm';
import { serializeState, type RatchetState } from '../../security/ratchet.js';
import { getDb, getSchema, runTransaction } from '../shared.js';
import { emitSyncEvent } from '../sync/eventSink.js';
import { expiresAtForMessage } from '../retention/chatRetention.js';

export type RatchetIncomingMessage = {
    id: string;
    chatUpeerId: string;
    isMine: boolean;
    message: string;
    replyTo?: string;
    signature?: string;
    status: string;
    senderUpeerId?: string;
    timestamp?: number;
};

export function commitRatchetIncomingMessage(
    message: RatchetIncomingMessage,
    session: RatchetState,
    spkIdUsed: number | null,
): { changes: number } {
    const db = getDb();
    const schema = getSchema();
    const timestamp = message.timestamp ? Number(message.timestamp) : Date.now();
    const now = Date.now();
    const serializedState = JSON.stringify(serializeState(session, spkIdUsed));
    let changes = 0;

    runTransaction(() => {
        const lastClearedAt = message.chatUpeerId.startsWith('grp-')
            ? db.select({ lastClearedAt: schema.groups.lastClearedAt })
                .from(schema.groups)
                .where(eq(schema.groups.groupId, message.chatUpeerId))
                .get()?.lastClearedAt ?? 0
            : db.select({ lastClearedAt: schema.contacts.lastClearedAt })
                .from(schema.contacts)
                .where(eq(schema.contacts.upeerId, message.chatUpeerId))
                .get()?.lastClearedAt ?? 0;

        if (timestamp > lastClearedAt) {
            changes = db.insert(schema.messages).values({
                ...message,
                timestamp,
                expiresAt: expiresAtForMessage(message.chatUpeerId, timestamp),
            }).onConflictDoUpdate({
                target: schema.messages.id,
                set: {
                    message: message.message,
                    replyTo: message.replyTo,
                    signature: message.signature,
                    senderUpeerId: message.senderUpeerId,
                    status: message.status,
                    timestamp,
                },
            }).run().changes;
        }

        db.insert(schema.ratchetSessions).values({
            upeerId: message.chatUpeerId,
            contextId: 'direct',
            state: serializedState,
            spkIdUsed,
            establishedAt: now,
            updatedAt: now,
        }).onConflictDoUpdate({
            target: [schema.ratchetSessions.upeerId, schema.ratchetSessions.contextId],
            set: { state: serializedState, spkIdUsed, updatedAt: now },
        }).run();
    });

    if (changes > 0) {
        emitSyncEvent('MESSAGE_UPSERT', {
            id: message.id,
            chatUpeerId: message.chatUpeerId,
            senderUpeerId: message.senderUpeerId ?? null,
            isMine: message.isMine,
            message: message.message,
            replyTo: message.replyTo ?? null,
            signature: message.signature ?? null,
            status: message.status,
            version: 1,
            isDeleted: false,
            isEdited: false,
            timestamp,
        });
    }

    return { changes };
}