import { and, eq, gt, isNotNull, sql } from 'drizzle-orm';
import { getDb, getSchema } from '../shared.js';
import { getMaxSyncSequence } from './events.js';
import { listSyncPeers } from './peers.js';

export type SyncEntityState = 'pending' | 'synced';

export type SyncPeerState = {
    deviceId: string;
    state: SyncEntityState;
    ackSequence: number;
    lastSeen: number;
    historyCompleted: boolean;
};

export type SyncStatus = {
    state: 'disabled' | SyncEntityState;
    pendingEvents: number;
    pendingMessages: number;
    pendingMetadata: number;
    pendingEntityIds: string[];
    peers: SyncPeerState[];
};

const MAX_PENDING_ENTITY_IDS = 1_000;

const MESSAGE_KINDS = new Set([
    'MESSAGE_UPSERT',
    'MESSAGE_STATUS',
    'MESSAGE_EDIT',
    'MESSAGE_DELETE',
    'CHAT_CLEAR',
    'REACTION_SET',
]);

export function getSyncStatus(upeerId: string): SyncStatus {
    const peers = listSyncPeers(upeerId);
    if (peers.length === 0) {
        return { state: 'disabled', pendingEvents: 0, pendingMessages: 0, pendingMetadata: 0, pendingEntityIds: [], peers: [] };
    }
    const maxSequence = getMaxSyncSequence();
    const minAck = peers.reduce((lowest, peer) => Math.min(lowest, peer.ackSequence), maxSequence);
    if (maxSequence <= minAck) {
        return {
            state: 'synced',
            pendingEvents: 0,
            pendingMessages: 0,
            pendingMetadata: 0,
            pendingEntityIds: [],
            peers: peers.map((peer) => toPeerState(peer, maxSequence)),
        };
    }
    const pending = summarizeOutboundAfter(minAck);
    return {
        state: 'pending',
        pendingEvents: pending.messages + pending.metadata,
        pendingMessages: pending.messages,
        pendingMetadata: pending.metadata,
        pendingEntityIds: listPendingEntityIds(minAck),
        peers: peers.map((peer) => toPeerState(peer, maxSequence)),
    };
}

function toPeerState(
    peer: { deviceId: string; ackSequence: number; lastSeen: number; historyCompleted: boolean },
    maxSequence: number,
): SyncPeerState {
    return {
        deviceId: peer.deviceId,
        state: maxSequence > peer.ackSequence ? 'pending' : 'synced',
        ackSequence: peer.ackSequence,
        lastSeen: peer.lastSeen,
        historyCompleted: peer.historyCompleted === true,
    };
}

function listPendingEntityIds(minAck: number): string[] {
    const db = getDb();
    const schema = getSchema();
    const rows = db.select({
        entityId: schema.syncEvents.entityId,
        sequence: sql<number>`max(${schema.syncEvents.sequence})`,
    }).from(schema.syncEvents)
        .where(and(
            eq(schema.syncEvents.direction, 'outbound'),
            isNotNull(schema.syncEvents.entityId),
            gt(schema.syncEvents.sequence, minAck),
        ))
        .groupBy(schema.syncEvents.entityId)
        .limit(MAX_PENDING_ENTITY_IDS)
        .all() as Array<{ entityId: string | null; sequence: number }>;
    return rows
        .filter((row): row is { entityId: string; sequence: number } => typeof row.entityId === 'string' && row.entityId.length > 0)
        .map((row) => row.entityId);
}

function summarizeOutboundAfter(minAck: number): { messages: number; metadata: number } {
    const db = getDb();
    const schema = getSchema();
    const rows = db.select({
        kind: schema.syncEvents.kind,
        total: sql<number>`count(*)`,
    }).from(schema.syncEvents)
        .where(and(
            eq(schema.syncEvents.direction, 'outbound'),
            gt(schema.syncEvents.sequence, minAck),
        ))
        .groupBy(schema.syncEvents.kind)
        .all() as Array<{ kind: string; total: number }>;
    let messages = 0;
    let metadata = 0;
    for (const row of rows) {
        const total = Number(row.total ?? 0);
        if (MESSAGE_KINDS.has(row.kind)) messages += total;
        else metadata += total;
    }
    return { messages, metadata };
}
