import { and, asc, eq, gt, or } from 'drizzle-orm';
import { getDb, getSchema } from '../shared.js';
import type { MessageDeliveryStatus } from '../messages/status.js';

export type SyncedMessage = {
    id: string;
    chatUpeerId: string;
    senderUpeerId?: string | null;
    isMine: boolean;
    message: string;
    replyTo?: string | null;
    signature?: string | null;
    status: MessageDeliveryStatus;
    version: number;
    isDeleted: boolean;
    isEdited: boolean;
    timestamp: number;
};

export type SyncHistoryPage = {
    messages: SyncedMessage[];
    nextCursor: string | null;
    done: boolean;
};

const STATUS_RANK: Record<string, number> = {
    failed: 0,
    sent: 1,
    vaulted: 2,
    delivered: 3,
    read: 4,
};

function maxStatus(current: string, incoming: string): MessageDeliveryStatus {
    const candidate = (STATUS_RANK[incoming] ?? 0) >= (STATUS_RANK[current] ?? 0) ? incoming : current;
    return candidate as MessageDeliveryStatus;
}

export function upsertSyncMessage(input: SyncedMessage): { applied: boolean; inserted: boolean } {
    const db = getDb();
    const schema = getSchema();
    const clearedAt = getLastClearedAt(input.chatUpeerId);
    if (clearedAt > 0 && input.timestamp <= clearedAt) {
        return { applied: false, inserted: false };
    }

    const existing = db.select().from(schema.messages)
        .where(eq(schema.messages.id, input.id))
        .get() as (SyncedMessage & { isMine: boolean | number }) | undefined;

    if (!existing) {
        db.insert(schema.messages).values({
            id: input.id,
            chatUpeerId: input.chatUpeerId,
            senderUpeerId: input.senderUpeerId ?? null,
            isMine: input.isMine,
            message: input.message,
            replyTo: input.replyTo ?? null,
            signature: input.signature ?? null,
            status: input.status,
            version: input.version,
            isDeleted: input.isDeleted,
            isEdited: input.isEdited,
            timestamp: input.timestamp,
        }).run();
        return { applied: true, inserted: true };
    }

    if (existing.isDeleted && !input.isDeleted) {
        return { applied: false, inserted: false };
    }
    if (existing.version > input.version) {
        return { applied: false, inserted: false };
    }

    const nextStatus = maxStatus(existing.status, input.status);
    const nextMessage = input.version >= existing.version ? input.message : existing.message;
    const nextReplyTo = input.replyTo ?? existing.replyTo;
    const nextSignature = input.signature ?? existing.signature;
    const nextVersion = Math.max(existing.version, input.version);
    const nextIsDeleted = existing.isDeleted || input.isDeleted;
    const nextIsEdited = existing.isEdited || input.isEdited;

    if (
        nextMessage === existing.message
        && nextStatus === existing.status
        && nextIsDeleted === existing.isDeleted
        && nextIsEdited === existing.isEdited
        && nextVersion === existing.version
    ) {
        return { applied: false, inserted: false };
    }

    db.update(schema.messages).set({
        message: nextMessage,
        replyTo: nextReplyTo,
        signature: nextSignature,
        status: nextStatus,
        version: nextVersion,
        isDeleted: nextIsDeleted,
        isEdited: nextIsEdited,
    }).where(eq(schema.messages.id, input.id)).run();

    return { applied: true, inserted: false };
}

export function listSyncHistoryMessages(afterTimestamp: number, afterId: string, limit: number): SyncHistoryPage {
    const db = getDb();
    const schema = getSchema();
    const pageSize = Math.max(1, Math.min(200, limit));
    const cursorCondition = afterId
        ? or(
            gt(schema.messages.timestamp, afterTimestamp),
            and(eq(schema.messages.timestamp, afterTimestamp), gt(schema.messages.id, afterId)),
        )
        : gt(schema.messages.timestamp, afterTimestamp);
    const rows = db.select().from(schema.messages)
        .where(cursorCondition)
        .orderBy(asc(schema.messages.timestamp), asc(schema.messages.id))
        .limit(pageSize + 1)
        .all() as SyncedMessage[];
    const done = rows.length <= pageSize;
    const messages = done ? rows : rows.slice(0, pageSize);
    const last = messages[messages.length - 1];
    return {
        messages,
        nextCursor: last ? `${last.timestamp}:${last.id}` : null,
        done,
    };
}

export function parseSyncHistoryCursor(cursor: string | null | undefined): { timestamp: number; id: string } {
    if (!cursor) return { timestamp: 0, id: '' };
    const separator = cursor.indexOf(':');
    if (separator <= 0) return { timestamp: 0, id: '' };
    const timestamp = Number(cursor.slice(0, separator));
    if (!Number.isFinite(timestamp) || timestamp < 0) return { timestamp: 0, id: '' };
    return { timestamp, id: cursor.slice(separator + 1) };
}

function getLastClearedAt(chatUpeerId: string): number {
    const db = getDb();
    const schema = getSchema();
    if (chatUpeerId.startsWith('grp-')) {
        const group = db.select({ lastClearedAt: schema.groups.lastClearedAt })
            .from(schema.groups)
            .where(eq(schema.groups.groupId, chatUpeerId))
            .get();
        return group?.lastClearedAt ?? 0;
    }
    const contact = db.select({ lastClearedAt: schema.contacts.lastClearedAt })
        .from(schema.contacts)
        .where(eq(schema.contacts.upeerId, chatUpeerId))
        .get();
    return contact?.lastClearedAt ?? 0;
}
