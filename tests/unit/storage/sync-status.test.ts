import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockAll = vi.fn();
const mockGet = vi.fn();

const chain = {
    from: () => chain,
    where: () => chain,
    groupBy: () => chain,
    limit: () => chain,
    all: mockAll,
    get: mockGet,
};

vi.mock('../../../src/main_process/storage/shared.js', () => ({
    getDb: () => ({ select: () => chain }),
    getSchema: () => ({ syncEvents: { entityId: 'entityId', direction: 'direction', sequence: 'sequence', kind: 'kind' } }),
}));

vi.mock('../../../src/main_process/storage/sync/peers.js', () => ({
    listSyncPeers: vi.fn(),
}));

vi.mock('../../../src/main_process/storage/sync/events.js', () => ({
    getMaxSyncSequence: vi.fn(),
}));

import { listSyncPeers } from '../../../src/main_process/storage/sync/peers.js';
import { getMaxSyncSequence } from '../../../src/main_process/storage/sync/events.js';
import { getSyncStatus } from '../../../src/main_process/storage/sync/status.js';

const peer = (deviceId: string, ackSequence: number, lastSeen = 1) => ({
    deviceId,
    upeerId: 'a'.repeat(64),
    devicePublicKey: 'b'.repeat(64),
    deviceCertificate: '{}',
    deviceSignedPreKey: 'c'.repeat(64),
    deviceSignedPreKeySignature: 'd'.repeat(128),
    deviceSignedPreKeyId: 1,
    address: '200::1',
    lastSeen,
    lastSequence: 0,
    ackSequence,
    historyCursor: null,
    historyCompleted: false,
});

describe('Sync status', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockAll.mockReturnValue([]);
        mockGet.mockReturnValue({ total: 0 });
    });

    it('reports disabled when there are no other own devices', () => {
        vi.mocked(listSyncPeers).mockReturnValue([]);
        expect(getSyncStatus('a'.repeat(64))).toEqual({
            state: 'disabled',
            pendingEvents: 0,
            pendingMessages: 0,
            pendingMetadata: 0,
            pendingEntityIds: [],
            peers: [],
        });
    });

    it('reports synced when every device acknowledged the last sequence', () => {
        vi.mocked(listSyncPeers).mockReturnValue([peer('d1', 10), peer('d2', 12)]);
        vi.mocked(getMaxSyncSequence).mockReturnValue(10);
        const status = getSyncStatus('a'.repeat(64));
        expect(status.state).toBe('synced');
        expect(status.pendingEvents).toBe(0);
        expect(status.peers.every((item) => item.state === 'synced')).toBe(true);
    });

    it('reports pending events and entity ids when a device lags behind', () => {
        vi.mocked(listSyncPeers).mockReturnValue([peer('d1', 5), peer('d2', 0, 7)]);
        vi.mocked(getMaxSyncSequence).mockReturnValue(10);
        mockAll
            .mockReturnValueOnce([
                { kind: 'MESSAGE_UPSERT', total: 2 },
                { kind: 'CONTACT_PROFILE', total: 1 },
            ])
            .mockReturnValueOnce([{ entityId: 'message-1', sequence: 10 }, { entityId: null, sequence: 10 }]);

        const status = getSyncStatus('a'.repeat(64));
        expect(status.state).toBe('pending');
        expect(status.pendingEvents).toBe(3);
        expect(status.pendingMessages).toBe(2);
        expect(status.pendingMetadata).toBe(1);
        expect(status.pendingEntityIds).toEqual(['message-1']);
        expect(status.peers).toEqual([
            { deviceId: 'd1', state: 'pending', ackSequence: 5, lastSeen: 1, historyCompleted: false },
            { deviceId: 'd2', state: 'pending', ackSequence: 0, lastSeen: 7, historyCompleted: false },
        ]);
    });

    it('marks only the devices that acknowledged the last sequence as synced', () => {
        vi.mocked(listSyncPeers).mockReturnValue([peer('d1', 10), peer('d2', 9)]);
        vi.mocked(getMaxSyncSequence).mockReturnValue(10);
        const status = getSyncStatus('a'.repeat(64));
        expect(status.peers.find((item) => item.deviceId === 'd1')?.state).toBe('synced');
        expect(status.peers.find((item) => item.deviceId === 'd2')?.state).toBe('pending');
    });
});
