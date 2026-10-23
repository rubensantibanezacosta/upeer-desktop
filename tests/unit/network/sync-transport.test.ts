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
    getMyPublicKey: vi.fn(() => Buffer.from('f'.repeat(64), 'hex')),
    getMyUPeerId: vi.fn(() => 'b'.repeat(32)),
}));

vi.mock('../../../src/main_process/network/messaging/chatEncryption.js', () => ({
    encryptChatPayload: vi.fn(() => Promise.resolve({
        content: 'encrypted',
        nonce: 'nonce',
        ratchetHeader: { dh: 'x' },
    })),
}));

vi.mock('../../../src/main_process/network/server/transport.js', () => ({
    sendSecurePacket: vi.fn(),
}));

vi.mock('../../../src/main_process/network/sync/auth.js', () => ({
    buildHelloPayload: vi.fn(),
    getMySyncIdentity: vi.fn(() => ({ deviceId, certificate: { deviceId } })),
}));

vi.mock('../../../src/main_process/security/deviceCertificate.js', () => ({
    parseCertificate: vi.fn(() => null),
}));

vi.mock('../../../src/main_process/storage/sync/events.js', () => ({
    getMaxSyncSequence: vi.fn(() => 0),
}));

vi.mock('../../../src/main_process/storage/ratchet/operations.js', () => ({
    getRatchetSession: vi.fn(() => null),
}));

import { sendSecurePacket } from '../../../src/main_process/network/server/transport.js';
import { sendSyncEnvelope } from '../../../src/main_process/network/sync/transport.js';

describe('Sync transport', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('publishes envelope metadata used for validation and relay coordination', async () => {
        const originDeviceId = '1'.repeat(64);
        await sendSyncEnvelope(peer, {
            eventId: 'event-1',
            kind: 'MESSAGE_UPSERT',
            occurredAt: 10,
            sequence: 11,
            originDeviceId,
            payload: { id: 'm1' },
        });
        expect(sendSecurePacket).toHaveBeenCalledWith('200::2', expect.objectContaining({
            type: 'SYNC_ENVELOPE',
            eventId: 'event-1',
            kind: 'MESSAGE_UPSERT',
            occurredAt: 10,
            sequence: 11,
            originDeviceId,
            senderDeviceId: deviceId,
            recipientDeviceId: deviceId,
        }));
    });
});
