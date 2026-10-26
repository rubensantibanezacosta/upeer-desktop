import crypto from 'node:crypto';
import type { BrowserWindow } from 'electron';

import { recordSyncEvent } from '../../storage/sync/events.js';
import { syncEntityId } from '../../storage/sync/eventSink.js';
import { countSyncHistoryAfter, listSyncHistoryMessages, parseSyncHistoryCursor } from '../../storage/sync/messages.js';
import { listContactProfiles } from '../../storage/contacts/operations.js';
import { updateSyncPeerHistory, type SyncPeerRecord } from '../../storage/sync/peers.js';
import { applySyncEvent } from './apply.js';
import { getMySyncIdentity } from './auth.js';
import { signSyncEventOrigin } from './origin.js';
import { sendEncryptedSync } from './transport.js';
import { parseCertificate } from '../../security/deviceCertificate.js';
import { SYNC_EVENT_KINDS, type SyncPlainEvent } from './types.js';
import { forgetHistoryWork, parsePendingCount, recordHistoryComplete, recordHistoryPage, recordHistoryServed, resetServedHistory } from './historyProgress.js';

const HISTORY_PAGE_SIZE = 50;
const inFlight = new Set<string>();

export async function requestSyncHistory(peer: SyncPeerRecord): Promise<void> {
    if (!peer.address || inFlight.has(peer.deviceId)) return;
    inFlight.add(peer.deviceId);
    try {
        if (!peer.historyCursor) forgetHistoryWork(peer.deviceId);
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
    if (!request.cursor) resetServedHistory(peer.deviceId);
    const page = listSyncHistoryMessages(cursor.timestamp, cursor.id, limit);
    const deviceId = getMySyncIdentity()?.deviceId ?? 'unknown-device';
    const entries = page.messages.map((message) => signSyncEventOrigin({
        eventId: `history-${deviceId}-${message.id}`,
        kind: 'MESSAGE_UPSERT' as const,
        occurredAt: message.timestamp,
        sequence: message.timestamp,
        originDeviceId: deviceId,
        payload: message as unknown as Record<string, unknown>,
    }));
    if (!request.cursor) {
        const now = Date.now();
        for (const profile of listContactProfiles()) {
            entries.push(signSyncEventOrigin({
                eventId: `profile-${profile.upeerId}`,
                kind: 'CONTACT_PROFILE' as const,
                occurredAt: now,
                sequence: now,
                originDeviceId: deviceId,
                payload: profile as unknown as Record<string, unknown>,
            }));
        }
    }
    const remaining = nextRemaining(page.nextCursor, page.done);
    recordHistoryServed(peer.deviceId, page.messages.length, remaining);
    await sendEncryptedSync(peer, 'SYNC_HISTORY_RES', {
        requestId: request.requestId,
        entries,
        nextCursor: page.nextCursor,
        done: page.done,
        pending: remaining,
    });
}

function nextRemaining(nextCursor: string | null, done: boolean): number {
    if (done || !nextCursor) return 0;
    const cursor = parseSyncHistoryCursor(nextCursor);
    return countSyncHistoryAfter(cursor.timestamp, cursor.id);
}

export async function applySyncHistoryResponse(
    peer: SyncPeerRecord,
    payload: { requestId: string; entries: unknown[]; nextCursor: string | null; done: boolean; pending?: unknown },
    now: number,
    win: BrowserWindow | null,
): Promise<void> {
    recordHistoryPage(peer.deviceId, payload.entries.length, parsePendingCount(payload.pending));
    for (const raw of payload.entries) {
        const entry = toSyncEvent(raw);
        if (!entry) continue;
        const recorded = recordSyncEvent({
            eventId: entry.eventId,
            originDeviceId: entry.originDeviceId ?? peer.deviceId,
            kind: entry.kind,
            occurredAt: entry.occurredAt,
            sequence: entry.sequence,
            payload: JSON.stringify(entry.payload),
            entityId: syncEntityId(entry.kind, entry.payload),
            originSignature: entry.originSignature ?? null,
            originCertificate: entry.originCertificate ? JSON.stringify(entry.originCertificate) : null,
            direction: 'inbound',
            appliedAt: now,
        });
        if (recorded) await applySyncEvent({ ...entry, originDeviceId: entry.originDeviceId ?? peer.deviceId }, win);
    }
    updateSyncPeerHistory(peer.deviceId, payload.nextCursor, payload.done);
    if (payload.done || !payload.nextCursor) recordHistoryComplete(peer.deviceId);
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
    if (record.originDeviceId !== undefined && (typeof record.originDeviceId !== 'string' || !/^[0-9a-f]{64}$/i.test(record.originDeviceId))) return null;
    if (record.originSignature !== undefined && (typeof record.originSignature !== 'string' || !/^[0-9a-f]{128}$/i.test(record.originSignature))) return null;
    const originCertificate = record.originCertificate === undefined
        ? undefined
        : parseCertificate(record.originCertificate) ?? undefined;
    if (record.originCertificate !== undefined && !originCertificate) return null;
    if (!record.payload || typeof record.payload !== 'object' || Array.isArray(record.payload)) return null;
    return {
        eventId: record.eventId,
        kind: record.kind as SyncPlainEvent['kind'],
        occurredAt: record.occurredAt,
        sequence: record.sequence,
        originDeviceId: typeof record.originDeviceId === 'string' ? record.originDeviceId.toLowerCase() : undefined,
        originSignature: typeof record.originSignature === 'string' ? record.originSignature.toLowerCase() : undefined,
        originCertificate,
        payload: record.payload as Record<string, unknown>,
    };
}
