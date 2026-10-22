import { and, asc, desc, eq, gt } from 'drizzle-orm';
import { getDb, getSchema } from '../shared.js';
import type { SyncEventKind } from './eventSink.js';

export type SyncEventRecord = {
    eventId: string;
    originDeviceId: string;
    kind: SyncEventKind;
    occurredAt: number;
    sequence: number;
    payload: string;
    direction: 'inbound' | 'outbound';
    appliedAt: number;
};

export function recordSyncEvent(record: SyncEventRecord): boolean {
    const db = getDb();
    const schema = getSchema();
    const result = db.insert(schema.syncEvents).values(record)
        .onConflictDoNothing({ target: schema.syncEvents.eventId })
        .run();
    return result.changes > 0;
}

export function getMaxSyncSequence(): number {
    const db = getDb();
    const schema = getSchema();
    const row = db.select({ sequence: schema.syncEvents.sequence })
        .from(schema.syncEvents)
        .orderBy(desc(schema.syncEvents.sequence))
        .limit(1)
        .get() as { sequence?: number } | undefined;
    return row?.sequence ?? 0;
}

export function listOutboundSyncEventsAfter(sequence: number, limit = 200): SyncEventRecord[] {
    const db = getDb();
    const schema = getSchema();
    return db.select().from(schema.syncEvents)
        .where(and(
            eq(schema.syncEvents.direction, 'outbound'),
            gt(schema.syncEvents.sequence, sequence),
        ))
        .orderBy(asc(schema.syncEvents.sequence), asc(schema.syncEvents.eventId))
        .limit(limit)
        .all() as SyncEventRecord[];
}
