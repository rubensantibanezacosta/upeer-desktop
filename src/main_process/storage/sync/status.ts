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
    pendingEntityIds: string[];
    peers: SyncPeerState[];
};

const MAX_PENDING_ENTITY_IDS = 1_000;

export function getSyncStatus(upeerId: string): SyncStatus {
    const peers = listSyncPeers(upeerId);
    if (peers.length === 0) {
        return { state: 'disabled', pendingEvents: 0, pendingEntityIds: [], peers: [] };
    }
    const maxSequence = getMaxSyncSequence();
    const minAck = peers.reduce((lowest, peer) => Math.min(lowest, peer.ackSequence), maxSequence);
    if (maxSequence <= minAck) {
        return {
            state: 'synced',
            pendingEvents: 0,
            pendingEntityIds: [],
            peers: peers.map((peer) => toPeerState(peer, maxSequence)),
        };
    }
    return {
        state: 'pending',
        pendingEvents: countOutboundAfter(minAck),
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

function countOutboundAfter(minAck: number): number {
    const db = getDb();
    const schema = getSchema();
    const row = db.select({ total: sql<number>`count(*)` })
        .from(schema.syncEvents)
        .where(and(
            eq(schema.syncEvents.direction, 'outbound'),
            gt(schema.syncEvents.sequence, minAck),
        ))
        .get() as { total: number } | undefined;
    return Number(row?.total ?? 0);
}
