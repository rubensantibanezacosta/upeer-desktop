import { beforeEach, describe, expect, it, vi } from 'vitest';

const deviceId = 'a'.repeat(64);
const peer = {
    deviceId,
    upeerId: 'b'.repeat(32),
    devicePublicKey: 'c'.repeat(64),
    deviceCertificate: '{}',
    deviceSignedPreKey: 'd'.repeat(64),
    deviceSignedPreKeySignature: 'e'.repeat(128),
    deviceSignedPreKeyId: 1,
    address: '200::2',
    lastSeen: 1,
    lastSequence: 0,
    ackSequence: 0,
    historyCursor: null,
    historyCompleted: false,
};

vi.mock('../../../src/main_process/security/identity.js', () => ({
    getMyUPeerId: vi.fn(() => 'b'.repeat(32)),
}));

vi.mock('../../../src/main_process/security/secure-logger.js', () => ({
    warn: vi.fn(),
}));

vi.mock('../../../src/main_process/network/sync/auth.js', () => ({
    certificateFromPacket: vi.fn(),
    getMySyncIdentity: vi.fn(() => ({ deviceId })),
    verifySyncHelloBinding: vi.fn(() => ({
        deviceId,
        devicePublicKey: peer.devicePublicKey,
        deviceCertificate: { deviceId },
        deviceSignedPreKey: { spkPub: peer.deviceSignedPreKey, spkSig: peer.deviceSignedPreKeySignature, spkId: 1 },
    })),
}));

vi.mock('../../../src/main_process/storage/sync/peers.js', () => ({
    getSyncPeer: vi.fn(() => peer),
    touchSyncPeer: vi.fn(),
    updateSyncPeerAck: vi.fn(),
    upsertSyncPeer: vi.fn(),
}));

vi.mock('../../../src/main_process/storage/sync/events.js', () => ({
    recordSyncEvent: vi.fn(() => true),
}));

vi.mock('../../../src/main_process/network/sync/apply.js', () => ({
    applySyncEvent: vi.fn(() => true),
}));

vi.mock('../../../src/main_process/network/sync/history.js', () => ({
    applySyncHistoryResponse: vi.fn(),
    requestSyncHistory: vi.fn(() => Promise.resolve()),
    respondSyncHistory: vi.fn(),
}));

vi.mock('../../../src/main_process/network/sync/replay.js', () => ({
    replayAfterAck: vi.fn(() => Promise.resolve()),
    replayPendingSyncEvents: vi.fn(() => Promise.resolve()),
}));

vi.mock('../../../src/main_process/network/sync/transport.js', () => ({
    sendSyncAck: vi.fn(),
    sendSyncHello: vi.fn(),
}));

vi.mock('../../../src/main_process/network/handlers/doubleRatchetDecrypt.js', () => ({
    decryptDoubleRatchetPayload: vi.fn(),
}));

import {
    handleSyncAck,
    handleSyncEnvelope,
    handleSyncHello,
    handleSyncHistoryRequest,
    handleSyncHistoryResponse,
} from '../../../src/main_process/network/sync/handlers.js';
import { decryptDoubleRatchetPayload } from '../../../src/main_process/network/handlers/doubleRatchetDecrypt.js';
import { applySyncEvent } from '../../../src/main_process/network/sync/apply.js';
import {
    applySyncHistoryResponse,
    requestSyncHistory,
    respondSyncHistory,
} from '../../../src/main_process/network/sync/history.js';
import { recordSyncEvent } from '../../../src/main_process/storage/sync/events.js';
import { getSyncPeer, touchSyncPeer, updateSyncPeerAck, upsertSyncPeer } from '../../../src/main_process/storage/sync/peers.js';
import { sendSyncAck, sendSyncHello } from '../../../src/main_process/network/sync/transport.js';

const hello = {
    deviceId,
    deviceCertificate: { deviceId },
    deviceSignedPreKey: { spkPub: peer.deviceSignedPreKey, spkSig: peer.deviceSignedPreKeySignature, spkId: 1 },
    timestamp: Date.now(),
    ack: false,
};

describe('Sync device handlers', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(getSyncPeer).mockReturnValue(peer as never);
        vi.mocked(recordSyncEvent).mockReturnValue(true);
        vi.mocked(decryptDoubleRatchetPayload).mockResolvedValue(null);
    });

    it('stores a hello, answers it and starts initial history', async () => {
        await handleSyncHello('200::2', hello);
        expect(upsertSyncPeer).toHaveBeenCalledWith(expect.objectContaining({
            deviceId,
            address: '200::2',
        }));
        expect(sendSyncHello).toHaveBeenCalledWith('200::2', true);
        expect(requestSyncHistory).toHaveBeenCalled();
    });

    it('does not answer an acknowledgement hello', async () => {
        await handleSyncHello('200::2', { ...hello, ack: true });
        expect(sendSyncHello).not.toHaveBeenCalled();
    });

    it('applies a new encrypted envelope, acknowledges it and updates the peer', async () => {
        const event = {
            eventId: 'event-1',
            kind: 'MESSAGE_UPSERT',
            occurredAt: 10,
            sequence: 11,
            payload: { id: 'm1' },
        };
        vi.mocked(decryptDoubleRatchetPayload).mockResolvedValue(JSON.stringify(event));

        await handleSyncEnvelope(deviceId, {
            type: 'SYNC_ENVELOPE',
            recipientDeviceId: deviceId,
            eventId: event.eventId,
            kind: event.kind,
            occurredAt: event.occurredAt,
            sequence: event.sequence,
        }, '200::2', null);

        expect(recordSyncEvent).toHaveBeenCalledWith(expect.objectContaining({
            eventId: 'event-1',
            originDeviceId: deviceId,
            direction: 'inbound',
        }));
        expect(applySyncEvent).toHaveBeenCalled();
        expect(touchSyncPeer).toHaveBeenCalledWith(deviceId, '200::2', 11);
        expect(sendSyncAck).toHaveBeenCalled();
    });

    it('acknowledges duplicates without applying them again', async () => {
        vi.mocked(recordSyncEvent).mockReturnValue(false);
        vi.mocked(decryptDoubleRatchetPayload).mockResolvedValue(JSON.stringify({
            eventId: 'event-1',
            kind: 'MESSAGE_STATUS',
            occurredAt: 10,
            sequence: 11,
            payload: { id: 'm1', status: 'read' },
        }));

        await handleSyncEnvelope(deviceId, {
            type: 'SYNC_ENVELOPE',
            recipientDeviceId: deviceId,
            eventId: 'event-1',
            kind: 'MESSAGE_STATUS',
            occurredAt: 10,
            sequence: 11,
        }, '200::2', null);

        expect(applySyncEvent).not.toHaveBeenCalled();
        expect(sendSyncAck).toHaveBeenCalled();
    });

    it('rejects envelopes for another local device', async () => {
        await handleSyncEnvelope(deviceId, {
            type: 'SYNC_ENVELOPE',
            recipientDeviceId: 'f'.repeat(64),
            eventId: 'event-1',
            kind: 'MESSAGE_UPSERT',
            occurredAt: 10,
            sequence: 11,
        }, '200::2', null);
        expect(decryptDoubleRatchetPayload).not.toHaveBeenCalled();
    });

    it('responds to a history request', async () => {
        vi.mocked(decryptDoubleRatchetPayload).mockResolvedValue(JSON.stringify({
            requestId: 'req-1',
            cursor: null,
            limit: 50,
        }));
        await handleSyncHistoryRequest(deviceId, {
            type: 'SYNC_HISTORY_REQ',
            recipientDeviceId: deviceId,
        }, '200::2');
        expect(respondSyncHistory).toHaveBeenCalledWith(peer, {
            requestId: 'req-1',
            cursor: null,
            limit: 50,
        });
    });

    it('applies a history response and continues pagination', async () => {
        vi.mocked(decryptDoubleRatchetPayload).mockResolvedValue(JSON.stringify({
            requestId: 'req-1',
            entries: [],
            nextCursor: '10:m1',
            done: false,
        }));
        await handleSyncHistoryResponse(deviceId, {
            type: 'SYNC_HISTORY_RES',
            recipientDeviceId: deviceId,
        }, '200::2', null);
        expect(applySyncHistoryResponse).toHaveBeenCalledWith(peer, expect.objectContaining({
            requestId: 'req-1',
            nextCursor: '10:m1',
            done: false,
        }), expect.any(Number), null);
    });

    it('updates the peer acknowledgement sequence', () => {
        handleSyncAck(deviceId, { sequence: 99 });
        expect(updateSyncPeerAck).toHaveBeenCalledWith(deviceId, 99);
    });
});

