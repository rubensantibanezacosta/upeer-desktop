import { beforeEach, describe, expect, it, vi } from 'vitest';

const peer = {
    deviceId: 'b'.repeat(64),
    upeerId: 'c'.repeat(32),
    devicePublicKey: 'd'.repeat(64),
    deviceCertificate: '{}',
    deviceSignedPreKey: 'e'.repeat(64),
    deviceSignedPreKeySignature: 'f'.repeat(128),
    deviceSignedPreKeyId: 1,
    address: '200::b',
    lastSeen: 1,
    lastSequence: 0,
    ackSequence: 0,
    historyCursor: null,
    historyCompleted: false,
};

vi.mock('../../../src/main_process/storage/sync/peers.js', () => ({
    listSyncPeers: vi.fn(() => []),
}));

vi.mock('../../../src/main_process/storage/sync/relay.js', () => ({
    enqueueSyncRelay: vi.fn(() => true),
    enqueueSyncRelayBacklog: vi.fn(() => 0),
    listPendingSyncRelay: vi.fn(() => []),
}));

vi.mock('../../../src/main_process/network/sync/transport.js', () => ({
    sendSyncEnvelope: vi.fn(() => Promise.resolve(true)),
}));

vi.mock('../../../src/main_process/network/sync/replay.js', () => ({
    toPlainEvent: (record: { eventId: string; sequence: number }) => ({
        eventId: record.eventId,
        kind: 'MESSAGE_UPSERT',
        occurredAt: 1,
        sequence: record.sequence,
        payload: { id: 'm1' },
    }),
}));

vi.mock('../../../src/main_process/security/secure-logger.js', () => ({
    warn: vi.fn(),
}));

import {
    enqueueSyncRelay,
    enqueueSyncRelayBacklog,
    listPendingSyncRelay,
} from '../../../src/main_process/storage/sync/relay.js';
import { listSyncPeers } from '../../../src/main_process/storage/sync/peers.js';
import { sendSyncEnvelope } from '../../../src/main_process/network/sync/transport.js';
import { relayBacklogToPeer, relaySyncEvent } from '../../../src/main_process/network/sync/relay.js';

const event = {
    eventId: 'event-1',
    kind: 'MESSAGE_UPSERT' as const,
    occurredAt: 1,
    sequence: 11,
    originDeviceId: 'a'.repeat(64),
    payload: { id: 'm1' },
};

describe('Sync relay', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('queues an inbound event for every peer except sender and origin', async () => {
        vi.mocked(listSyncPeers).mockReturnValue([
            peer,
            { ...peer, deviceId: 'a'.repeat(64), address: '200::a' },
            { ...peer, deviceId: 'f'.repeat(64), address: '200::f' },
        ]);
        await relaySyncEvent(event, 'f'.repeat(64), 'c'.repeat(32));
        expect(enqueueSyncRelay).toHaveBeenCalledTimes(1);
        expect(enqueueSyncRelay).toHaveBeenCalledWith('event-1', peer.deviceId, 11);
    });

    it('sends pending relayed events to the target device', async () => {
        vi.mocked(listPendingSyncRelay)
            .mockReturnValueOnce([{
                eventId: 'event-1',
                originDeviceId: 'a'.repeat(64),
                kind: 'MESSAGE_UPSERT',
                occurredAt: 1,
                sequence: 11,
                payload: '{"id":"m1"}',
                direction: 'inbound',
                appliedAt: 1,
            }])
            .mockReturnValue([]);
        await relayBacklogToPeer(peer);
        expect(enqueueSyncRelayBacklog).toHaveBeenCalledWith(peer.deviceId);
        expect(sendSyncEnvelope).toHaveBeenCalledWith(peer, expect.objectContaining({
            eventId: 'event-1',
            sequence: 11,
        }));
    });

    it('does not relay to peers without an address', async () => {
        vi.mocked(listSyncPeers).mockReturnValue([{ ...peer, address: null }]);
        await relaySyncEvent(event, 'f'.repeat(64), 'c'.repeat(32));
        expect(enqueueSyncRelay).toHaveBeenCalledWith('event-1', peer.deviceId, 11);
        expect(listPendingSyncRelay).not.toHaveBeenCalled();
    });
});
