import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TransferManager } from '../../../src/main_process/network/file-transfer/transfer-manager.js';
import { TransferPhase } from '../../../src/main_process/network/file-transfer/types.js';
import * as identity from '../../../src/main_process/security/identity.js';
import * as reputation from '../../../src/main_process/security/reputation/vouches.js';

type TransferManagerSend = Parameters<TransferManager['initialize']>[0];
type TransferManagerWindow = Parameters<TransferManager['initialize']>[1];
type TransferValidatorInternals = TransferManager['validator'] & {
    calculateFileHash(filePath: string): Promise<string>;
};

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
    const mockSend: TransferManagerSend = vi.fn();
    const mockWindow = {
        isDestroyed: vi.fn(() => false),
        webContents: {
            isDestroyed: vi.fn(() => false),
            send: vi.fn()
        }
    } as TransferManagerWindow;

    beforeEach(() => {
        vi.clearAllMocks();
        manager = new TransferManager();
        manager.initialize(mockSend, mockWindow);
    });

    it('should handle a complete sending flow from proposal to completion', async () => {
        vi.spyOn(manager.validator, 'validateAndPrepareFile').mockResolvedValue({
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

        await manager.handleAccept('peer1', 'addr1', { type: 'FILE_ACCEPT', fileId, signature: 'sig' });
        transfer = manager.getTransfer(fileId, 'sending');
        expect(transfer?.phase).toBe(TransferPhase.TRANSFERRING);

        await manager.handleAck('peer1', 'addr1', { type: 'FILE_ACK', fileId, chunkIndex: 0 });
        transfer = manager.getTransfer(fileId, 'sending');
        expect(transfer?.chunksProcessed).toBe(1);

        expect(mockSend).toHaveBeenCalledWith('addr1', { type: 'FILE_DONE', fileId }, 'pubkey');

        await manager.handleDoneAck(fileId);
        transfer = manager.getTransfer(fileId, 'sending');
        expect(transfer?.state).toBe('completed');
    });

    it('should include isVoiceNote in FILE_PROPOSAL when sending a voice note', async () => {
        vi.spyOn(manager.validator, 'validateAndPrepareFile').mockResolvedValue({
            name: 'voice.webm',
            size: 100,
            mimeType: 'audio/webm',
            hash: 'voicehash123'
        });
        manager.chunker.calculateChunks = vi.fn().mockReturnValue(1);

        await manager.startSend('peer1', 'addr1', '/path/to/voice.webm', undefined, undefined, true, 'voice.webm');

        expect(mockSend).toHaveBeenCalledWith(
            'addr1',
            expect.objectContaining({
                type: 'FILE_PROPOSAL',
                isVoiceNote: true,
                fileName: 'voice.webm',
                mimeType: 'audio/webm'
            }),
            'pubkey'
        );
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

        vi.spyOn(manager.validator, 'validateIncomingFile').mockImplementation(() => undefined);

        await manager.handleFileProposal('peer1', 'addr1', proposal);
        let transfer = manager.getTransfer(fileId, 'receiving');
        expect(transfer).toBeDefined();
        expect(transfer?.phase).toBe(TransferPhase.TRANSFERRING);
        expect(mockSend).toHaveBeenCalledWith('addr1', expect.objectContaining({ type: 'FILE_ACCEPT' }), 'pubkey');

        manager.store.updateTransfer(fileId, 'receiving', { tempPath: '/tmp/test-file' });

        const mockHandle = {
            write: vi.fn().mockResolvedValue({ bytesWritten: 50 }),
            close: vi.fn()
        };
        vi.spyOn(manager, 'getFileHandle').mockReturnValue(mockHandle as ReturnType<TransferManager['getFileHandle']>);
        vi.spyOn(manager.validator as TransferValidatorInternals, 'calculateFileHash').mockResolvedValue('a'.repeat(64));
        vi.spyOn(manager.validator, 'validateAndPrepareFile').mockResolvedValue({
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

        expect(transfer?.state).toBe('completed');
    });

    it('should preserve isVoiceNote in receiving flow and notify renderer with it', async () => {
        const fileId = '550e8400-e29b-41d4-a716-446655440099';
        const proposal = {
            type: 'FILE_PROPOSAL',
            fileId,
            fileName: 'voice.webm',
            fileSize: 50,
            mimeType: 'audio/webm',
            totalChunks: 1,
            chunkSize: 1024,
            fileHash: 'f'.repeat(64),
            isVoiceNote: true,
            signature: 'sig'
        };

        vi.spyOn(manager.validator, 'validateIncomingFile').mockImplementation(() => undefined);

        await manager.handleFileProposal('peer1', 'addr1', proposal);

        const transfer = manager.getTransfer(fileId, 'receiving');
        expect(transfer?.isVoiceNote).toBe(true);

        expect(mockWindow.webContents.send).toHaveBeenCalledWith(
            'receive-p2p-message',
            expect.objectContaining({
                id: fileId,
                message: expect.stringContaining('"isVoiceNote":true')
            })
        );
    });

    it('should preserve group context in FILE_PROPOSAL and notify renderer as group message', async () => {
        const fileId = '550e8400-e29b-41d4-a716-446655440088';
        const proposal = {
            type: 'FILE_PROPOSAL',
            fileId,
            fileName: 'group.txt',
            fileSize: 50,
            mimeType: 'text/plain',
            totalChunks: 1,
            chunkSize: 1024,
            fileHash: 'e'.repeat(64),
            chatUpeerId: 'grp-123',
            signature: 'sig'
        };

        vi.spyOn(manager.validator, 'validateIncomingFile').mockImplementation(() => undefined);

        await manager.handleFileProposal('peer1', 'addr1', proposal);

        const transfer = manager.getTransfer(fileId, 'receiving');
        expect(transfer?.chatUpeerId).toBe('grp-123');

        expect(mockWindow.webContents.send).toHaveBeenCalledWith(
            'receive-group-message',
            expect.objectContaining({
                id: fileId,
                groupId: 'grp-123',
                senderUpeerId: 'peer1'
            })
        );
    });

    it('should preserve caption and voice note metadata for group attachments', async () => {
        const fileId = '550e8400-e29b-41d4-a716-446655440077';
        const proposal = {
            type: 'FILE_PROPOSAL',
            fileId,
            fileName: 'voice-note.webm',
            fileSize: 50,
            mimeType: 'audio/webm',
            totalChunks: 1,
            chunkSize: 1024,
            fileHash: 'd'.repeat(64),
            chatUpeerId: 'grp-123',
            caption: 'nota rápida',
            isVoiceNote: true,
            signature: 'sig'
        };

        vi.spyOn(manager.validator, 'validateIncomingFile').mockImplementation(() => undefined);

        await manager.handleFileProposal('peer1', 'addr1', proposal);

        const transfer = manager.getTransfer(fileId, 'receiving');
        expect(transfer?.chatUpeerId).toBe('grp-123');
        expect(transfer?.caption).toBe('nota rápida');
        expect(transfer?.isVoiceNote).toBe(true);

        expect(mockWindow.webContents.send).toHaveBeenCalledWith(
            'receive-group-message',
            expect.objectContaining({
                id: fileId,
                groupId: 'grp-123',
                senderUpeerId: 'peer1',
                message: expect.stringContaining('"caption":"nota rápida"')
            })
        );
        expect(mockWindow.webContents.send).toHaveBeenCalledWith(
            'receive-group-message',
            expect.objectContaining({
                message: expect.stringContaining('"isVoiceNote":true')
            })
        );
    });

    it('should include group chat context in outgoing FILE_PROPOSAL', async () => {
        vi.spyOn(manager.validator, 'validateAndPrepareFile').mockResolvedValue({
            name: 'group.txt',
            size: 100,
            mimeType: 'text/plain',
            hash: 'grouphash123'
        });
        manager.chunker.calculateChunks = vi.fn().mockReturnValue(1);

        await manager.startSend('peer1', 'addr1', '/path/to/group.txt', undefined, undefined, false, 'group.txt', { chatUpeerId: 'grp-123' });

        expect(mockSend).toHaveBeenCalledWith(
            'addr1',
            expect.objectContaining({
                type: 'FILE_PROPOSAL',
                chatUpeerId: 'grp-123'
            }),
            'pubkey'
        );
    });

    it('should include shared messageId in outgoing FILE_PROPOSAL', async () => {
        vi.spyOn(manager.validator, 'validateAndPrepareFile').mockResolvedValue({
            name: 'group.txt',
            size: 100,
            mimeType: 'text/plain',
            hash: 'messageidhash123'
        });
        manager.chunker.calculateChunks = vi.fn().mockReturnValue(1);

        await manager.startSend('peer1', 'addr1', '/path/to/group.txt', undefined, undefined, false, 'group.txt', { messageId: 'msg-group-1', chatUpeerId: 'grp-123' });

        expect(mockSend).toHaveBeenCalledWith(
            'addr1',
            expect.objectContaining({
                type: 'FILE_PROPOSAL',
                messageId: 'msg-group-1',
                chatUpeerId: 'grp-123'
            }),
            'pubkey'
        );
    });

    it('should cancel grouped sender transfers by logical message id', async () => {
        manager.store.createTransfer({
            fileId: 'session-1',
            messageId: 'msg-group-1',
            upeerId: 'peer1',
            chatUpeerId: 'grp-123',
            peerAddress: 'addr1',
            fileName: 'group.txt',
            fileSize: 100,
            mimeType: 'text/plain',
            totalChunks: 1,
            chunkSize: 1024,
            fileHash: 'a'.repeat(64),
            direction: 'sending',
            persistMessage: false
        });
        manager.store.createTransfer({
            fileId: 'session-2',
            messageId: 'msg-group-1',
            upeerId: 'peer2',
            chatUpeerId: 'grp-123',
            peerAddress: 'addr2',
            fileName: 'group.txt',
            fileSize: 100,
            mimeType: 'text/plain',
            totalChunks: 1,
            chunkSize: 1024,
            fileHash: 'b'.repeat(64),
            direction: 'sending',
            persistMessage: false
        });

        manager.cancelTransfer('msg-group-1', 'User cancelled');

        expect(manager.getTransfer('session-1', 'sending')?.state).toBe('cancelled');
        expect(manager.getTransfer('session-2', 'sending')?.state).toBe('cancelled');
    });

    it('should accept vault-delivered FILE_PROPOSAL signed without sender metadata', async () => {
        vi.mocked(identity.verify).mockImplementation((message: Buffer) => !message.toString().includes('"senderUpeerId"'));

        const fileId = '550e8400-e29b-41d4-a716-446655440005';
        const proposal = {
            type: 'FILE_PROPOSAL',
            fileId,
            fileName: 'vaulted.txt',
            fileSize: 50,
            mimeType: 'text/plain',
            totalChunks: 1,
            chunkSize: 1024,
            fileHash: 'b'.repeat(64),
            senderUpeerId: 'peer1',
            signature: 'sig'
        };

        vi.spyOn(manager.validator, 'validateIncomingFile').mockImplementation(() => undefined);

        await manager.handleFileProposal('peer1', 'addr1', proposal);

        const transfer = manager.getTransfer(fileId, 'receiving');
        expect(transfer).toBeDefined();
        expect(mockSend).toHaveBeenCalledWith('addr1', expect.objectContaining({ type: 'FILE_ACCEPT' }), 'pubkey');

        vi.mocked(identity.verify).mockImplementation(() => true);
    });

    it('should handle selective ACKs and retransmissions correctly', async () => {
        vi.spyOn(manager.validator, 'validateAndPrepareFile').mockResolvedValue({
            name: 'retry.txt',
            size: 2048,
            mimeType: 'text/plain',
            hash: 'b'.repeat(64)
        });
        manager.chunker.calculateChunks = vi.fn().mockReturnValue(2);
        manager.config.maxChunkSize = 1024;

        const mockHandle = {
            read: vi.fn().mockImplementation(async (buf: Buffer) => {
                buf.fill(0);
                return { bytesRead: 1024 };
            }),
            close: vi.fn()
        };
        vi.spyOn(manager, 'getFileHandle').mockReturnValue(mockHandle as ReturnType<TransferManager['getFileHandle']>);

        const createdId = await manager.startSend('peer1', 'addr1', '/path/to/retry.txt');

        await manager.handleAccept('peer1', 'addr1', { type: 'FILE_ACCEPT', fileId: createdId, signature: 'sig' });

        const transfer = manager.getTransfer(createdId, 'sending');
        if (transfer) {
            await manager.sendNextChunks(transfer, 'addr1');
        }

        await new Promise(resolve => setTimeout(resolve, 500));

        // Filtramos solo los chunks de este transfer
        const currentMessages = mockSend.mock.calls
            .map(c => c[1])
            .filter(msg => msg.fileId === createdId && msg.type === 'FILE_CHUNK');

        expect(currentMessages.length).toBeGreaterThan(0);

        await manager.handleAck('peer1', 'addr1', { type: 'FILE_ACK', fileId: createdId, chunkIndex: 1 });

        await new Promise(resolve => setTimeout(resolve, 5500));

        const retryCalls = mockSend.mock.calls
            .map(c => c[1])
            .filter(msg => msg.fileId === createdId && msg.type === 'FILE_CHUNK' && msg.chunkIndex === 0);

        expect(retryCalls.length).toBeGreaterThan(1);
    }, 25000);

    it('should handle transfer cancellation from user', async () => {
        vi.spyOn(manager.validator, 'validateAndPrepareFile').mockResolvedValue({
            name: 'cancel.txt',
            size: 100,
            mimeType: 'text/plain',
            hash: 'c'.repeat(64)
        });

        const createdId = await manager.startSend('peer1', 'addr1', '/path/to/cancel.txt');
        manager.cancelTransfer(createdId, 'sending');

        const transfer = manager.getTransfer(createdId, 'sending');
        expect(transfer?.state).toBe('cancelled');
    });

    it('should notify file-transfer-failed when a stale transfer is marked failed', () => {
        const transfer = manager.store.createTransfer({
            fileId: 'stale-file',
            upeerId: 'peer1',
            peerAddress: 'addr1',
            fileName: 'stale.txt',
            fileSize: 100,
            mimeType: 'text/plain',
            totalChunks: 1,
            chunkSize: 1024,
            fileHash: 'f'.repeat(64),
            direction: 'sending',
            filePath: '/tmp/stale.txt'
        });

        manager.store.updateTransfer(transfer.fileId, 'sending', {
            state: 'active',
            phase: TransferPhase.TRANSFERRING,
        });
        const current = manager.getTransfer(transfer.fileId, 'sending');
        if (!current) throw new Error('Transfer not found');
        current.lastActivity = Date.now() - 10_000;

        manager.checkStaleTransfers(1000);

        expect(mockWindow.webContents.send).toHaveBeenCalledWith(
            'file-transfer-failed',
            expect.objectContaining({
                fileId: 'stale-file',
                reason: 'peer_disconnected',
                state: 'failed'
            })
        );
    });

    it('should handle peer cancellation', async () => {
        const fileId = '550e8400-e29b-41d4-a716-446655440003';
        // Simulamos que el peer nos propone algo
        vi.spyOn(manager.validator, 'validateIncomingFile').mockImplementation(() => undefined);
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

            const realValidator = new (Object.getPrototypeOf(manager.validator).constructor)(100 * 1024 * 1024);
            manager.validator = realValidator;

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

            vi.mocked(identity.verify).mockReturnValue(false);

            await manager.handleFileProposal('peer1', 'addr1', proposal);
            expect(manager.getTransfer(proposal.fileId, 'receiving')).toBeUndefined();
        });

        it('should handle disk write errors gracefully during receiving', async () => {
            const fileId = '550e8400-e29b-41d4-a716-446655440005';

            vi.spyOn(manager.validator, 'validateIncomingFile').mockImplementation(() => undefined);

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
            vi.spyOn(manager, 'getFileHandle').mockReturnValue(mockHandle as ReturnType<TransferManager['getFileHandle']>);

            await manager.handleFileChunk('peer1', 'addr1', { fileId, chunkIndex: 0, data: 'AAAA' });

            expect(transAfter?.chunksProcessed).toBe(0);
        });

        it('should skip vaulting for large files to low-reputation recipients', async () => {
            vi.mocked(reputation.computeScore).mockReturnValue(10);

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

            const vaultMsgs = mockSend.mock.calls
                .map(c => c[1])
                .filter(msg => msg.fileId === fileId && msg.type === 'VAULT_STORE');

            expect(vaultMsgs.length).toBe(0);
        });

        it('should proceed with vaulting for small files regardless of reputation', async () => {
            vi.mocked(reputation.computeScore).mockReturnValue(10);

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

            manager.store.updateTransfer(fileId, 'sending', { state: 'active', phase: TransferPhase.PROPOSED, filePath: '/tmp/test' });

            const aesKey = Buffer.allocUnsafe(32);
            await manager.startVaultingFailover(fileId, 'peer1', 'pubkey', aesKey, {});

            const transfer = manager.getTransfer(fileId, 'sending');
            expect(transfer?.phase).toBe(TransferPhase.REPLICATING);
        });
    });
});
