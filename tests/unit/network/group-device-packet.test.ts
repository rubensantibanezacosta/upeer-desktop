import { beforeEach, describe, expect, it, vi } from 'vitest';

const MY_DEVICE_ID = 'aa'.repeat(32);
const PEER_DEVICE_ID = 'bb'.repeat(32);
const PEER_DEVICE_KEY = 'cc'.repeat(32);

const deviceMessaging = vi.hoisted(() => ({
    getDeviceMessagingIdentity: vi.fn(),
    signWithDevice: vi.fn(),
}));

vi.mock('../../../src/main_process/security/deviceMessaging.js', () => deviceMessaging);

vi.mock('../../../src/main_process/security/identity.js', () => ({
    getMyPublicKeyHex: vi.fn(() => '11'.repeat(32)),
    getMySignedPreKey: vi.fn(() => ({ spkPub: '22'.repeat(32), spkId: 1 })),
    getMyUPeerId: vi.fn(() => 'self-id'),
    sign: vi.fn(() => Buffer.from('sig')),
}));

vi.mock('../../../src/main_process/security/secure-logger.js', () => ({
    warn: vi.fn(),
    error: vi.fn(),
}));

vi.mock('../../../src/main_process/storage/contacts/operations.js', () => ({
    getContactByUpeerId: vi.fn(),
}));

vi.mock('../../../src/main_process/network/contactAdmission.js', () => ({
    requireContactAdmission: vi.fn(),
}));

vi.mock('../../../src/main_process/network/messaging/chatEncryption.js', () => ({
    encryptChatPayload: vi.fn(),
}));

vi.mock('../../../src/main_process/network/vault/manager.js', () => ({
    VaultManager: { replicateToVaults: vi.fn() },
}));

vi.mock('../../../src/main_process/network/server/transport.js', () => ({
    sendSecurePacket: vi.fn(),
}));

vi.mock('../../../src/main_process/network/utils.js', () => ({
    canonicalStringify: vi.fn((data: unknown) => JSON.stringify(data)),
}));

import {
    buildDeviceAwareGroupPacket,
    getGroupRecipientPublicKey,
} from '../../../src/main_process/network/messaging/groupControlSupport.js';

const boundContact = {
    upeerId: 'peer-id',
    publicKey: 'dd'.repeat(32),
    status: 'connected',
    deviceId: PEER_DEVICE_ID,
    devicePublicKey: PEER_DEVICE_KEY,
};

const accountContact = {
    upeerId: 'peer-id',
    publicKey: 'dd'.repeat(32),
    status: 'connected',
};

const packet = { type: 'GROUP_MSG', id: 'msg-1', groupId: 'grp-1' };

beforeEach(() => {
    vi.clearAllMocks();
    deviceMessaging.getDeviceMessagingIdentity.mockReturnValue({
        identity: { deviceId: MY_DEVICE_ID, publicKey: 'ee'.repeat(32) },
        signedPreKey: { spkPub: 'ff'.repeat(32), spkId: 1 },
    });
});

describe('buildDeviceAwareGroupPacket', () => {
    it('announces the local device, never the recipient one', () => {
        const result = buildDeviceAwareGroupPacket(packet, boundContact);

        expect(result.senderDeviceId).toBe(MY_DEVICE_ID);
        expect(result.senderDeviceId).not.toBe(PEER_DEVICE_ID);
        expect(result).toMatchObject({ type: 'GROUP_MSG', groupId: 'grp-1' });
    });

    it('keeps the account signature when the recipient has no device binding', () => {
        expect(buildDeviceAwareGroupPacket(packet, accountContact)).toBe(packet);
        expect(deviceMessaging.getDeviceMessagingIdentity).not.toHaveBeenCalled();
    });

    it('keeps the account signature when the local device is unavailable', () => {
        deviceMessaging.getDeviceMessagingIdentity.mockReturnValue(null);

        expect(buildDeviceAwareGroupPacket(packet, boundContact)).toBe(packet);
    });

    it('does not mutate the original packet', () => {
        buildDeviceAwareGroupPacket(packet, boundContact);

        expect(packet).not.toHaveProperty('senderDeviceId');
    });
});

describe('getGroupRecipientPublicKey', () => {
    it('seals to the device key of a bound recipient', () => {
        expect(getGroupRecipientPublicKey(boundContact)).toBe(PEER_DEVICE_KEY);
    });

    it('seals to the account key otherwise', () => {
        expect(getGroupRecipientPublicKey(accountContact)).toBe('dd'.repeat(32));
    });
});
