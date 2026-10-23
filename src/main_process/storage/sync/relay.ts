import { and, asc, eq, isNull, ne } from 'drizzle-orm';
import { getDb, getSchema } from '../shared.js';
import type { SyncEventRecord } from './events.js';

export function enqueueSyncRelay(
    eventId: string,
    targetDeviceId: string,
    sequence: number,
    now = Date.now(),
): boolean {
    const db = getDb();
    const schema = getSchema();
    const result = db.insert(schema.syncRelay).values({
        eventId,
        targetDeviceId,
        sequence,
        createdAt: now,
    }).onConflictDoNothing({
        target: [schema.syncRelay.eventId, schema.syncRelay.targetDeviceId],
    }).run();
    return result.changes > 0;
}

export function enqueueSyncRelayBacklog(targetDeviceId: string, now = Date.now()): number {
    const db = getDb();
    const schema = getSchema();
    const rows = db.select({
        eventId: schema.syncEvents.eventId,
        sequence: schema.syncEvents.sequence,
    }).from(schema.syncEvents)
        .where(and(
            eq(schema.syncEvents.direction, 'inbound'),
            ne(schema.syncEvents.originDeviceId, targetDeviceId),
        ))
        .all();
    let queued = 0;
    for (const row of rows) {
        if (enqueueSyncRelay(row.eventId, targetDeviceId, row.sequence, now)) queued += 1;
    }
    return queued;
}

export function listPendingSyncRelay(targetDeviceId: string, limit = 200): SyncEventRecord[] {
    const db = getDb();
    const schema = getSchema();
    return db.select({
        eventId: schema.syncEvents.eventId,
        originDeviceId: schema.syncEvents.originDeviceId,
        kind: schema.syncEvents.kind,
        occurredAt: schema.syncEvents.occurredAt,
        sequence: schema.syncEvents.sequence,
        payload: schema.syncEvents.payload,
        direction: schema.syncEvents.direction,
        appliedAt: schema.syncEvents.appliedAt,
    }).from(schema.syncRelay)
        .innerJoin(schema.syncEvents, eq(schema.syncEvents.eventId, schema.syncRelay.eventId))
        .where(and(
            eq(schema.syncRelay.targetDeviceId, targetDeviceId),
            isNull(schema.syncRelay.ackedAt),
        ))
        .orderBy(asc(schema.syncRelay.sequence), asc(schema.syncRelay.eventId))
        .limit(limit)
        .all() as SyncEventRecord[];
}

export function isSyncRelayTarget(eventId: string, targetDeviceId: string): boolean {
    const db = getDb();
    const schema = getSchema();
    const row = db.select({ eventId: schema.syncRelay.eventId })
        .from(schema.syncRelay)
        .where(and(
            eq(schema.syncRelay.eventId, eventId),
            eq(schema.syncRelay.targetDeviceId, targetDeviceId),
        ))
        .get();
    return Boolean(row);
}

export function markSyncRelayAcked(eventId: string, targetDeviceId: string, now = Date.now()): void {
    const db = getDb();
    const schema = getSchema();
    db.update(schema.syncRelay)
        .set({ ackedAt: now })
        .where(and(
            eq(schema.syncRelay.eventId, eventId),
            eq(schema.syncRelay.targetDeviceId, targetDeviceId),
            isNull(schema.syncRelay.ackedAt),
        ))
        .run();
}
