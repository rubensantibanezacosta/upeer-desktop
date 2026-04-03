import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TransferManager } from '../../../src/main_process/network/file-transfer/transfer-manager.js';
import { TransferPhase } from '../../../src/main_process/network/file-transfer/types.js';

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
    getContactByUpeerId: vi.fn(async (upeerId: string) => ({
        upeerId,
        publicKey: `${upeerId}-pub`,
        status: 'connected',
        address: `${upeerId}-addr`
    })),
    getContacts: vi.fn(() => []),
}));

vi.mock('../../../src/main_process/storage/shared.js', () => ({
    getDb: vi.fn(),
}));

vi.mock('../../../src/main_process/network/file-transfer/db-helper.js', () => ({
    saveTransferToDB: vi.fn(async () => { }),
    updateTransferMessageStatus: vi.fn(async () => true),
}));

describe('file transfer peer validation', () => {
    let manager: TransferManager;
    const sendMock = vi.fn();
    const windowMock = {
        isDestroyed: vi.fn(() => false),
        webContents: {
            isDestroyed: vi.fn(() => false),
            send: vi.fn(),
        }
    };

    beforeEach(() => {
        vi.clearAllMocks();
        manager = new TransferManager();
        manager.initialize(sendMock, windowMock as never);
    });

    it('ignora FILE_ACCEPT de un peer distinto al destinatario', async () => {
        const transfer = manager.store.createTransfer({
            fileId: 'file-1',
            upeerId: 'peer-owner',
            peerAddress: 'peer-owner-addr',
            fileName: 'demo.txt',
            fileSize: 10,
            mimeType: 'text/plain',
            totalChunks: 1,
            chunkSize: 1024,
            fileHash: 'a'.repeat(64),
            direction: 'sending',
            persistMessage: false,
        });

        manager.store.updateTransfer(transfer.fileId, 'sending', {
            phase: TransferPhase.PROPOSED,
            state: 'active',
        });

        await manager.handleAccept('peer-attacker', 'peer-attacker-addr', {
            fileId: transfer.fileId,
            signature: 'sig'
        });

        const updated = manager.getTransfer(transfer.fileId, 'sending');
        expect(updated?.phase).toBe(TransferPhase.PROPOSED);
        expect(sendMock).not.toHaveBeenCalled();
    });

    it('ignora FILE_ACK y FILE_DONE_ACK de peers distintos al destinatario', async () => {
        const transfer = manager.store.createTransfer({
            fileId: 'file-2',
            messageId: 'msg-2',
            upeerId: 'peer-owner',
            peerAddress: 'peer-owner-addr',
            fileName: 'demo.txt',
            fileSize: 10,
            mimeType: 'text/plain',
            totalChunks: 1,
            chunkSize: 1024,
            fileHash: 'b'.repeat(64),
            direction: 'sending',
            persistMessage: false,
        });

        manager.store.updateTransfer(transfer.fileId, 'sending', {
            phase: TransferPhase.TRANSFERRING,
            state: 'active',
            nextChunkIndex: 1,
            chunksProcessed: 0,
        });

        await manager.handleAck('peer-attacker', 'peer-attacker-addr', {
            fileId: transfer.fileId,
            chunkIndex: 0,
        });

        let updated = manager.getTransfer(transfer.fileId, 'sending');
        expect(updated?.chunksProcessed).toBe(0);
        expect(sendMock).not.toHaveBeenCalled();

        await manager.handleDoneAck('peer-attacker', transfer.fileId);

        updated = manager.getTransfer(transfer.fileId, 'sending');
        expect(updated?.state).toBe('active');
    });
});
