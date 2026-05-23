import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TransferManager } from '../../../src/main_process/network/file-transfer/transfer-manager.js';

vi.mock('../../../src/main_process/security/secure-logger.js', () => ({
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
    network: vi.fn(),
    security: vi.fn(),
}));

vi.mock('../../../src/main_process/security/identity.js', () => ({
    getMyUPeerId: vi.fn(() => 'self-id'),
    sign: vi.fn(() => Buffer.from('signature')),
    verify: vi.fn(() => true),
    encrypt: vi.fn(() => ({ nonce: 'nonce', ciphertext: 'cipher' })),
    decrypt: vi.fn(() => Buffer.from('decrypted-key')),
}));

vi.mock('../../../src/main_process/storage/contacts/operations.js', () => ({
    getContactByUpeerId: vi.fn(async () => ({
        upeerId: 'peer-2',
        publicKey: 'pubkey',
        status: 'offline'
    })),
    getContacts: vi.fn(async () => []),
}));

vi.mock('../../../src/main_process/network/file-transfer/db-helper.js', () => ({
    saveTransferToDB: vi.fn(async () => undefined),
    updateTransferMessageStatus: vi.fn(async () => true),
}));

vi.mock('../../../src/main_process/security/reputation/vouches.js', () => ({
    computeScore: vi.fn(() => 100),
}));

vi.mock('../../../src/main_process/network/vault/manager.js', () => ({
    VaultManager: {
        replicateToVaults: vi.fn(async () => 1),
    }
}));

vi.mock('../../../src/main_process/network/vault/chunk-vault.js', () => ({
    ChunkVault: {
        replicateFile: vi.fn(async () => undefined),
    },
}));

describe('file transfer small-network resilience', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('marks attachment as vaulted when only self-custodian is available', async () => {
        const manager = new TransferManager();
        manager.initialize(vi.fn(), {
            isDestroyed: vi.fn(() => false),
            webContents: {
                isDestroyed: vi.fn(() => false),
                send: vi.fn()
            }
        } as never);

        const fileId = '550e8400-e29b-41d4-a716-4466554400bb';
        manager.store.createTransfer({
            fileId,
            upeerId: 'peer-2',
            peerAddress: '200::peer-2-old',
            fileName: 'tiny.bin',
            fileSize: 2048,
            mimeType: 'application/octet-stream',
            totalChunks: 2,
            chunkSize: 1024,
            fileHash: 'd'.repeat(64),
            direction: 'sending'
        });
        manager.store.updateTransfer(fileId, 'sending', { state: 'active' });

        await manager.startVaultingFailover(fileId, 'peer-2', 'pubkey', Buffer.alloc(32), undefined);
        await new Promise((resolve) => setTimeout(resolve, 0));

        const dbHelper = await import('../../../src/main_process/network/file-transfer/db-helper.js');
        const { VaultManager } = await import('../../../src/main_process/network/vault/manager.js');
        expect(dbHelper.updateTransferMessageStatus).toHaveBeenCalledWith(fileId, 'vaulted');
        expect(VaultManager.replicateToVaults).toHaveBeenCalledWith(
            'peer-2',
            expect.objectContaining({
                type: 'FILE_PROPOSAL',
                fileId,
                fileName: 'tiny.bin',
                fileSize: 2048,
                totalChunks: 2,
                chunkSize: 1024,
                fileHash: 'd'.repeat(64),
                senderUpeerId: 'self-id',
                signature: Buffer.from('signature').toString('hex'),
            })
        );
    });

    it('starts shard vaulting for large attachments when only self-custodian is available', async () => {
        const manager = new TransferManager();
        manager.initialize(vi.fn(), {
            isDestroyed: vi.fn(() => false),
            webContents: {
                isDestroyed: vi.fn(() => false),
                send: vi.fn()
            }
        } as never);

        const fileId = '550e8400-e29b-41d4-a716-4466554400bc';
        manager.store.createTransfer({
            fileId,
            upeerId: 'peer-2',
            peerAddress: '200::peer-2-old',
            fileName: 'huge.bin',
            fileSize: 12 * 1024 * 1024,
            mimeType: 'application/octet-stream',
            totalChunks: 192,
            chunkSize: 64 * 1024,
            fileHash: 'e'.repeat(64),
            direction: 'sending',
            filePath: '/tmp/huge.bin',
            sanitizedPath: '/tmp/huge.bin'
        });
        manager.store.updateTransfer(fileId, 'sending', { state: 'active' });

        await manager.startVaultingFailover(fileId, 'peer-2', 'pubkey', Buffer.alloc(32), undefined);
        await new Promise((resolve) => setTimeout(resolve, 0));

        const chunkVault = await import('../../../src/main_process/network/vault/chunk-vault.js');
        const transfer = manager.getTransfer(fileId, 'sending');
        expect(chunkVault.ChunkVault.replicateFile).toHaveBeenCalledWith(
            'e'.repeat(64),
            '/tmp/huge.bin',
            expect.any(Buffer),
            'peer-2',
            fileId
        );
        expect(transfer?.phase).toBe(7);
        expect(transfer?.state).toBe('active');
    });
});
