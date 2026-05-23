import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

const {
    mockDecryptSealed,
    vaultEntries,
    trackedAssets,
} = vi.hoisted(() => ({
    mockDecryptSealed: vi.fn(),
    vaultEntries: new Map<string, { payloadHash: string; recipientSid: string; senderSid: string; priority: number; data: string; expiresAt: number }>(),
    trackedAssets: [] as Array<{ fileHash: string; cid: string; shardIndex: number; totalShards: number; custodianSid: string; segmentIndex: number }>,
}));

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

vi.mock('../../../src/main_process/storage/contacts/operations.js', () => ({
    getContactByUpeerId: vi.fn(async (upeerId: string) => ({
        upeerId,
        address: '200::origin',
        publicKey: 'a'.repeat(64),
        status: 'connected'
    })),
    getContacts: vi.fn(async () => []),
}));

vi.mock('../../../src/main_process/security/identity.js', () => ({
    getMyUPeerId: vi.fn(() => 'self-id'),
    getMyPublicKeyHex: vi.fn(() => 'b'.repeat(64)),
    sign: vi.fn(() => Buffer.from('signature')),
    verify: vi.fn(() => true),
    decryptSealed: mockDecryptSealed,
}));

vi.mock('../../../src/main_process/security/validation.js', () => ({
    validateMessage: vi.fn(() => ({ valid: true })),
}));

vi.mock('../../../src/main_process/security/reputation/vouches.js', () => ({
    issueVouch: vi.fn(async () => true),
    VouchType: {
        VAULT_RETRIEVED: 'VAULT_RETRIEVED',
        INTEGRITY_FAIL: 'INTEGRITY_FAIL',
        VAULT_CHUNK: 'VAULT_CHUNK'
    }
}));

vi.mock('../../../src/main_process/network/file-transfer/db-helper.js', () => ({
    saveTransferToDB: vi.fn(async () => undefined),
    updateTransferMessageStatus: vi.fn(async () => true),
}));

vi.mock('../../../src/main_process/storage/vault/operations.js', () => ({
    saveVaultEntry: vi.fn(async (payloadHash: string, recipientSid: string, senderSid: string, priority: number, data: string, expiresAt: number) => {
        vaultEntries.set(payloadHash, { payloadHash, recipientSid, senderSid, priority, data, expiresAt });
    }),
    getVaultEntryByHash: vi.fn(async (payloadHash: string) => vaultEntries.get(payloadHash)),
}));

vi.mock('../../../src/main_process/storage/vault/asset-operations.js', () => ({
    trackDistributedAsset: vi.fn(async (fileHash: string, cid: string, shardIndex: number, totalShards: number, custodianSid: string, segmentIndex = 0) => {
        const existing = trackedAssets.findIndex((asset) => asset.cid === cid && asset.custodianSid === custodianSid);
        const next = { fileHash, cid, shardIndex, totalShards, custodianSid, segmentIndex };
        if (existing >= 0) trackedAssets.splice(existing, 1, next);
        else trackedAssets.push(next);
    }),
    getAssetShards: vi.fn(async (fileHash: string) => trackedAssets.filter((asset) => asset.fileHash === fileHash)),
}));

import { handleVaultDelivery } from '../../../src/main_process/network/handlers/vault.js';
import { fileTransferManager, TransferManager } from '../../../src/main_process/network/file-transfer/transfer-manager.js';
import { ErasureCoder } from '../../../src/main_process/network/vault/redundancy/erasure.js';
import { TransferPhase } from '../../../src/main_process/network/file-transfer/types.js';
import { VAULT_SEGMENT_SIZE } from '../../../src/main_process/network/vault/chunk-vault.js';
import { VaultManager } from '../../../src/main_process/network/vault/manager.js';
import * as identity from '../../../src/main_process/security/identity.js';
import * as contactsOps from '../../../src/main_process/storage/contacts/operations.js';

vi.mock('../../../src/main_process/network/server/transport.js', () => ({
    sendSecureUDPMessage: vi.fn(async () => undefined),
}));

vi.mock('../../../src/main_process/network/dht/shared.js', () => ({
    getKademliaInstance: vi.fn(() => null),
}));

describe('vault reconnect file transfer integration', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vaultEntries.clear();
        trackedAssets.splice(0, trackedAssets.length);
        fileTransferManager.store.clear();
        fileTransferManager.transferKeys.clear();
        fileTransferManager.initialize(vi.fn(), {
            isDestroyed: vi.fn(() => false),
            webContents: {
                isDestroyed: vi.fn(() => false),
                send: vi.fn()
            }
        } as never);
    });

    afterEach(async () => {
        await fs.rm(path.join(os.tmpdir(), 'chat-p2p-tests'), { recursive: true, force: true });
    });

    it('completes a vaulted attachment after reconnect through real VAULT_DELIVERY flow', async () => {
        const plaintext = Buffer.from('adjunto recuperado por reconnect desde vault');
        const fileHash = crypto.createHash('sha256').update(plaintext).digest('hex');
        const aesKey = crypto.randomBytes(32);
        mockDecryptSealed.mockReturnValue(aesKey);

        const iv = crypto.randomBytes(12);
        const cipher = crypto.createCipheriv('aes-256-gcm', aesKey, iv);
        const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
        const sealedSegment = Buffer.concat([iv, cipher.getAuthTag(), encrypted]);
        const shards = new ErasureCoder(4, 8).encode(sealedSegment);

        const proposal = {
            type: 'FILE_PROPOSAL',
            fileId: '550e8400-e29b-41d4-a716-4466554400ef',
            fileName: 'vaulted.bin',
            fileSize: plaintext.length,
            mimeType: 'application/octet-stream',
            totalChunks: 1,
            chunkSize: plaintext.length,
            fileHash,
            encryptedKey: 'aa',
            signature: 'sig'
        };

        await handleVaultDelivery('custodian-id', {
            entries: [{
                senderSid: 'origin-id',
                data: Buffer.from(JSON.stringify(proposal)).toString('hex'),
                payloadHash: 'proposal-hash'
            }]
        }, null, vi.fn(), '200::custodian');

        const receivingTransfer = fileTransferManager.getTransfer(proposal.fileId, 'receiving');
        expect(receivingTransfer?.phase).toBe(TransferPhase.TRANSFERRING);
        expect(fileTransferManager.transferKeys.get(proposal.fileId)?.equals(aesKey)).toBe(true);

        await handleVaultDelivery('custodian-id', {
            entries: shards.slice(0, 4).map((shard, index) => ({
                senderSid: 'origin-id',
                payloadHash: `shard:${fileHash}:0:${index}`,
                data: shard.toString('hex')
            }))
        }, null, vi.fn(), '200::custodian');

        const completedTransfer = fileTransferManager.getTransfer(proposal.fileId, 'receiving');
        expect(completedTransfer?.state).toBe('completed');
        expect(completedTransfer?.phase).toBe(TransferPhase.DONE);
        expect(completedTransfer?.tempPath).toBeTruthy();

        const recovered = await fs.readFile(completedTransfer!.tempPath!);
        expect(recovered.equals(plaintext)).toBe(true);
    });

    it('completes a large vaulted attachment across multiple segments after reconnect', async () => {
        const plaintext = crypto.randomBytes(VAULT_SEGMENT_SIZE + 8192);
        const fileHash = crypto.createHash('sha256').update(plaintext).digest('hex');
        const aesKey = crypto.randomBytes(32);
        mockDecryptSealed.mockReturnValue(aesKey);

        const buildSegmentShards = (segment: Buffer) => {
            const iv = crypto.randomBytes(12);
            const cipher = crypto.createCipheriv('aes-256-gcm', aesKey, iv);
            const encrypted = Buffer.concat([cipher.update(segment), cipher.final()]);
            const sealedSegment = Buffer.concat([iv, cipher.getAuthTag(), encrypted]);
            return new ErasureCoder(4, 8).encode(sealedSegment);
        };

        const firstSegment = plaintext.subarray(0, VAULT_SEGMENT_SIZE);
        const secondSegment = plaintext.subarray(VAULT_SEGMENT_SIZE);
        const firstShards = buildSegmentShards(firstSegment);
        const secondShards = buildSegmentShards(secondSegment);

        const proposal = {
            type: 'FILE_PROPOSAL',
            fileId: '550e8400-e29b-41d4-a716-4466554400f0',
            fileName: 'vaulted-large.bin',
            fileSize: plaintext.length,
            mimeType: 'application/octet-stream',
            totalChunks: Math.ceil(plaintext.length / (64 * 1024)),
            chunkSize: 64 * 1024,
            fileHash,
            encryptedKey: 'bb',
            signature: 'sig'
        };

        await handleVaultDelivery('custodian-id', {
            entries: [{
                senderSid: 'origin-id',
                data: Buffer.from(JSON.stringify(proposal)).toString('hex'),
                payloadHash: 'proposal-large-hash'
            }]
        }, null, vi.fn(), '200::custodian');

        await handleVaultDelivery('custodian-id', {
            entries: [
                ...firstShards.slice(0, 4).map((shard, index) => ({
                    senderSid: 'origin-id',
                    payloadHash: `shard:${fileHash}:0:${index}`,
                    data: shard.toString('hex')
                })),
                ...secondShards.slice(0, 4).map((shard, index) => ({
                    senderSid: 'origin-id',
                    payloadHash: `shard:${fileHash}:1:${index}`,
                    data: shard.toString('hex')
                }))
            ]
        }, null, vi.fn(), '200::custodian');

        const completedTransfer = fileTransferManager.getTransfer(proposal.fileId, 'receiving');
        expect(completedTransfer?.state).toBe('completed');
        expect(completedTransfer?.phase).toBe(TransferPhase.DONE);
        expect(completedTransfer?.tempPath).toBeTruthy();

        const recovered = await fs.readFile(completedTransfer!.tempPath!);
        expect(recovered.equals(plaintext)).toBe(true);
    });

    it('keeps a large vaulted attachment incomplete when a segment is missing required shards', async () => {
        const plaintext = crypto.randomBytes(VAULT_SEGMENT_SIZE + 8192);
        const fileHash = crypto.createHash('sha256').update(plaintext).digest('hex');
        const aesKey = crypto.randomBytes(32);
        mockDecryptSealed.mockReturnValue(aesKey);

        const buildSegmentShards = (segment: Buffer) => {
            const iv = crypto.randomBytes(12);
            const cipher = crypto.createCipheriv('aes-256-gcm', aesKey, iv);
            const encrypted = Buffer.concat([cipher.update(segment), cipher.final()]);
            const sealedSegment = Buffer.concat([iv, cipher.getAuthTag(), encrypted]);
            return new ErasureCoder(4, 8).encode(sealedSegment);
        };

        const firstSegment = plaintext.subarray(0, VAULT_SEGMENT_SIZE);
        const secondSegment = plaintext.subarray(VAULT_SEGMENT_SIZE);
        const firstShards = buildSegmentShards(firstSegment);
        const secondShards = buildSegmentShards(secondSegment);

        const proposal = {
            type: 'FILE_PROPOSAL',
            fileId: '550e8400-e29b-41d4-a716-4466554400f1',
            fileName: 'vaulted-large-incomplete.bin',
            fileSize: plaintext.length,
            mimeType: 'application/octet-stream',
            totalChunks: Math.ceil(plaintext.length / (64 * 1024)),
            chunkSize: 64 * 1024,
            fileHash,
            encryptedKey: 'cc',
            signature: 'sig'
        };

        await handleVaultDelivery('custodian-id', {
            entries: [{
                senderSid: 'origin-id',
                data: Buffer.from(JSON.stringify(proposal)).toString('hex'),
                payloadHash: 'proposal-large-incomplete-hash'
            }]
        }, null, vi.fn(), '200::custodian');

        await handleVaultDelivery('custodian-id', {
            entries: [
                ...firstShards.slice(0, 4).map((shard, index) => ({
                    senderSid: 'origin-id',
                    payloadHash: `shard:${fileHash}:0:${index}`,
                    data: shard.toString('hex')
                })),
                ...secondShards.slice(0, 3).map((shard, index) => ({
                    senderSid: 'origin-id',
                    payloadHash: `shard:${fileHash}:1:${index}`,
                    data: shard.toString('hex')
                }))
            ]
        }, null, vi.fn(), '200::custodian');

        const transfer = fileTransferManager.getTransfer(proposal.fileId, 'receiving');
        expect(transfer?.state).toBe('active');
        expect(transfer?.phase).toBe(TransferPhase.TRANSFERRING);
        expect(transfer?.chunksProcessed).toBe(Math.ceil(VAULT_SEGMENT_SIZE / (64 * 1024)));
        expect(transfer?.tempPath).toBeTruthy();

        const recovered = await fs.readFile(transfer!.tempPath!);
        expect(recovered.length).toBe(VAULT_SEGMENT_SIZE);
        expect(recovered.equals(firstSegment)).toBe(true);
    });

    it('completes a partially recovered large attachment when missing shards arrive later', async () => {
        const plaintext = crypto.randomBytes(VAULT_SEGMENT_SIZE + 8192);
        const fileHash = crypto.createHash('sha256').update(plaintext).digest('hex');
        const aesKey = crypto.randomBytes(32);
        mockDecryptSealed.mockReturnValue(aesKey);

        const buildSegmentShards = (segment: Buffer) => {
            const iv = crypto.randomBytes(12);
            const cipher = crypto.createCipheriv('aes-256-gcm', aesKey, iv);
            const encrypted = Buffer.concat([cipher.update(segment), cipher.final()]);
            const sealedSegment = Buffer.concat([iv, cipher.getAuthTag(), encrypted]);
            return new ErasureCoder(4, 8).encode(sealedSegment);
        };

        const firstSegment = plaintext.subarray(0, VAULT_SEGMENT_SIZE);
        const secondSegment = plaintext.subarray(VAULT_SEGMENT_SIZE);
        const firstShards = buildSegmentShards(firstSegment);
        const secondShards = buildSegmentShards(secondSegment);

        const proposal = {
            type: 'FILE_PROPOSAL',
            fileId: '550e8400-e29b-41d4-a716-4466554400f2',
            fileName: 'vaulted-large-late-complete.bin',
            fileSize: plaintext.length,
            mimeType: 'application/octet-stream',
            totalChunks: Math.ceil(plaintext.length / (64 * 1024)),
            chunkSize: 64 * 1024,
            fileHash,
            encryptedKey: 'dd',
            signature: 'sig'
        };

        await handleVaultDelivery('custodian-id', {
            entries: [{
                senderSid: 'origin-id',
                data: Buffer.from(JSON.stringify(proposal)).toString('hex'),
                payloadHash: 'proposal-large-late-complete-hash'
            }]
        }, null, vi.fn(), '200::custodian');

        await handleVaultDelivery('custodian-id', {
            entries: [
                ...firstShards.slice(0, 4).map((shard, index) => ({
                    senderSid: 'origin-id',
                    payloadHash: `shard:${fileHash}:0:${index}`,
                    data: shard.toString('hex')
                })),
                ...secondShards.slice(0, 3).map((shard, index) => ({
                    senderSid: 'origin-id',
                    payloadHash: `shard:${fileHash}:1:${index}`,
                    data: shard.toString('hex')
                }))
            ]
        }, null, vi.fn(), '200::custodian');

        const partialTransfer = fileTransferManager.getTransfer(proposal.fileId, 'receiving');
        expect(partialTransfer?.state).toBe('active');
        expect(partialTransfer?.phase).toBe(TransferPhase.TRANSFERRING);
        expect(partialTransfer?.chunksProcessed).toBe(Math.ceil(VAULT_SEGMENT_SIZE / (64 * 1024)));

        await handleVaultDelivery('custodian-id', {
            entries: secondShards.slice(3, 4).map((shard, index) => ({
                senderSid: 'origin-id',
                payloadHash: `shard:${fileHash}:1:${index + 3}`,
                data: shard.toString('hex')
            }))
        }, null, vi.fn(), '200::custodian');

        const completedTransfer = fileTransferManager.getTransfer(proposal.fileId, 'receiving');
        expect(completedTransfer?.state).toBe('completed');
        expect(completedTransfer?.phase).toBe(TransferPhase.DONE);
        expect(completedTransfer?.tempPath).toBeTruthy();

        const recovered = await fs.readFile(completedTransfer!.tempPath!);
        expect(recovered.equals(plaintext)).toBe(true);
    });

    it('reopens a failed receiving transfer when the vaulted FILE_PROPOSAL arrives again', async () => {
        const plaintext = Buffer.from('reintento vault proposal');
        const fileHash = crypto.createHash('sha256').update(plaintext).digest('hex');
        const aesKey = crypto.randomBytes(32);
        mockDecryptSealed.mockReturnValue(aesKey);

        const proposal = {
            type: 'FILE_PROPOSAL',
            fileId: '550e8400-e29b-41d4-a716-4466554400f3',
            fileName: 'vaulted-retry.bin',
            fileSize: plaintext.length,
            mimeType: 'application/octet-stream',
            totalChunks: 1,
            chunkSize: plaintext.length,
            fileHash,
            encryptedKey: 'ee',
            signature: 'sig'
        };

        fileTransferManager.store.createTransfer({
            fileId: proposal.fileId,
            messageId: proposal.fileId,
            upeerId: 'origin-id',
            chatUpeerId: 'origin-id',
            peerAddress: '200::stale',
            fileName: 'old-name.bin',
            fileSize: 1,
            mimeType: 'application/octet-stream',
            totalChunks: 1,
            chunkSize: 1,
            fileHash: 'f'.repeat(64),
            direction: 'receiving'
        });
        fileTransferManager.store.updateTransfer(proposal.fileId, 'receiving', {
            state: 'failed',
            phase: TransferPhase.PROPOSED,
            chunksProcessed: 1,
            pendingChunks: new Set([0]),
        });

        await handleVaultDelivery('custodian-id', {
            entries: [{
                senderSid: 'origin-id',
                data: Buffer.from(JSON.stringify(proposal)).toString('hex'),
                payloadHash: 'proposal-retry-hash'
            }]
        }, null, vi.fn(), '200::custodian');

        const reopenedTransfer = fileTransferManager.getTransfer(proposal.fileId, 'receiving');
        expect(reopenedTransfer?.state).toBe('active');
        expect(reopenedTransfer?.phase).toBe(TransferPhase.TRANSFERRING);
        expect(reopenedTransfer?.fileName).toBe('vaulted-retry.bin');
        expect(reopenedTransfer?.fileHash).toBe(fileHash);
        expect(reopenedTransfer?.peerAddress).toBe('200::custodian');
        expect(reopenedTransfer?.chunksProcessed).toBe(0);
        expect(reopenedTransfer?.pendingChunks.size).toBe(0);
        expect(fileTransferManager.transferKeys.get(proposal.fileId)?.equals(aesKey)).toBe(true);
    });

    it('recovers a large vaulted attachment after false online send and real two-peer reconnect', async () => {
        vi.useFakeTimers();

        try {
            const transport = await import('../../../src/main_process/network/server/transport.js');
            const chunkVault = await import('../../../src/main_process/network/vault/chunk-vault.js');
            const peerState = { recipientOnline: false, selfId: 'self-id' };
            vi.spyOn(chunkVault.ChunkVault, 'replicateFile').mockResolvedValue(undefined);
            const senderManager = new TransferManager();
            senderManager.initialize(vi.fn(), {
                isDestroyed: vi.fn(() => false),
                webContents: {
                    isDestroyed: vi.fn(() => false),
                    send: vi.fn()
                }
            } as never);

            vi.mocked(identity.getMyUPeerId).mockImplementation(() => peerState.selfId);
            vi.mocked(contactsOps.getContactByUpeerId).mockImplementation(async (upeerId: string) => {
                if (peerState.selfId === 'self-id') {
                    return {
                        upeerId,
                        address: '200::peer-2',
                        publicKey: 'a'.repeat(64),
                        status: 'connected'
                    } as never;
                }

                return {
                    upeerId,
                    address: '200::sender',
                    publicKey: 'a'.repeat(64),
                    status: 'connected'
                } as never;
            });
            vi.mocked(contactsOps.getContacts).mockImplementation(async () => {
                if (peerState.selfId === 'self-id') {
                    return [
                        { upeerId: 'self-id', address: '200::sender', status: 'connected' },
                        { upeerId: 'peer-2', address: '200::peer-2', status: 'connected' }
                    ] as never;
                }

                return [
                    { upeerId: 'peer-2', address: '200::peer-2', status: 'connected' },
                    { upeerId: 'self-id', address: '200::sender', status: 'connected' }
                ] as never;
            });
            vi.mocked(transport.sendSecureUDPMessage).mockImplementation(async (address: string, packet: { type?: string }) => {
                if (!peerState.recipientOnline && address === '200::peer-2' && packet?.type === 'VAULT_STORE') {
                    throw new Error('peer-2-offline');
                }
            });

            const plaintext = crypto.randomBytes(VAULT_SEGMENT_SIZE + 8192);
            const tempFile = path.join(os.tmpdir(), 'chat-p2p-tests', 'false-online-large.bin');
            await fs.mkdir(path.dirname(tempFile), { recursive: true });
            await fs.writeFile(tempFile, plaintext);

            const fileId = await senderManager.startSend('peer-2', '200::peer-2', tempFile);
            await vi.advanceTimersByTimeAsync(7000);
            vi.useRealTimers();

            const sendingTransfer = senderManager.getTransfer(fileId, 'sending');
            expect(sendingTransfer?.phase).toBe(TransferPhase.REPLICATING);

            const storedProposalEntry = [...vaultEntries.values()].find((entry) => {
                const decoded = JSON.parse(Buffer.from(entry.data, 'hex').toString());
                return decoded.type === 'FILE_PROPOSAL' && decoded.fileId === fileId;
            });
            expect(storedProposalEntry).toBeDefined();

            const recoveryKey = crypto.randomBytes(32);
            mockDecryptSealed.mockReturnValue(recoveryKey);

            const buildSegmentShards = (segment: Buffer) => {
                const iv = crypto.randomBytes(12);
                const cipher = crypto.createCipheriv('aes-256-gcm', recoveryKey, iv);
                const encrypted = Buffer.concat([cipher.update(segment), cipher.final()]);
                const sealedSegment = Buffer.concat([iv, cipher.getAuthTag(), encrypted]);
                return new ErasureCoder(4, 8).encode(sealedSegment);
            };

            const firstSegment = plaintext.subarray(0, VAULT_SEGMENT_SIZE);
            const secondSegment = plaintext.subarray(VAULT_SEGMENT_SIZE);
            const firstShards = buildSegmentShards(firstSegment);
            const secondShards = buildSegmentShards(secondSegment);

            const deliveredProposalEntry = {
                senderSid: 'self-id',
                payloadHash: 'proposal-two-peer-false-online-hash',
                data: Buffer.from(JSON.stringify({
                    type: 'FILE_PROPOSAL',
                    fileId,
                    fileName: 'false-online-large.bin',
                    fileSize: plaintext.length,
                    mimeType: 'application/octet-stream',
                    totalChunks: sendingTransfer!.totalChunks,
                    chunkSize: sendingTransfer!.chunkSize,
                    fileHash: sendingTransfer!.fileHash,
                    encryptedKey: 'ff',
                    signature: 'sig'
                })).toString('hex'),
            };
            const deliveredShardEntries = [
                ...firstShards.slice(0, 4).map((shard, index) => ({
                    senderSid: 'self-id',
                    payloadHash: `shard:${sendingTransfer!.fileHash}:0:${index}`,
                    data: shard.toString('hex'),
                })),
                ...secondShards.slice(0, 4).map((shard, index) => ({
                    senderSid: 'self-id',
                    payloadHash: `shard:${sendingTransfer!.fileHash}:1:${index}`,
                    data: shard.toString('hex'),
                }))
            ];

            trackedAssets.splice(0, trackedAssets.length);
            vaultEntries.clear();

            peerState.recipientOnline = true;
            peerState.selfId = 'peer-2';

            await VaultManager.queryOwnVaults();
            expect(transport.sendSecureUDPMessage).toHaveBeenCalledWith(
                '200::sender',
                expect.objectContaining({ type: 'VAULT_QUERY', requesterSid: 'peer-2' })
            );

            await handleVaultDelivery('self-id', {
                entries: [deliveredProposalEntry]
            }, null, vi.fn(), '200::sender');

            await handleVaultDelivery('self-id', {
                entries: deliveredShardEntries
            }, null, vi.fn(), '200::sender');

            for (let attempt = 0; attempt < 20; attempt++) {
                const current = fileTransferManager.getTransfer(fileId, 'receiving');
                if (current?.state === 'completed') break;
                await new Promise((resolve) => setTimeout(resolve, 0));
            }

            const recoveredTransfer = fileTransferManager.getTransfer(fileId, 'receiving');
            expect(recoveredTransfer?.state).toBe('completed');
            expect(recoveredTransfer?.phase).toBe(TransferPhase.DONE);
            expect(recoveredTransfer?.tempPath).toBeTruthy();

            const recovered = await fs.readFile(recoveredTransfer!.tempPath!);
            expect(recovered.equals(plaintext)).toBe(true);
        } finally {
            vi.useRealTimers();
        }
    });
});