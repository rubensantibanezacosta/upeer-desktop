import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/main_process/storage/vault/operations.js', () => ({
    saveVaultEntry: vi.fn(async () => true),
}));

vi.mock('../../../src/main_process/storage/vault/asset-operations.js', () => ({
    trackDistributedAsset: vi.fn(async () => true),
}));

vi.mock('../../../src/main_process/network/server/transport.js', () => ({
    sendSecureUDPMessage: vi.fn(),
}));

vi.mock('../../../src/main_process/security/identity.js', () => ({
    getMyUPeerId: vi.fn(() => 'my-id'),
}));

vi.mock('../../../src/main_process/storage/contacts/operations.js', () => ({
    getContacts: vi.fn(async () => []),
}));

vi.mock('../../../src/main_process/security/secure-logger.js', () => ({
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
}));

vi.mock('../../../src/main_process/network/dht/shared.js', () => ({
    getKademliaInstance: vi.fn(() => null),
}));

type ChunkVaultInternals = {
    _distributeShards: (fileHash: string, shards: Buffer[], recipientId: string) => Promise<number>;
};

describe('ChunkVault', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('persists shards locally when no remote custodians are available', async () => {
        const { ChunkVault } = await import('../../../src/main_process/network/vault/chunk-vault.js');
        const vaultOps = await import('../../../src/main_process/storage/vault/operations.js');
        const assetOps = await import('../../../src/main_process/storage/vault/asset-operations.js');
        const transport = await import('../../../src/main_process/network/server/transport.js');

        const shards = [Buffer.from('aa', 'hex'), Buffer.from('bb', 'hex')];
        const stored = await (ChunkVault as unknown as ChunkVaultInternals)._distributeShards('file-hash', shards, 'recipient-id');

        expect(stored).toBe(2);
        expect(vaultOps.saveVaultEntry).toHaveBeenCalledTimes(2);
        expect(vaultOps.saveVaultEntry).toHaveBeenNthCalledWith(
            1,
            'shard:file-hash:0:0',
            'recipient-id',
            'my-id',
            3,
            'aa',
            expect.any(Number)
        );
        expect(vaultOps.saveVaultEntry).toHaveBeenNthCalledWith(
            2,
            'shard:file-hash:0:1',
            'recipient-id',
            'my-id',
            3,
            'bb',
            expect.any(Number)
        );
        expect(assetOps.trackDistributedAsset).toHaveBeenNthCalledWith(1, 'file-hash', 'shard:file-hash:0:0', 0, 2, 'my-id', 0);
        expect(assetOps.trackDistributedAsset).toHaveBeenNthCalledWith(2, 'file-hash', 'shard:file-hash:0:1', 1, 2, 'my-id', 0);
        expect(transport.sendSecureUDPMessage).not.toHaveBeenCalled();
    });
});
