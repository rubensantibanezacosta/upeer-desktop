import { beforeEach, describe, expect, it, vi } from 'vitest';

const peer = {
    deviceId: 'a'.repeat(64),
    upeerId: 'b'.repeat(32),
    devicePublicKey: 'c'.repeat(64),
    deviceCertificate: '{}',
    deviceSignedPreKey: 'd'.repeat(64),
    deviceSignedPreKeySignature: 'e'.repeat(128),
    deviceSignedPreKeyId: 1,
    address: '200::2',
    lastSeen: 1,
    lastSequence: 0,
    ackSequence: 10,
    historyCursor: null,
    historyCompleted: false,
};

vi.mock('../../../src/main_process/storage/sync/events.js', () => ({
    listOutboundSyncEventsAfter: vi.fn(),
}));
vi.mock('../../../src/main_process/network/sync/transport.js', () => ({
    sendSyncEnvelope: vi.fn(() => Promise.resolve(true)),
}));
vi.mock('../../../src/main_process/security/secure-logger.js', () => ({
    warn: vi.fn(),
}));

import { listOutboundSyncEventsAfter } from '../../../src/main_process/storage/sync/events.js';
import { sendSyncEnvelope } from '../../../src/main_process/network/sync/transport.js';
import { replayPendingSyncEvents } from '../../../src/main_process/network/sync/replay.js';

describe('Sync replay', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('replays events newer than the acknowledged sequence', async () => {
        vi.mocked(listOutboundSyncEventsAfter).mockReturnValue([
            {
                eventId: 'event-1',
                originDeviceId: 'f'.repeat(64),
                kind: 'MESSAGE_UPSERT',
                occurredAt: 1,
                sequence: 11,
                payload: JSON.stringify({ id: 'm1' }),
                direction: 'outbound',
                appliedAt: 1,
            },
        ]);
        await replayPendingSyncEvents(peer);
        expect(listOutboundSyncEventsAfter).toHaveBeenCalledWith(10, 200);
        expect(sendSyncEnvelope).toHaveBeenCalledWith(peer, expect.objectContaining({
            eventId: 'event-1',
            kind: 'MESSAGE_UPSERT',
            sequence: 11,
            payload: { id: 'm1' },
        }));
    });

    it('skips peers without an address', async () => {
        await replayPendingSyncEvents({ ...peer, address: null });
        expect(listOutboundSyncEventsAfter).not.toHaveBeenCalled();
    });

    it('ignores malformed stored payloads', async () => {
        vi.mocked(listOutboundSyncEventsAfter).mockReturnValue([
            {
                eventId: 'event-bad',
                originDeviceId: 'f'.repeat(64),
                kind: 'MESSAGE_UPSERT',
                occurredAt: 1,
                sequence: 11,
                payload: '{bad-json',
                direction: 'outbound',
                appliedAt: 1,
            },
        ]);
        await replayPendingSyncEvents(peer);
        expect(sendSyncEnvelope).not.toHaveBeenCalled();
    });
});
