import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/main_process/security/identity.js', () => ({
    verify: vi.fn(),
    getMyUPeerId: vi.fn(() => 'self-id'),
    setMyAlias: vi.fn(),
    setMyAvatar: vi.fn(),
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
}));

vi.mock('../../../src/main_process/network/messaging/chatRetry.js', () => ({
    retryPendingDirectMessages: vi.fn(),
}));

vi.mock('../../../src/main_process/network/messaging/encryptedOperationRetry.js', () => ({
    retryPendingEncryptedOperations: vi.fn(),
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

        expect(ratchetOps.deleteRatchetSession).toHaveBeenCalledWith('peer-id');
        expect(contactKeys.updateContactSignedPreKey).toHaveBeenCalledWith('peer-id', 'bb'.repeat(32), 'cc'.repeat(64), 9);
        expect(chatRetry.retryPendingDirectMessages).toHaveBeenCalledWith('peer-id');
        expect(encryptedRetry.retryPendingEncryptedOperations).toHaveBeenCalledWith('peer-id');
    });
});