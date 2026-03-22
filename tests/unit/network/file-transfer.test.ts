import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TransferManager } from '../../../src/main_process/network/file-transfer/transfer-manager.js';
import { TransferPhase } from '../../../src/main_process/network/file-transfer/types.js';

vi.mock('../../../src/main_process/security/secure-logger.js', () => ({
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
}));

vi.mock('../../../src/main_process/security/identity.js', () => ({
    getMyUPeerId: vi.fn(() => 'my-peer-id'),
    sign: vi.fn(() => Buffer.from('signature')),
    verify: vi.fn(() => true),
    encrypt: vi.fn(() => ({ nonce: 'nonce', ciphertext: 'cipher' })),
    decrypt: vi.fn(() => Buffer.from('decrypted-key')),
}));

vi.mock('../../../src/main_process/storage/contacts/operations.js', () => ({
    getContactByUpeerId: vi.fn(async () => ({
        upeerId: 'peer1',
        publicKey: 'pubkey',
        status: 'connected'
    })),
    getContacts: vi.fn(async () => []),
}));

vi.mock('../../../src/main_process/storage/shared.js', () => ({
    getDb: vi.fn(),
}));

vi.mock('../../../src/main_process/network/file-transfer/db-helper.js', () => ({
    saveTransferToDB: vi.fn(async () => { }),
    updateTransferMessageStatus: vi.fn(async () => true),
}));

vi.mock('../../../src/main_process/security/reputation/vouches.js', () => ({
    computeScore: vi.fn(() => 100),
}));

vi.mock('../../../src/main_process/network/vault/manager.js', () => ({
    VaultManager: {
        replicateToVaults: vi.fn(async () => 3), // Simula que replica a 3 nodos
        getDynamicReplicationFactor: vi.fn(async () => 3),
    }
}));

describe('TransferManager - Integration', () => {
    let manager: TransferManager;
    const mockSend = vi.fn();
    const mockWindow = {
        isDestroyed: vi.fn(() => false),
        webContents: {
            send: vi.fn()
        }
    } as any;

    beforeEach(() => {
        vi.clearAllMocks();
        manager = new TransferManager();
        manager.initialize(mockSend, mockWindow);
    });

    it('should handle a complete sending flow from proposal to completion', async () => {
        // 1. Start sending
        // Mock validator to return valid file info
        (manager.validator as any).validateAndPrepareFile = vi.fn().mockResolvedValue({
            name: 'test.txt',
            size: 100,
            mimeType: 'text/plain',
            hash: 'hash123'
        });
        manager.chunker.calculateChunks = vi.fn().mockReturnValue(1);

        const fileId = await manager.startSend('peer1', 'addr1', '/path/to/test.txt');
        expect(fileId).toBeDefined();

        let transfer = manager.getTransfer(fileId, 'sending');
        expect(transfer?.phase).toBe(TransferPhase.PROPOSED);
        expect(mockSend).toHaveBeenCalledWith('addr1', expect.objectContaining({ type: 'FILE_PROPOSAL' }), 'pubkey');

        // 2. Peer accepts
        await manager.handleAccept('peer1', 'addr1', { type: 'FILE_ACCEPT', fileId, signature: 'sig' });
        transfer = manager.getTransfer(fileId, 'sending');
        expect(transfer?.phase).toBe(TransferPhase.TRANSFERRING);

        // 3. Peer ACKs the chunk (we only have 1 chunk)
        await manager.handleAck('peer1', 'addr1', { type: 'FILE_ACK', fileId, chunkIndex: 0 });
        transfer = manager.getTransfer(fileId, 'sending');
        expect(transfer?.chunksProcessed).toBe(1);

        // After last chunk ACK, sender sends FILE_DONE (as per sender-logic.ts)
        expect(mockSend).toHaveBeenCalledWith('addr1', { type: 'FILE_DONE', fileId }, 'pubkey');

        // 4. Peer sends FILE_DONE_ACK
        await manager.handleDoneAck(fileId);
        transfer = manager.getTransfer(fileId, 'sending');
        expect(transfer?.state).toBe('completed');
    });

    it('should handle a complete receiving flow', async () => {
        const fileId = '550e8400-e29b-41d4-a716-446655440000';
        const proposal = {
            type: 'FILE_PROPOSAL',
            fileId,
            fileName: 'remote.txt',
            fileSize: 50,
            mimeType: 'text/plain',
            totalChunks: 1,
            chunkSize: 1024,
            fileHash: 'a'.repeat(64),
            signature: 'sig'
        };

        // Mock validators to return true/void
        (manager.validator as any).validateIncomingFile = vi.fn().mockReturnValue(true);

        // 1. Receive proposal — now auto-accepts immediately
        await manager.handleFileProposal('peer1', 'addr1', proposal);
        let transfer = manager.getTransfer(fileId, 'receiving');
        expect(transfer).toBeDefined();
        expect(transfer?.phase).toBe(TransferPhase.TRANSFERRING);
        expect(mockSend).toHaveBeenCalledWith('addr1', expect.objectContaining({ type: 'FILE_ACCEPT' }), 'pubkey');

        // Force tempPath for testing (acceptTransfer doesn't set it, chunks do)
        manager.store.updateTransfer(fileId, 'receiving', { tempPath: '/tmp/test-file' });

        // 2. Handle chunk
        // Mock file handle operations
        const mockHandle = {
            write: vi.fn().mockResolvedValue({ bytesWritten: 50 }),
            close: vi.fn()
        };
        (manager as any).getFileHandle = vi.fn().mockReturnValue(mockHandle);
        (manager.validator as any).calculateFileHash = vi.fn().mockResolvedValue('a'.repeat(64));
        (manager.validator as any).validateAndPrepareFile = vi.fn().mockResolvedValue({
            name: 'remote.txt',
            size: 50,
            mimeType: 'text/plain',
            hash: 'a'.repeat(64)
        });

        await manager.handleFileChunk('peer1', 'addr1', {
            fileId,
            chunkIndex: 0,
            data: Buffer.from('hello').toString('base64')
        });

        transfer = manager.getTransfer(fileId, 'receiving');
        expect(transfer?.chunksProcessed).toBe(1);
        expect(mockSend).toHaveBeenCalledWith('addr1', { type: 'FILE_ACK', fileId, chunkIndex: 0 }, undefined);

        // Since it was the last chunk (totalChunks: 1), it should finalize
        expect(transfer?.state).toBe('completed');
    });

    it('should handle selective ACKs and retransmissions correctly', async () => {
        (manager.validator as any).validateAndPrepareFile = vi.fn().mockResolvedValue({
            name: 'retry.txt',
            size: 2048,
            mimeType: 'text/plain',
            hash: 'b'.repeat(64)
        });
        manager.chunker.calculateChunks = vi.fn().mockReturnValue(2);
        manager.config.maxChunkSize = 1024;

        // Mock file handle para leer
        const mockHandle = {
            read: vi.fn().mockImplementation(async (buf: Buffer) => {
                buf.fill(0);
                return { bytesRead: 1024 };
            }),
            close: vi.fn()
        };
        (manager as any).getFileHandle = vi.fn().mockReturnValue(mockHandle);

        const createdId = await manager.startSend('peer1', 'addr1', '/path/to/retry.txt');

        // Aceptar el transfer
        await manager.handleAccept('peer1', 'addr1', { type: 'FILE_ACCEPT', fileId: createdId, signature: 'sig' });

        // En el flujo real, handleAccept invoca sendNextChunks vía delegate
        // Si no lo hace, lo llamamos nosotros para el test
        const transfer = manager.getTransfer(createdId, 'sending');
        if (transfer) {
            await manager.sendNextChunks(transfer, 'addr1');
        }

        await new Promise(resolve => setTimeout(resolve, 500));

        // Filtramos solo los chunks de este transfer
        const currentMessages = mockSend.mock.calls
            .map(c => c[1])
            .filter(msg => msg.fileId === createdId && msg.type === 'FILE_CHUNK');

        // Debug help:
        // console.log('MESSAGES SENT:', currentMessages.map(m => m.chunkIndex));

        expect(currentMessages.length).toBeGreaterThan(0);

        // 4. Solo recibimos ACK para el chunk 1 (el 0 se "pierde")
        await manager.handleAck('peer1', 'addr1', { type: 'FILE_ACK', fileId: createdId, chunkIndex: 1 });

        // 5. Esperamos a que expire el timer del chunk 0 (5000ms)
        await new Promise(resolve => setTimeout(resolve, 5500));

        // 6. Debería haberse reenviado el chunk 0
        const retryCalls = mockSend.mock.calls
            .map(c => c[1])
            .filter(msg => msg.fileId === createdId && msg.type === 'FILE_CHUNK' && msg.chunkIndex === 0);

        expect(retryCalls.length).toBeGreaterThan(1);
    }, 25000);

    it('should handle transfer cancellation from user', async () => {
        (manager.validator as any).validateAndPrepareFile = vi.fn().mockResolvedValue({
            name: 'cancel.txt',
            size: 100,
            mimeType: 'text/plain',
            hash: 'c'.repeat(64)
        });

        // Forzamos el ID en el mock de creación si fuera necesario, o usamos el retornado
        const createdId = await manager.startSend('peer1', 'addr1', '/path/to/cancel.txt');
        manager.cancelTransfer(createdId, 'sending');

        const transfer = manager.getTransfer(createdId, 'sending');
        expect(transfer?.state).toBe('cancelled');
    });

    it('should handle peer cancellation', async () => {
        const fileId = '550e8400-e29b-41d4-a716-446655440003';
        // Simulamos que el peer nos propone algo
        (manager.validator as any).validateIncomingFile = vi.fn().mockReturnValue(true);
        await manager.handleFileProposal('peer1', 'addr1', {
            fileId,
            fileName: 'test.txt',
            fileSize: 100,
            mimeType: 'text/plain',
            totalChunks: 1,
            chunkSize: 1024,
            fileHash: 'd'.repeat(64),
            signature: 'sig'
        });

        // El peer cancela
        await manager.handleFileCancel('peer1', 'addr1', { fileId, reason: 'disk_full' });

        const transfer = manager.getTransfer(fileId, 'receiving');
        expect(transfer?.state).toBe('cancelled');
    });

    describe('Security & Resilience', () => {
        it('should reject file proposals with path traversal attempts in fileId', async () => {
            const malpropose = {
                type: 'FILE_PROPOSAL',
                fileId: '../../../etc/passwd',
                fileName: 'hack.txt',
                fileSize: 100,
                mimeType: 'text/plain',
                totalChunks: 1,
                chunkSize: 1024,
                fileHash: 'e'.repeat(64),
                signature: 'sig'
            };

            // Usamos la implementación real del validator para este test
            const realValidator = new (Object.getPrototypeOf(manager.validator).constructor)(100 * 1024 * 1024);
            (manager as any).validator = realValidator;

            await manager.handleFileProposal('peer1', 'addr1', malpropose);

            expect(manager.getTransfer(malpropose.fileId, 'receiving')).toBeUndefined();
        });

        it('should reject file proposals with invalid signatures', async () => {
            const proposal = {
                type: 'FILE_PROPOSAL',
                fileId: '550e8400-e29b-41d4-a716-446655440004',
                fileName: 'secure.txt',
                fileSize: 100,
                mimeType: 'text/plain',
                totalChunks: 1,
                chunkSize: 1024,
                fileHash: 'f'.repeat(64),
                signature: 'invalid-sig'
            };

            const { verify } = await import('../../../src/main_process/security/identity.js');
            (verify as any).mockReturnValue(false);

            await manager.handleFileProposal('peer1', 'addr1', proposal);
            expect(manager.getTransfer(proposal.fileId, 'receiving')).toBeUndefined();
        });

        it('should handle disk write errors gracefully during receiving', async () => {
            const fileId = '550e8400-e29b-41d4-a716-446655440005';

            // Forzar que el validador mockeado no tire error
            (manager.validator as any).validateIncomingFile = vi.fn().mockImplementation(() => { });

            await manager.store.createTransfer({
                fileId,
                upeerId: 'peer1',
                peerAddress: 'addr1',
                fileName: 'error.txt',
                fileSize: 100,
                mimeType: 'text/plain',
                totalChunks: 1,
                chunkSize: 1024,
                fileHash: 'a'.repeat(64),
                direction: 'receiving'
            });

            const transAfter = manager.getTransfer(fileId, 'receiving');
            expect(transAfter).toBeDefined();

            const mockHandle = {
                write: vi.fn().mockRejectedValue(new Error('No space left on device')),
                close: vi.fn()
            };
            (manager as any).getFileHandle = vi.fn().mockReturnValue(mockHandle);

            await manager.handleFileChunk('peer1', 'addr1', { fileId, chunkIndex: 0, data: 'AAAA' });

            expect(transAfter?.chunksProcessed).toBe(0);
        });

        it('should skip vaulting for large files to low-reputation recipients', async () => {
            const { computeScore } = await import('../../../src/main_process/security/reputation/vouches.js');
            (computeScore as any).mockReturnValue(10); // Baja reputación

            const fileId = '550e8400-e29b-41d4-a716-446655440006';
            const largeFileSize = 20 * 1024 * 1024; // > 10MB

            await manager.store.createTransfer({
                fileId,
                upeerId: 'peer_scammer',
                peerAddress: 'addr1',
                fileName: 'huge.iso',
                fileSize: largeFileSize,
                mimeType: 'application/octet-stream',
                totalChunks: 20000,
                chunkSize: 1024,
                fileHash: 'g'.repeat(64),
                direction: 'sending'
            });

            const aesKey = Buffer.alloc(32);

            await manager.startVaultingFailover(fileId, 'peer_scammer', 'pubkey', aesKey, {});

            // No debería haber mensajes de vaulting enviados
            const vaultMsgs = mockSend.mock.calls
                .map(c => c[1])
                .filter(msg => msg.fileId === fileId && msg.type === 'VAULT_STORE');

            expect(vaultMsgs.length).toBe(0);
        });

        it('should proceed with vaulting for small files regardless of reputation', async () => {
            const { computeScore } = await import('../../../src/main_process/security/reputation/vouches.js');
            (computeScore as any).mockReturnValue(10); // Baja reputación

            const fileId = '550e8400-e29b-41d4-a716-446655440007';
            const smallFileSize = 1 * 1024 * 1024; // 1MB < 10MB

            manager.store.createTransfer({
                fileId,
                upeerId: 'peer1',
                peerAddress: 'addr1',
                fileName: 'tiny.txt',
                fileSize: smallFileSize,
                mimeType: 'text/plain',
                totalChunks: 1000,
                chunkSize: 1024,
                fileHash: 'h'.repeat(64),
                direction: 'sending'
            });

            // Simulamos que el transfer tiene filePath y estado activo
            manager.store.updateTransfer(fileId, 'sending', { state: 'active', phase: TransferPhase.PROPOSED, filePath: '/tmp/test' });

            const aesKey = Buffer.allocUnsafe(32);
            await manager.startVaultingFailover(fileId, 'peer1', 'pubkey', aesKey, {});

            const transfer = manager.getTransfer(fileId, 'sending');
            expect(transfer?.phase).toBe(TransferPhase.REPLICATING);
        });
    });
});
