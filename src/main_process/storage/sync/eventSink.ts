import crypto from 'node:crypto';

export type SyncEventKind =
    | 'MESSAGE_UPSERT'
    | 'MESSAGE_STATUS'
    | 'MESSAGE_EDIT'
    | 'MESSAGE_DELETE'
    | 'CHAT_CLEAR'
    | 'REACTION_SET'
    | 'GROUP_UPSERT'
    | 'GROUP_DELETE'
    | 'CONTACT_PROFILE';

export type SyncEventDraft = {
    eventId: string;
    kind: SyncEventKind;
    occurredAt: number;
    entityId: string;
    payload: Record<string, unknown>;
};

type SyncEventSink = (event: SyncEventDraft) => void;

let sink: SyncEventSink | null = null;
let suppressionDepth = 0;

export function registerSyncEventSink(next: SyncEventSink | null): void {
    sink = next;
}

export function emitSyncEvent(kind: SyncEventKind, payload: Record<string, unknown>): void {
    if (!sink || suppressionDepth > 0) return;
    sink({
        eventId: crypto.randomUUID(),
        kind,
        occurredAt: Date.now(),
        entityId: syncEntityId(kind, payload),
        payload,
    });
}

export function syncEntityId(kind: SyncEventKind, payload: Record<string, unknown>): string {
    const candidate = kind === 'CHAT_CLEAR'
        ? payload.chatUpeerId
        : kind === 'REACTION_SET'
            ? payload.messageId
            : kind === 'GROUP_UPSERT' || kind === 'GROUP_DELETE'
                ? payload.groupId
                : kind === 'CONTACT_PROFILE'
                    ? payload.upeerId
                    : payload.id;
    return typeof candidate === 'string' ? candidate : '';
}

export function withSyncEventSuppression<T>(fn: () => T): T {
    suppressionDepth += 1;
    try {
        return fn();
    } finally {
        suppressionDepth -= 1;
    }
}

export async function withSyncEventSuppressionAsync<T>(fn: () => Promise<T>): Promise<T> {
    suppressionDepth += 1;
    try {
        return await fn();
    } finally {
        suppressionDepth -= 1;
    }
}
