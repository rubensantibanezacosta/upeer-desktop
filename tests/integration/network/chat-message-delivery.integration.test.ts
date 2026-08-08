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
    getMessageById: vi.fn(),
}));

vi.mock('../../../src/main_process/storage/messages/status.js', () => ({
    getMessageStatus: vi.fn(),
}));

vi.mock('../../../src/main_process/storage/ratchet/operations.js', () => ({
    getRatchetSession: vi.fn(() => null),
    saveRatchetSession: vi.fn(),
}));

vi.mock('../../../src/main_process/storage/pending-outbox.js', () => ({
    savePendingOutboxMessage: vi.fn(),
    getPendingOutboxMessages: vi.fn(),
    deletePendingOutboxMessage: vi.fn(),
    flushPendingOutbox: vi.fn(),
}));

vi.mock('../../../src/main_process/security/identity.js', () => ({
    getMyPublicKeyHex: vi.fn(() => '11'.repeat(32)),
    getMyUPeerId: vi.fn(() => 'self-id'),
    sign: vi.fn(() => Buffer.from('sig')),
    encrypt: vi.fn(() => ({ ciphertext: 'ciphertext', nonce: 'nonce' })),
    getMyEphemeralPublicKeyHex: vi.fn(() => '22'.repeat(32)),
    incrementEphemeralMessageCounter: vi.fn(),
    getMyIdentitySkBuffer: vi.fn(() => Buffer.alloc(32)),
    getMySignedPreKey: vi.fn(() => ({ spkPub: '55'.repeat(32), spkSig: '66'.repeat(64), spkId: 13 })),
    getMyPublicKey: vi.fn(() => Buffer.from('11'.repeat(32), 'hex')),
}));

vi.mock('../../../src/main_process/security/ratchet.js', () => ({
    x3dhInitiator: vi.fn(() => ({
        ekPub: Buffer.from('33'.repeat(32), 'hex'),
        sharedSecret: Buffer.alloc(32, 7),
    })),
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

vi.mock('../../../src/main_process/network/dht/core.js', () => ({
    startDhtSearch: vi.fn(),
}));

vi.mock('../../../src/main_process/network/dht/handlers.js', () => ({
    getKademliaInstance: vi.fn(),
}));

vi.mock('../../../src/main_process/network/og-fetcher.js', () => ({
    fetchOgPreview: vi.fn(),
}));

vi.mock('../../../src/main_process/network/vault/manager.js', () => ({
    VaultManager: {
        replicateToVaults: vi.fn(),
    },
}));

vi.mock('../../../src/main_process/network/file-transfer/transfer-manager.js', () => ({
    fileTransferManager: {
        cancelTransfer: vi.fn(),
    },
}));

vi.mock('../../../src/main_process/utils/localAttachmentCleanup.js', () => ({
    extractLocalAttachmentInfo: vi.fn(),
    cleanupLocalAttachmentFile: vi.fn(),
}));

vi.mock('electron', () => ({
    BrowserWindow: {
        getAllWindows: vi.fn(() => [{ webContents: { send: vi.fn() } }]),
    },
}));

vi.mock('../../../src/main_process/sidecars/yggstack.js', () => ({
    getYggstackAddress: vi.fn(() => '200::self'),
}));

describe('no-pérdida de mensajes directos (sendUDPMessage)', () => {
    const contactOps = async () => await import('../../../src/main_process/storage/contacts/operations.js');
    const messagesOps = async () => await import('../../../src/main_process/storage/messages/operations.js');
    const statusOps = async () => await import('../../../src/main_process/storage/messages/status.js');
    const outboxOps = async () => await import('../../../src/main_process/storage/pending-outbox.js');
    const transport = async () => await import('../../../src/main_process/network/server/transport.js');
    const vault = async () => await import('../../../src/main_process/network/vault/manager.js');

    type SendUDPFn = typeof import('../../../src/main_process/network/messaging/chatSend.js').sendUDPMessage;
    let sendUDPMessage: SendUDPFn;

    const connectedContact = {
        upeerId: 'alice',
        publicKey: 'aa'.repeat(32),
        address: '200::alice',
        status: 'connected',
        signedPreKey: 'dd'.repeat(32),
        signedPreKeyId: 7,
        knownAddresses: '[]',
    };

    const offlineContact = {
        upeerId: 'bob',
        publicKey: 'bb'.repeat(32),
        address: '200::bob',
        status: 'disconnected',
        signedPreKey: 'ee'.repeat(32),
        signedPreKeyId: 8,
    };

    beforeEach(async () => {
        vi.clearAllMocks();
        vi.useRealTimers();
        const { resetPendingDirectMessages } = await import('../../../src/main_process/network/messaging/chatRetry.js');
        resetPendingDirectMessages();
        sendUDPMessage = (await import('../../../src/main_process/network/messaging/chatSend.js')).sendUDPMessage;
        vi.mocked((await messagesOps()).saveMessage).mockResolvedValue({ changes: 1 } as never);
        vi.mocked((await statusOps()).getMessageStatus).mockReturnValue('sent' as never);
    });

    it('persiste y entrega un mensaje a un contacto connected (no se pierde)', async () => {
        vi.mocked((await contactOps()).getContactByUpeerId).mockResolvedValue(connectedContact as never);
        vi.mocked((await messagesOps()).updateMessageStatus).mockResolvedValue(true);
        vi.mocked((await vault()).VaultManager.replicateToVaults).mockResolvedValue(1);

        const result = await sendUDPMessage('alice', 'hola');

        expect(result).toBeDefined();
        expect((await messagesOps()).saveMessage).toHaveBeenCalled();
        expect((await transport()).sendSecureUDPMessage).toHaveBeenCalled();
    });

    it('vaultea un mensaje connected sin ack al expirar el timeout (no se pierde)', async () => {
        vi.useFakeTimers();
        vi.mocked((await contactOps()).getContactByUpeerId).mockResolvedValue(connectedContact as never);
        vi.mocked((await messagesOps()).updateMessageStatus).mockResolvedValue(true);
        vi.mocked((await vault()).VaultManager.replicateToVaults).mockResolvedValue(1);
        vi.mocked((await statusOps()).getMessageStatus).mockReturnValue('sent' as never);

        await sendUDPMessage('alice', 'mensaje sin ack');

        await vi.advanceTimersByTimeAsync(3000);

        expect((await vault()).VaultManager.replicateToVaults).toHaveBeenCalled();
        expect((await messagesOps()).updateMessageStatus).toHaveBeenCalledWith(expect.any(String), 'vaulted');
    });

    it('persiste y vaultea un mensaje a un contacto offline (no se pierde)', async () => {
        vi.mocked((await contactOps()).getContactByUpeerId).mockResolvedValue(offlineContact as never);
        vi.mocked((await messagesOps()).updateMessageStatus).mockResolvedValue(true);
        vi.mocked((await vault()).VaultManager.replicateToVaults).mockResolvedValue(1);

        const result = await sendUDPMessage('bob', 'hola offline');

        expect(result).toBeDefined();
        expect((await messagesOps()).saveMessage).toHaveBeenCalled();
        expect((await vault()).VaultManager.replicateToVaults).toHaveBeenCalledWith(
            'bob',
            expect.objectContaining({ type: 'CHAT', senderUpeerId: 'self-id' }),
        );
        expect((await messagesOps()).updateMessageStatus).toHaveBeenCalledWith(expect.any(String), 'vaulted');
    });


    it('preserva el contenido en BD aunque el vault falle para un contacto offline', async () => {
        vi.mocked((await contactOps()).getContactByUpeerId).mockResolvedValue(offlineContact as never);
        vi.mocked((await messagesOps()).updateMessageStatus).mockResolvedValue(true);
        vi.mocked((await vault()).VaultManager.replicateToVaults).mockResolvedValue(0);

        const result = await sendUDPMessage('bob', 'contenido que no se pierde');

        expect(result).toBeDefined();
        expect((await messagesOps()).saveMessage).toHaveBeenCalled();
        expect((await messagesOps()).updateMessageStatus).toHaveBeenCalledWith(expect.any(String), 'failed');
        expect((await vault()).VaultManager.replicateToVaults).toHaveBeenCalled();
    });

    it('persiste en outbox un mensaje a un contacto sin pubkey (no se pierde, reintento en handshake)', async () => {
        vi.mocked((await contactOps()).getContactByUpeerId).mockResolvedValue({
            upeerId: 'carol',
            address: '200::carol',
            status: 'pending',
            publicKey: null,
        } as never);

        const result = await sendUDPMessage('carol', 'hola carol');

        expect(result).toBeDefined();
        expect((await messagesOps()).saveMessage).toHaveBeenCalled();
        expect((await outboxOps()).savePendingOutboxMessage).toHaveBeenCalledWith(
            'carol',
            expect.any(String),
            'hola carol',
            undefined
        );
    });

    it('rechaza un mensaje demasiado grande sin guardar nada (sin pérdida parcial)', async () => {
        const huge = 'x'.repeat(1_000_001);
        const result = await sendUDPMessage('alice', huge);

        expect(result).toBeUndefined();
        expect((await messagesOps()).saveMessage).not.toHaveBeenCalled();
        expect((await transport()).sendSecureUDPMessage).not.toHaveBeenCalled();
    });

    it('devuelve undefined si el contacto no existe (sin escritura parcial)', async () => {
        vi.mocked((await contactOps()).getContactByUpeerId).mockResolvedValue(undefined as never);

        const result = await sendUDPMessage('ghost', 'hola fantasma');

        expect(result).toBeUndefined();
        expect((await messagesOps()).saveMessage).not.toHaveBeenCalled();
    });

    it('registra el mensaje connected en pending direct para reintento al reconectar', async () => {
        vi.mocked((await contactOps()).getContactByUpeerId).mockResolvedValue(connectedContact as never);
        vi.mocked((await messagesOps()).updateMessageStatus).mockResolvedValue(true);
        vi.mocked((await vault()).VaultManager.replicateToVaults).mockResolvedValue(1);
        vi.mocked((await statusOps()).getMessageStatus).mockReturnValue('delivered' as never);

        await sendUDPMessage('alice', 'mensaje entregado');

        const { getPendingDirectCount } = await import('../../../src/main_process/network/messaging/chatRetry.js');
        expect(getPendingDirectCount('alice')).toBe(1);
    });

    it('reintenta y entrega mensajes pendientes cuando el peer reconecta (no se pierde)', async () => {
        vi.mocked((await contactOps()).getContactByUpeerId).mockResolvedValue(connectedContact as never);
        vi.mocked((await messagesOps()).updateMessageStatus).mockResolvedValue(true);
        vi.mocked((await vault()).VaultManager.replicateToVaults).mockResolvedValue(1);
        vi.mocked((await statusOps()).getMessageStatus).mockReturnValue('delivered' as never);

        await sendUDPMessage('alice', 'mensaje pendiente');
        const { retryPendingDirectMessages, getPendingDirectCount } =
            await import('../../../src/main_process/network/messaging/chatRetry.js');

        expect(getPendingDirectCount('alice')).toBe(1);
        expect((await transport()).sendSecureUDPMessage).toHaveBeenCalledTimes(1);

        const retried = await retryPendingDirectMessages('alice');

        expect(retried).toBe(1);
        expect(getPendingDirectCount('alice')).toBe(0);
        expect((await transport()).sendSecureUDPMessage).toHaveBeenCalledTimes(2);
    });

    it('retiene el mensaje pendiente si el peer sigue offline al reintentar (no lo descarta)', async () => {
        vi.mocked((await contactOps()).getContactByUpeerId).mockResolvedValue(connectedContact as never);
        vi.mocked((await messagesOps()).updateMessageStatus).mockResolvedValue(true);
        vi.mocked((await vault()).VaultManager.replicateToVaults).mockResolvedValue(1);
        vi.mocked((await statusOps()).getMessageStatus).mockReturnValue('delivered' as never);

        await sendUDPMessage('alice', 'mensaje aun offline');

        vi.mocked((await contactOps()).getContactByUpeerId).mockResolvedValue({
            ...offlineContact,
            upeerId: 'alice',
        } as never);

        const { retryPendingDirectMessages, getPendingDirectCount } =
            await import('../../../src/main_process/network/messaging/chatRetry.js');

        const retried = await retryPendingDirectMessages('alice');

        expect(retried).toBe(0);
        expect(getPendingDirectCount('alice')).toBe(1);
        expect((await transport()).sendSecureUDPMessage).toHaveBeenCalledTimes(1);
    });
});

