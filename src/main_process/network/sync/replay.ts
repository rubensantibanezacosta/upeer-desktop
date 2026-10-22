import { warn } from '../../security/secure-logger.js';
import { listOutboundSyncEventsAfter, type SyncEventRecord } from '../../storage/sync/events.js';
import { getSyncPeer, type SyncPeerRecord } from '../../storage/sync/peers.js';
import { sendSyncEnvelope } from './transport.js';
import type { SyncPlainEvent } from './types.js';

const REPLAY_BATCH_SIZE = 200;
const MAX_REPLAY_BATCHES = 25;

export async function replayPendingSyncEvents(peer: SyncPeerRecord): Promise<void> {
    if (!peer.address) return;
    let cursor = peer.ackSequence;
    for (let batch = 0; batch < MAX_REPLAY_BATCHES; batch += 1) {
        const records = listOutboundSyncEventsAfter(cursor, REPLAY_BATCH_SIZE);
        if (records.length === 0) return;
        for (const record of records) {
            const event = toPlainEvent(record);
            if (event) await sendSyncEnvelope(peer, event);
            cursor = Math.max(cursor, record.sequence);
        }
        if (records.length < REPLAY_BATCH_SIZE) return;
    }
}

export async function replayAfterAck(deviceId: string): Promise<void> {
    const peer = getSyncPeer(deviceId);
    if (!peer) return;
    await replayPendingSyncEvents(peer).catch(err => warn('Sync replay failed', err, 'sync'));
}

function toPlainEvent(record: SyncEventRecord): SyncPlainEvent | null {
    try {
        const payload = JSON.parse(record.payload) as unknown;
        if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
        return {
            eventId: record.eventId,
            kind: record.kind,
            occurredAt: record.occurredAt,
            sequence: record.sequence,
            payload: payload as Record<string, unknown>,
        };
    } catch {
        warn('Stored sync event payload is not valid JSON', { eventId: record.eventId }, 'sync');
        return null;
    }
}
