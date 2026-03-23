import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/main_process/storage/contacts/operations.js', () => ({
    getContactByUpeerId: vi.fn(),
    getContacts: vi.fn(() => []),
}));

vi.mock('../../../src/main_process/storage/groups/operations.js', () => ({
    getGroupById: vi.fn(),
}));

vi.mock('../../../src/main_process/storage/messages/operations.js', () => ({
    saveMessage: vi.fn(),
    updateMessageStatus: vi.fn(),
    updateMessageContent: vi.fn(),
    deleteMessageLocally: vi.fn(),
}));

vi.mock('../../../src/main_process/storage/messages/reactions.js', () => ({
    saveReaction: vi.fn(),
    deleteReaction: vi.fn(),
}));

vi.mock('../../../src/main_process/security/identity.js', () => ({
    getMyPublicKeyHex: vi.fn(() => '11'.repeat(32)),
    getMyUPeerId: vi.fn(() => 'self-id'),
    sign: vi.fn(() => Buffer.from('sig')),
    encrypt: vi.fn(() => ({ ciphertext: 'ciphertext', nonce: 'nonce' })),
    getMyEphemeralPublicKeyHex: vi.fn(() => '22'.repeat(32)),
    incrementEphemeralMessageCounter: vi.fn(),
    getMyIdentitySkBuffer: vi.fn(() => Buffer.alloc(32)),
    getMyPublicKey: vi.fn(() => Buffer.from('11'.repeat(32), 'hex')),
}));

vi.mock('../../../src/main_process/security/secure-logger.js', () => ({
    warn: vi.fn(),
    error: vi.fn(),
}));

vi.mock('../../../src/main_process/network/utils.js', () => ({
    canonicalStringify: vi.fn((data) => JSON.stringify(data)),
}));

vi.mock('../../../src/main_process/network/server/transport.js', () => ({
    sendSecureUDPMessage: vi.fn(),
}));

vi.mock('../../../src/main_process/network/dht/core.js', () => ({
    startDhtSearch: vi.fn(),
}));

vi.mock('../../../src/main_process/network/vault/manager.js', () => ({
    VaultManager: {
        replicateToVaults: vi.fn(),
    },
}));

vi.mock('electron', () => ({
    BrowserWindow: {
        getAllWindows: vi.fn(() => [{ webContents: { send: vi.fn() } }]),
    },
}));

describe('network/messaging/chat.ts', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('vaults immediately when contact is known but disconnected', async () => {
        const { getContactByUpeerId } = await import('../../../src/main_process/storage/contacts/operations.js');
        const messagesOps = await import('../../../src/main_process/storage/messages/operations.js');
        const { VaultManager } = await import('../../../src/main_process/network/vault/manager.js');
        const { startDhtSearch } = await import('../../../src/main_process/network/dht/core.js');
        const { sendUDPMessage } = await import('../../../src/main_process/network/messaging/chat.js');

        vi.mocked(getContactByUpeerId).mockResolvedValue({
            upeerId: 'peer-offline',
            status: 'disconnected',
            publicKey: 'aa'.repeat(32),
            address: '200::2',
        } as any);
        vi.mocked(messagesOps.saveMessage).mockResolvedValue({ changes: 1 } as any);
        vi.mocked(messagesOps.updateMessageStatus).mockResolvedValue(true as any);
        vi.mocked(VaultManager.replicateToVaults).mockResolvedValue(1 as any);

        const result = await sendUDPMessage('peer-offline', 'hola offline', 'reply-1');

        expect(result).toEqual(expect.objectContaining({ savedMessage: 'hola offline' }));
        expect(messagesOps.saveMessage).toHaveBeenCalledWith(
            expect.any(String),
            'peer-offline',
            true,
            'hola offline',
            'reply-1',
            '',
            'sent',
            'self-id',
            expect.any(Number)
        );
        expect(VaultManager.replicateToVaults).toHaveBeenCalledWith(
            'peer-offline',
            expect.objectContaining({
                type: 'CHAT',
                content: 'ciphertext',
                nonce: 'nonce',
                timestamp: expect.any(Number),
                ephemeralPublicKey: '22'.repeat(32),
                useRecipientEphemeral: false,
                replyTo: 'reply-1',
                senderUpeerId: 'self-id',
                signature: Buffer.from('sig').toString('hex')
            })
        );
        expect(messagesOps.updateMessageStatus).toHaveBeenCalledWith(expect.any(String), 'vaulted');
        expect(startDhtSearch).toHaveBeenCalledWith('peer-offline', expect.any(Function));
    });
});