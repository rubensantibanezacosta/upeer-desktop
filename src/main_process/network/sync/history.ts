import crypto from 'node:crypto';
import type { BrowserWindow } from 'electron';

import { recordSyncEvent } from '../../storage/sync/events.js';
import { listSyncHistoryMessages, parseSyncHistoryCursor } from '../../storage/sync/messages.js';
import { updateSyncPeerHistory, type SyncPeerRecord } from '../../storage/sync/peers.js';
import { applySyncEvent } from './apply.js';
import { getMySyncIdentity } from './auth.js';
import { sendEncryptedSync } from './transport.js';
import { SYNC_EVENT_KINDS, type SyncPlainEvent } from './types.js';

const HISTORY_PAGE_SIZE = 50;
const inFlight = new Set<string>();

export async function requestSyncHistory(peer: SyncPeerRecord): Promise<void> {
    if (!peer.address || inFlight.has(peer.deviceId)) return;
    inFlight.add(peer.deviceId);
    try {
        const requestId = crypto.randomUUID();
        await sendEncryptedSync(peer, 'SYNC_HISTORY_REQ', {
            requestId,
            cursor: peer.historyCursor,
            limit: HISTORY_PAGE_SIZE,
        });
    } finally {
        inFlight.delete(peer.deviceId);
    }
}

export async function respondSyncHistory(
    peer: SyncPeerRecord,
    request: { requestId: string; cursor: string | null; limit: number },
): Promise<void> {
    const cursor = parseSyncHistoryCursor(request.cursor);
    const limit = Math.max(1, Math.min(200, request.limit));
    const page = listSyncHistoryMessages(cursor.timestamp, cursor.id, limit);
    const deviceId = getMySyncIdentity()?.deviceId ?? 'unknown-device';
    const entries = page.messages.map((message) => ({
        eventId: `history:${deviceId}:${message.id}`,
        kind: 'MESSAGE_UPSERT' as const,
        occurredAt: message.timestamp,
        sequence: message.timestamp,
        payload: message as unknown as Record<string, unknown>,
    }));
    await sendEncryptedSync(peer, 'SYNC_HISTORY_RES', {
        requestId: request.requestId,
        entries,
        nextCursor: page.nextCursor,
        done: page.done,
    });
}

export async function applySyncHistoryResponse(
    peer: SyncPeerRecord,
    payload: { requestId: string; entries: unknown[]; nextCursor: string | null; done: boolean },
    now: number,
    win: BrowserWindow | null,
): Promise<void> {
    for (const raw of payload.entries) {
        const entry = toSyncEvent(raw);
        if (!entry) continue;
        const recorded = recordSyncEvent({
            eventId: entry.eventId,
            originDeviceId: peer.deviceId,
            kind: entry.kind,
            occurredAt: entry.occurredAt,
            sequence: entry.sequence,
            payload: JSON.stringify(entry.payload),
            direction: 'inbound',
            appliedAt: now,
        });
        if (recorded) await applySyncEvent(entry, win);
    }
    updateSyncPeerHistory(peer.deviceId, payload.nextCursor, payload.done);
    if (!payload.done && payload.nextCursor) {
        const { getSyncPeer } = await import('../../storage/sync/peers.js');
        const refreshed = getSyncPeer(peer.deviceId);
        if (refreshed) await requestSyncHistory(refreshed);
    }
}

function toSyncEvent(value: unknown): SyncPlainEvent | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const record = value as Record<string, unknown>;
    if (typeof record.eventId !== 'string' || record.eventId.length === 0 || record.eventId.length > 128) return null;
    if (typeof record.kind !== 'string' || !SYNC_EVENT_KINDS.includes(record.kind as never)) return null;
    if (typeof record.occurredAt !== 'number' || !Number.isFinite(record.occurredAt)) return null;
    if (typeof record.sequence !== 'number' || !Number.isSafeInteger(record.sequence)) return null;
    if (!record.payload || typeof record.payload !== 'object' || Array.isArray(record.payload)) return null;
    return {
        eventId: record.eventId,
        kind: record.kind as SyncPlainEvent['kind'],
        occurredAt: record.occurredAt,
        sequence: record.sequence,
        payload: record.payload as Record<string, unknown>,
    };
}
