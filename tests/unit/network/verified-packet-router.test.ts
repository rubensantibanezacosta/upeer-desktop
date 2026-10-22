import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/main_process/security/identity.js', () => ({
    verify: vi.fn(),
    getMyUPeerId: vi.fn(() => 'self-id'),
    setMyAlias: vi.fn(),
    setMyAvatar: vi.fn(),
}));

vi.mock('../../../src/main_process/security/ratchetSessionQueue.js', () => ({
    ratchetSessionQueueKey: (upeerId: string, contextId: string) => `${upeerId}:${contextId}`,
    withRatchetSessionLock: async (_key: string, operation: () => Promise<unknown>) => operation(),
}));

vi.mock('../../../src/main_process/security/secure-logger.js', () => ({
    info: vi.fn(),
    warn: vi.fn(),
}));

vi.mock('../../../src/main_process/network/file-transfer/transfer-manager.js', () => ({
    fileTransferManager: {
        handleMessage: vi.fn(),
    },
}));

vi.mock('../../../src/main_process/network/handlers/chat.js', () => ({
    handleChatAck: vi.fn(),
    handleChatClear: vi.fn(),
    handleChatContact: vi.fn(),
    handleChatDelete: vi.fn(),
    handleChatEdit: vi.fn(),
    handleChatMessage: vi.fn(),
    handleChatReaction: vi.fn(),
}));

vi.mock('../../../src/main_process/network/handlers/groups.js', () => ({
    handleGroupAck: vi.fn(),
    handleGroupInvite: vi.fn(),
    handleGroupLeave: vi.fn(),
    handleGroupMessage: vi.fn(),
    handleGroupUpdate: vi.fn(),
}));

vi.mock('../../../src/main_process/network/handlers/reputation.js', () => ({
    handleReputationDeliver: vi.fn(),
    handleReputationGossip: vi.fn(),
    handleReputationRequest: vi.fn(),
}));

vi.mock('../../../src/main_process/network/handlers/sync.js', () => ({
    handleSyncPulse: vi.fn(),
}));

vi.mock('../../../src/main_process/network/handlers/vault.js', () => ({
    handleVaultDelivery: vi.fn(),
}));

vi.mock('../../../src/main_process/storage/ratchet/operations.js', () => ({
    deleteRatchetSession: vi.fn(),
}));

vi.mock('../../../src/main_process/storage/contacts/keys.js', () => ({
    updateContactSignedPreKey: vi.fn(),
    updateContactDeviceSignedPreKey: vi.fn(),
}));

vi.mock('../../../src/main_process/network/messaging/chatRetry.js', () => ({
    retryPendingDirectMessages: vi.fn(),
}));

vi.mock('../../../src/main_process/network/messaging/encryptedOperationRetry.js', () => ({
    retryPendingEncryptedOperations: vi.fn(),
    retryPendingGroupEncryptedOperations: vi.fn(),
}));

describe('network/verifiedPacketRouter.ts', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('retries pending direct messages when a peer sends DR_RESET', async () => {
        const { routeVerifiedPacket } = await import('../../../src/main_process/network/verifiedPacketRouter.js');
        const ratchetOps = await import('../../../src/main_process/storage/ratchet/operations.js');
        const contactKeys = await import('../../../src/main_process/storage/contacts/keys.js');
        const chatRetry = await import('../../../src/main_process/network/messaging/chatRetry.js');
        const encryptedRetry = await import('../../../src/main_process/network/messaging/encryptedOperationRetry.js');
        const identity = await import('../../../src/main_process/security/identity.js');

        vi.mocked(identity.verify).mockReturnValue(true);
        vi.mocked(chatRetry.retryPendingDirectMessages).mockResolvedValue(1);
        vi.mocked(encryptedRetry.retryPendingEncryptedOperations).mockResolvedValue(1);

        await routeVerifiedPacket({
            upeerId: 'peer-id',
            contact: { publicKey: 'aa'.repeat(32) },
            data: {
                type: 'DR_RESET',
                signedPreKey: {
                    spkPub: 'bb'.repeat(32),
                    spkSig: 'cc'.repeat(64),
                    spkId: 9,
                },
            },
            signature: 'sig',
            rinfo: { address: '200::9', port: 1234 },
            win: null,
            sendResponse: vi.fn(),
        });

        expect(ratchetOps.deleteRatchetSession).toHaveBeenCalledWith('peer-id', 'direct');
        expect(contactKeys.updateContactSignedPreKey).toHaveBeenCalledWith('peer-id', 'bb'.repeat(32), 'cc'.repeat(64), 9);
        expect(chatRetry.retryPendingDirectMessages).toHaveBeenCalledWith('peer-id');
        expect(encryptedRetry.retryPendingEncryptedOperations).toHaveBeenCalledWith('peer-id');
    });

    it('retries only pending encrypted operations for the reset group session', async () => {
        const { routeVerifiedPacket } = await import('../../../src/main_process/network/verifiedPacketRouter.js');
        const ratchetOps = await import('../../../src/main_process/storage/ratchet/operations.js');
        const chatRetry = await import('../../../src/main_process/network/messaging/chatRetry.js');
        const encryptedRetry = await import('../../../src/main_process/network/messaging/encryptedOperationRetry.js');
        const identity = await import('../../../src/main_process/security/identity.js');

        vi.mocked(identity.verify).mockReturnValue(true);
        await routeVerifiedPacket({
            upeerId: 'peer-id',
            contact: { publicKey: 'aa'.repeat(32) },
            data: {
                type: 'DR_RESET',
                ratchetContext: 'group:group-id',
                signedPreKey: { spkPub: 'bb'.repeat(32), spkSig: 'cc'.repeat(64), spkId: 9 },
            },
            signature: 'sig',
            rinfo: { address: '200::9', port: 1234 },
            win: null,
            sendResponse: vi.fn(),
        });

        expect(ratchetOps.deleteRatchetSession).toHaveBeenCalledWith('peer-id', 'group:group-id');
        expect(chatRetry.retryPendingDirectMessages).not.toHaveBeenCalled();
        expect(encryptedRetry.retryPendingEncryptedOperations).not.toHaveBeenCalled();
        expect(encryptedRetry.retryPendingGroupEncryptedOperations).toHaveBeenCalledWith('peer-id', 'group-id');
    });
});