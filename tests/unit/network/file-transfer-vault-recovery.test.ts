import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
    app: {
        getPath: vi.fn(() => path.join(os.tmpdir(), 'chat-p2p-tests')),
    }
}));

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

vi.mock('../../../src/main_process/storage/vault/asset-operations.js', () => ({
    getAssetShards: vi.fn(),
}));

vi.mock('../../../src/main_process/storage/vault/operations.js', () => ({
    getVaultEntryByHash: vi.fn(),
}));

import { TransferManager } from '../../../src/main_process/network/file-transfer/transfer-manager.js';
import { TransferPhase } from '../../../src/main_process/network/file-transfer/types.js';
import { ErasureCoder } from '../../../src/main_process/network/vault/redundancy/erasure.js';
import { getAssetShards } from '../../../src/main_process/storage/vault/asset-operations.js';
import { getVaultEntryByHash } from '../../../src/main_process/storage/vault/operations.js';

describe('file transfer vault recovery', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('reconstructs a vaulted attachment and finalizes the receiving transfer', async () => {
        const manager = new TransferManager();
        manager.initialize(vi.fn(), {
            isDestroyed: vi.fn(() => false),
            webContents: {
                isDestroyed: vi.fn(() => false),
                send: vi.fn()
            }
        } as never);

        const fileId = '550e8400-e29b-41d4-a716-4466554400dd';
        const fileHash = 'f'.repeat(64);
        const plaintext = Buffer.from('vault recovered payload');
        const aesKey = crypto.randomBytes(32);
        const iv = crypto.randomBytes(12);
        const cipher = crypto.createCipheriv('aes-256-gcm', aesKey, iv);
        const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
        const sealedSegment = Buffer.concat([iv, cipher.getAuthTag(), encrypted]);
        const shards = new ErasureCoder(4, 8).encode(sealedSegment);

        const tracked = shards.slice(0, 4).map((shard, index) => ({
            cid: `shard:${fileHash}:0:${index}`,
            shardIndex: index,
            segmentIndex: 0,
            totalShards: 12,
            custodianSid: 'self-id',
            status: 'active'
        }));

        vi.mocked(getAssetShards).mockResolvedValue(tracked as never);
        vi.mocked(getVaultEntryByHash).mockImplementation(async (cid: string) => {
            const index = Number(cid.split(':').pop());
            return { data: shards[index].toString('hex') } as never;
        });

        manager.store.createTransfer({
            fileId,
            upeerId: 'peer-2',
            peerAddress: '200::peer-2',
            fileName: 'vault.bin',
            fileSize: plaintext.length,
            mimeType: 'application/octet-stream',
            totalChunks: 1,
            chunkSize: plaintext.length,
            fileHash,
            direction: 'receiving'
        });
        manager.store.updateTransfer(fileId, 'receiving', { state: 'active', phase: TransferPhase.TRANSFERRING });
        manager.transferKeys.set(fileId, aesKey);
        vi.spyOn(manager.validator, 'verifyFileHash').mockResolvedValue(undefined);

        await manager.tryRecoverVaultTransferByFileHash(fileHash);

        const transfer = manager.getTransfer(fileId, 'receiving');
        expect(transfer?.state).toBe('completed');
        expect(transfer?.phase).toBe(TransferPhase.DONE);
        expect(transfer?.tempPath).toBeTruthy();

        const recoveredPath = transfer?.tempPath;
        expect(recoveredPath).toBeTruthy();
        const recoveredData = await fs.readFile(recoveredPath!);
        expect(recoveredData.equals(plaintext)).toBe(true);

        await fs.rm(path.join(os.tmpdir(), 'chat-p2p-tests'), { recursive: true, force: true });
    });
});