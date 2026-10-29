import crypto from 'node:crypto';
import type { BrowserWindow } from 'electron';

import { recordSyncEvent } from '../../storage/sync/events.js';
import { syncEntityId } from '../../storage/sync/eventSink.js';
import { debug } from '../../security/secure-logger.js';
import { countSyncHistoryAfter, latestSyncHistoryCursor, listSyncHistoryMessages, parseSyncHistoryCursor } from '../../storage/sync/messages.js';
import { listContactProfiles } from '../../storage/contacts/operations.js';
import { updateSyncPeerHistory, type SyncPeerRecord } from '../../storage/sync/peers.js';
import { applySyncEventOutcome } from './apply.js';
import { getMySyncIdentity } from './auth.js';
import { signSyncEventOrigin } from './origin.js';
import { sendEncryptedSync } from './transport.js';
import { parseCertificate } from '../../security/deviceCertificate.js';
import { SYNC_EVENT_KINDS, type SyncPlainEvent } from './types.js';
import { completeServedHistory, forgetHistoryWork, parsePendingCount, recordHistoryComplete, recordHistoryPage, recordHistoryServed, resetServedHistory } from './historyProgress.js';
import { carryHistoryCursor, earliestCursor, retreatToLocalLatest } from './historyCursor.js';
import { repairInboundMessages } from './repair.js';

const HISTORY_PAGE_SIZE = 50;
const inFlight = new Set<string>();
const requestedCursors = new Map<string, string | null>();

export async function requestSyncHistory(peer: SyncPeerRecord): Promise<void> {
    if (!peer.address || inFlight.has(peer.deviceId)) return;
    inFlight.add(peer.deviceId);
    try {
        const cursor = retreatToLocalLatest(peer.historyCursor, latestSyncHistoryCursor());
        if (!cursor) forgetHistoryWork(peer.deviceId);
        requestedCursors.set(peer.deviceId, cursor);
        const requestId = crypto.randomUUID();
        await sendEncryptedSync(peer, 'SYNC_HISTORY_REQ', {
            requestId,
            cursor,
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
    const nextCursor = carryHistoryCursor(page.nextCursor, request.cursor);
    const remaining = nextRemaining(nextCursor, page.done);
    recordHistoryServed(peer.deviceId, page.messages.length, remaining);
    if (page.done || !nextCursor) completeServedHistory(peer.deviceId);
    await sendEncryptedSync(peer, 'SYNC_HISTORY_RES', {
        requestId: request.requestId,
        entries,
        nextCursor,
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
    let processed = requestedCursors.get(peer.deviceId) ?? peer.historyCursor;
    let rejected = 0;
    for (const raw of payload.entries) {
        const entry = toSyncEvent(raw);
        if (!entry) continue;
        const normalized = { ...entry, originDeviceId: entry.originDeviceId ?? peer.deviceId };
        recordSyncEvent({
            eventId: entry.eventId,
            originDeviceId: normalized.originDeviceId,
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
        const outcome = await applySyncEventOutcome(normalized, win);
        if (outcome === 'rejected') {
            rejected += 1;
            continue;
        }
        processed = entryCursor(entry, processed);
    }
    debug('Sync history page processed', { deviceId: peer.deviceId, entries: payload.entries.length, rejected }, 'sync');
    const senderCursor = payload.nextCursor;
    const nextCursor = earliestCursor(senderCursor, processed);
    const caughtUp = senderCursor === null || nextCursor === senderCursor;
    const complete = payload.done && caughtUp;
    updateSyncPeerHistory(peer.deviceId, nextCursor, complete);
    if (complete || !nextCursor) recordHistoryComplete(peer.deviceId);
    if (complete) await repairInboundMessages(win);
    if (!complete && nextCursor) {
        const { getSyncPeer } = await import('../../storage/sync/peers.js');
        const refreshed = getSyncPeer(peer.deviceId);
        if (refreshed) await requestSyncHistory(refreshed);
    }
}


function entryCursor(entry: SyncPlainEvent, previous: string | null): string | null {
    if (entry.kind !== 'MESSAGE_UPSERT') return previous;
    const timestamp = entry.payload.timestamp;
    const id = entry.payload.id;
    if (typeof timestamp !== 'number' || !Number.isFinite(timestamp)) return previous;
    if (typeof id !== 'string' || !id) return previous;
    return `${timestamp}:${id}`;
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
