import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/main_process/storage/contacts/operations.js', () => ({
    getContactByUpeerId: vi.fn(),
    getContacts: vi.fn(() => []),
}));

vi.mock('../../../src/main_process/storage/groups/operations.js', () => ({
    getGroupById: vi.fn(),
}));

vi.mock('../../../src/main_process/storage/messages/operations.js', () => ({
    saveMessage: vi.fn(() => Promise.resolve({ changes: 1 })),
    updateMessageStatus: vi.fn(() => Promise.resolve(true)),
    updateMessageContent: vi.fn(),
    deleteMessageLocally: vi.fn(),
    deleteMessagesByChatId: vi.fn(),
    getMessageById: vi.fn(() => Promise.resolve({ version: 0, message: 'x' })),
}));

vi.mock('../../../src/main_process/storage/messages/reactions.js', () => ({
    saveReaction: vi.fn(),
    deleteReaction: vi.fn(),
}));

vi.mock('../../../src/main_process/storage/ratchet/operations.js', () => ({
    getRatchetSession: vi.fn(() => null),
    saveRatchetSession: vi.fn(),
}));

vi.mock('../../../src/main_process/security/identity.js', () => ({
    getMyPublicKeyHex: vi.fn(() => '11'.repeat(32)),
    getMyUPeerId: vi.fn(() => 'self-id'),
    sign: vi.fn(() => Buffer.from('sig')),
    getMyIdentitySkBuffer: vi.fn(() => Buffer.alloc(32)),
    getMySignedPreKey: vi.fn(() => ({ spkPub: '55'.repeat(32), spkSig: '66'.repeat(64), spkId: 13 })),
    getMyPublicKey: vi.fn(() => Buffer.from('11'.repeat(32), 'hex')),
}));

vi.mock('../../../src/main_process/security/ratchet.js', () => ({
    x3dhInitiator: vi.fn(() => ({ ekPub: Buffer.from('33'.repeat(32), 'hex'), sharedSecret: Buffer.alloc(32, 7) })),
    ratchetInitAlice: vi.fn(() => ({ rk: Buffer.alloc(32) })),
    ratchetEncrypt: vi.fn(() => ({
        header: { dh: '44'.repeat(32), pn: 0, n: 0 },
        ciphertext: 'ratchet-cipher',
        nonce: 'ratchet-nonce',
    })),
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

vi.mock('../../../src/main_process/network/dht/handlers.js', () => ({
    getKademliaInstance: vi.fn(),
}));

vi.mock('../../../src/main_process/network/dht/core.js', () => ({
    startDhtSearch: vi.fn(),
}));

vi.mock('../../../src/main_process/network/og-fetcher.js', () => ({
    fetchOgPreview: vi.fn(),
}));

vi.mock('../../../src/main_process/network/vault/manager.js', () => ({
    VaultManager: {
        replicateToVaults: vi.fn(() => Promise.resolve(1)),
    },
}));

vi.mock('../../../src/main_process/utils/localAttachmentCleanup.js', () => ({
    extractLocalAttachmentInfo: vi.fn(() => null),
    cleanupLocalAttachmentFile: vi.fn(),
}));

vi.mock('../../../src/main_process/network/file-transfer/transfer-manager.js', () => ({
    fileTransferManager: {
        cancelTransfer: vi.fn(),
    },
}));

vi.mock('../../../src/main_process/sidecars/yggstack.js', () => ({
    getYggstackAddress: vi.fn(() => '200::self'),
}));

vi.mock('electron', () => ({
    BrowserWindow: {
        getAllWindows: vi.fn(() => [{ webContents: { send: vi.fn() } }]),
    },
}));

describe('no-pérdida de eventos de mutación (edición, borrado, reacción, read)', () => {
    const contactOps = async () => await import('../../../src/main_process/storage/contacts/operations.js');
    const transport = async () => await import('../../../src/main_process/network/server/transport.js');
    const vault = async () => await import('../../../src/main_process/network/vault/manager.js');
    const messagesOps = async () => await import('../../../src/main_process/storage/messages/operations.js');
    const reactionsOps = async () => await import('../../../src/main_process/storage/messages/reactions.js');

    const offlineContact = {
        upeerId: 'bob',
        publicKey: 'bb'.repeat(32),
        address: '200::bob',
        status: 'disconnected',
        signedPreKey: 'ee'.repeat(32),
        signedPreKeyId: 8,
        knownAddresses: '[]',
    };

    const connectedContact = {
        ...offlineContact,
        status: 'connected',
    };

    beforeEach(async () => {
        vi.clearAllMocks();
        const { resetEncryptedOperationRetries } =
            await import('../../../src/main_process/network/messaging/encryptedOperationRetry.js');
        resetEncryptedOperationRetries();
    });

    it('persiste la edición de un mensaje (CHAT_UPDATE) a un contacto offline en vault', async () => {
        vi.mocked((await contactOps()).getContactByUpeerId).mockResolvedValue(offlineContact as never);

        const { sendChatUpdate } = await import('../../../src/main_process/network/messaging/chatMutations.js');
        await sendChatUpdate('bob', 'msg-1', 'texto editado');

        expect((await vault()).VaultManager.replicateToVaults).toHaveBeenCalledWith(
            'bob',
            expect.objectContaining({ type: 'CHAT_UPDATE', msgId: 'msg-1' }),
        );
    });

    it('edita y entrega a un contacto connected por UDP y también vaultea', async () => {
        vi.mocked((await contactOps()).getContactByUpeerId).mockResolvedValue(connectedContact as never);

        const { sendChatUpdate } = await import('../../../src/main_process/network/messaging/chatMutations.js');
        await sendChatUpdate('bob', 'msg-1', 'texto editado online');

        expect((await transport()).sendSecureUDPMessage).toHaveBeenCalled();
        expect((await vault()).VaultManager.replicateToVaults).toHaveBeenCalledWith(
            'bob',
            expect.objectContaining({ type: 'CHAT_UPDATE', msgId: 'msg-1' }),
        );
    });

    it('persiste el borrado (CHAT_DELETE) de un mensaje en vault', async () => {
        vi.mocked((await contactOps()).getContactByUpeerId).mockResolvedValue(offlineContact as never);

        const { sendChatDelete } = await import('../../../src/main_process/network/messaging/chatMutations.js');
        await sendChatDelete('bob', 'msg-1');

        expect((await messagesOps()).deleteMessageLocally).toHaveBeenCalledWith('msg-1');
        expect((await vault()).VaultManager.replicateToVaults).toHaveBeenCalledWith(
            'bob',
            expect.objectContaining({ type: 'CHAT_DELETE', msgId: 'msg-1' }),
        );
    });

    it('persiste la reacción (CHAT_REACTION) a un contacto offline en vault', async () => {
        vi.mocked((await contactOps()).getContactByUpeerId).mockResolvedValue(offlineContact as never);

        const { sendChatReaction } = await import('../../../src/main_process/network/messaging/chatInteractions.js');
        await sendChatReaction('bob', 'msg-1', '👍', false);

        expect((await reactionsOps()).saveReaction).toHaveBeenCalled();
        expect((await vault()).VaultManager.replicateToVaults).toHaveBeenCalledWith(
            'bob',
            expect.objectContaining({ type: 'CHAT_REACTION', msgId: 'msg-1', emoji: '👍' }),
        );
    });

    it('persiste el receipt de lectura (READ) en vault', async () => {
        vi.mocked((await contactOps()).getContactByUpeerId).mockResolvedValue(offlineContact as never);

        const { sendReadReceipt } = await import('../../../src/main_process/network/messaging/chatInteractions.js');
        await sendReadReceipt('bob', 'msg-1');

        expect((await vault()).VaultManager.replicateToVaults).toHaveBeenCalledWith(
            'bob',
            expect.objectContaining({ type: 'READ', id: 'msg-1' }),
        );
    });
});

