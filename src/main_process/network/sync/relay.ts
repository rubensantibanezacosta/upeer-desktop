import { warn } from '../../security/secure-logger.js';
import {
    enqueueSyncRelay,
    enqueueSyncRelayBacklog,
    listPendingSyncRelay,
} from '../../storage/sync/relay.js';
import { listSyncPeers, type SyncPeerRecord } from '../../storage/sync/peers.js';
import { toPlainEvent } from './replay.js';
import { sendSyncEnvelope } from './transport.js';
import type { SyncPlainEvent } from './types.js';

const RELAY_BATCH_SIZE = 200;
const MAX_RELAY_BATCHES = 25;

export async function relaySyncEvent(
    event: SyncPlainEvent,
    senderDeviceId: string,
    myUpeerId: string,
): Promise<void> {
    const originDeviceId = event.originDeviceId ?? senderDeviceId;
    const targets = listSyncPeers(myUpeerId).filter(peer => (
        peer.deviceId !== senderDeviceId && peer.deviceId !== originDeviceId
    ));
    for (const peer of targets) {
        enqueueSyncRelay(event.eventId, peer.deviceId, event.sequence);
    }
    for (const peer of targets) {
        if (peer.address) await flushSyncRelay(peer);
    }
}

export async function relayBacklogToPeer(peer: SyncPeerRecord): Promise<void> {
    if (!peer.address) return;
    enqueueSyncRelayBacklog(peer.deviceId);
    await flushSyncRelay(peer);
}

async function flushSyncRelay(peer: SyncPeerRecord): Promise<void> {
    if (!peer.address) return;
    for (let batch = 0; batch < MAX_RELAY_BATCHES; batch += 1) {
        const records = listPendingSyncRelay(peer.deviceId, RELAY_BATCH_SIZE);
        if (records.length === 0) return;
        for (const record of records) {
            const event = toPlainEvent(record);
            if (event) {
                const sent = await sendSyncEnvelope(peer, event);
                if (!sent) warn('Sync relay envelope could not be sent', { deviceId: peer.deviceId, eventId: event.eventId }, 'sync');
            }
        }
        if (records.length < RELAY_BATCH_SIZE) return;
    }
}
