import { beforeEach, describe, expect, it, vi } from 'vitest';
import { drResetReplayCache } from '../../../src/main_process/network/drResetReplayCache.js';

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
    retryPendingGroupEncryptedOperations: vi.fn(),
}));

describe('verifiedPacketRouter DR_RESET edges', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        drResetReplayCache.clear();
    });

    it('preserva la sesión y no reintenta si la firma de la SPK del reset es inválida', async () => {
        const { routeVerifiedPacket } = await import('../../../src/main_process/network/verifiedPacketRouter.js');
        const ratchetOps = await import('../../../src/main_process/storage/ratchet/operations.js');
        const contactKeys = await import('../../../src/main_process/storage/contacts/keys.js');
        const chatRetry = await import('../../../src/main_process/network/messaging/chatRetry.js');
        const encryptedRetry = await import('../../../src/main_process/network/messaging/encryptedOperationRetry.js');
        const identity = await import('../../../src/main_process/security/identity.js');

        vi.mocked(identity.verify).mockReturnValue(false);
        vi.mocked(chatRetry.retryPendingDirectMessages).mockResolvedValue(2);
        vi.mocked(encryptedRetry.retryPendingEncryptedOperations).mockResolvedValue(1);

        await routeVerifiedPacket({
            upeerId: 'peer-id',
            contact: { publicKey: 'aa'.repeat(32) },
            data: {
                type: 'DR_RESET',
                signedPreKey: {
                    spkPub: 'bb'.repeat(32),
                    spkSig: 'cc'.repeat(64),
                    spkId: 10,
                },
            },
            signature: 'sig',
            rinfo: { address: '200::9', port: 1234 },
            win: null,
            sendResponse: vi.fn(),
        });

        expect(ratchetOps.deleteRatchetSession).not.toHaveBeenCalled();
        expect(contactKeys.updateContactSignedPreKey).not.toHaveBeenCalled();
        expect(chatRetry.retryPendingDirectMessages).not.toHaveBeenCalled();
        expect(encryptedRetry.retryPendingEncryptedOperations).not.toHaveBeenCalled();
    });

    it('preserva la sesión si falta la SPK firmada', async () => {
        const { routeVerifiedPacket } = await import('../../../src/main_process/network/verifiedPacketRouter.js');
        const ratchetOps = await import('../../../src/main_process/storage/ratchet/operations.js');
        const identity = await import('../../../src/main_process/security/identity.js');

        vi.mocked(identity.verify).mockReturnValue(true);
        await routeVerifiedPacket({
            upeerId: 'peer-id',
            contact: { publicKey: 'aa'.repeat(32) },
            data: { type: 'DR_RESET' },
            signature: 'sig',
            rinfo: { address: '200::9', port: 1234 },
            win: null,
            sendResponse: vi.fn(),
        });

        expect(ratchetOps.deleteRatchetSession).not.toHaveBeenCalled();
    });

    it('acepta un reset idempotente con el mismo spkId y reinicia la sesión', async () => {
        const { routeVerifiedPacket } = await import('../../../src/main_process/network/verifiedPacketRouter.js');
        const ratchetOps = await import('../../../src/main_process/storage/ratchet/operations.js');
        const contactKeys = await import('../../../src/main_process/storage/contacts/keys.js');
        const identity = await import('../../../src/main_process/security/identity.js');

        vi.mocked(identity.verify).mockReturnValue(true);
        await routeVerifiedPacket({
            upeerId: 'peer-id',
            contact: { publicKey: 'aa'.repeat(32), signedPreKey: 'bb'.repeat(32), signedPreKeyId: 9 },
            data: {
                type: 'DR_RESET',
                resetId: '123e4567-e89b-12d3-a456-426614174001',
                signedPreKey: { spkPub: 'bb'.repeat(32), spkSig: 'cc'.repeat(64), spkId: 9 },
            },
            signature: 'sig',
            rinfo: { address: '200::9', port: 1234 },
            win: null,
            sendResponse: vi.fn(),
        });

        expect(ratchetOps.deleteRatchetSession).toHaveBeenCalledWith('peer-id', 'direct');
        expect(contactKeys.updateContactSignedPreKey).not.toHaveBeenCalled();
    });

    it('ignora un reset con un spkId anterior al actual', async () => {
        const { routeVerifiedPacket } = await import('../../../src/main_process/network/verifiedPacketRouter.js');
        const ratchetOps = await import('../../../src/main_process/storage/ratchet/operations.js');
        const identity = await import('../../../src/main_process/security/identity.js');

        vi.mocked(identity.verify).mockReturnValue(true);
        await routeVerifiedPacket({
            upeerId: 'peer-id',
            contact: { publicKey: 'aa'.repeat(32), signedPreKey: 'bb'.repeat(32), signedPreKeyId: 9 },
            data: {
                type: 'DR_RESET',
                resetId: '123e4567-e89b-12d3-a456-426614174002',
                signedPreKey: { spkPub: 'bb'.repeat(32), spkSig: 'cc'.repeat(64), spkId: 8 },
            },
            signature: 'sig',
            rinfo: { address: '200::9', port: 1234 },
            win: null,
            sendResponse: vi.fn(),
        });

        expect(ratchetOps.deleteRatchetSession).not.toHaveBeenCalled();
    });

    it('ignora un reset repetido con el mismo resetId', async () => {
        const { routeVerifiedPacket } = await import('../../../src/main_process/network/verifiedPacketRouter.js');
        const ratchetOps = await import('../../../src/main_process/storage/ratchet/operations.js');
        const identity = await import('../../../src/main_process/security/identity.js');

        vi.mocked(identity.verify).mockReturnValue(true);
        const packet = {
            upeerId: 'peer-id',
            contact: { publicKey: 'aa'.repeat(32), signedPreKey: 'bb'.repeat(32), signedPreKeyId: 9 },
            data: {
                type: 'DR_RESET',
                resetId: '123e4567-e89b-12d3-a456-426614174003',
                signedPreKey: { spkPub: 'bb'.repeat(32), spkSig: 'cc'.repeat(64), spkId: 9 },
            },
            signature: 'sig',
            rinfo: { address: '200::9', port: 1234 },
            win: null,
            sendResponse: vi.fn(),
        };

        await routeVerifiedPacket(packet);
        await routeVerifiedPacket(packet);

        expect(ratchetOps.deleteRatchetSession).toHaveBeenCalledTimes(1);
    });

    it('rechaza un spkId repetido con otra clave pública', async () => {
        const { routeVerifiedPacket } = await import('../../../src/main_process/network/verifiedPacketRouter.js');
        const ratchetOps = await import('../../../src/main_process/storage/ratchet/operations.js');
        const identity = await import('../../../src/main_process/security/identity.js');

        vi.mocked(identity.verify).mockReturnValue(true);
        await routeVerifiedPacket({
            upeerId: 'peer-id',
            contact: { publicKey: 'aa'.repeat(32), signedPreKey: 'bb'.repeat(32), signedPreKeyId: 9 },
            data: {
                type: 'DR_RESET',
                resetId: '123e4567-e89b-12d3-a456-426614174004',
                signedPreKey: { spkPub: 'dd'.repeat(32), spkSig: 'cc'.repeat(64), spkId: 9 },
            },
            signature: 'sig',
            rinfo: { address: '200::9', port: 1234 },
            win: null,
            sendResponse: vi.fn(),
        });

        expect(ratchetOps.deleteRatchetSession).not.toHaveBeenCalled();
    });
});
