import crypto from 'node:crypto';

export type SyncEventKind =
    | 'MESSAGE_UPSERT'
    | 'MESSAGE_STATUS'
    | 'MESSAGE_EDIT'
    | 'MESSAGE_DELETE'
    | 'CHAT_CLEAR'
    | 'REACTION_SET';

export type SyncEventDraft = {
    eventId: string;
    kind: SyncEventKind;
    occurredAt: number;
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
        payload,
    });
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
