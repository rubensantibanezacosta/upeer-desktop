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
        const stored = await (ChunkVault as ChunkVaultInternals)._distributeShards('file-hash', shards, 'recipient-id');

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

    it('distributes large-file shards across many connected custodians in round-robin order', async () => {
        const { ChunkVault } = await import('../../../src/main_process/network/vault/chunk-vault.js');
        const contactsOps = await import('../../../src/main_process/storage/contacts/operations.js');
        const assetOps = await import('../../../src/main_process/storage/vault/asset-operations.js');
        const transport = await import('../../../src/main_process/network/server/transport.js');

        vi.mocked(contactsOps.getContacts).mockResolvedValue([
            { upeerId: 'custodian-3', address: '200::3', status: 'connected', lastSeen: '2026-04-03T10:03:00.000Z' },
            { upeerId: 'custodian-1', address: '200::1', status: 'connected', lastSeen: '2026-04-03T10:05:00.000Z' },
            { upeerId: 'my-id', address: '200::self', status: 'connected', lastSeen: '2026-04-03T10:06:00.000Z' },
            { upeerId: 'custodian-5', address: '200::5', status: 'connected', lastSeen: '2026-04-03T10:01:00.000Z' },
            { upeerId: 'custodian-4', address: '200::4', status: 'connected', lastSeen: '2026-04-03T10:02:00.000Z' },
            { upeerId: 'custodian-2', address: '200::2', status: 'connected', lastSeen: '2026-04-03T10:04:00.000Z' },
        ] as never);

        const shards = Array.from({ length: 12 }, (_, index) => Buffer.from((index + 1).toString(16).padStart(2, '0'), 'hex'));
        const stored = await (ChunkVault as ChunkVaultInternals)._distributeShards('large-file-hash', shards, 'recipient-id');

        expect(stored).toBe(24);
        expect(transport.sendSecureUDPMessage).toHaveBeenCalledTimes(12);
        expect(transport.sendSecureUDPMessage).toHaveBeenNthCalledWith(1, '200::1', expect.objectContaining({ payloadHash: 'shard:large-file-hash:0:0' }));
        expect(transport.sendSecureUDPMessage).toHaveBeenNthCalledWith(2, '200::2', expect.objectContaining({ payloadHash: 'shard:large-file-hash:0:1' }));
        expect(transport.sendSecureUDPMessage).toHaveBeenNthCalledWith(3, '200::3', expect.objectContaining({ payloadHash: 'shard:large-file-hash:0:2' }));
        expect(transport.sendSecureUDPMessage).toHaveBeenNthCalledWith(4, '200::4', expect.objectContaining({ payloadHash: 'shard:large-file-hash:0:3' }));
        expect(transport.sendSecureUDPMessage).toHaveBeenNthCalledWith(5, '200::5', expect.objectContaining({ payloadHash: 'shard:large-file-hash:0:4' }));
        expect(transport.sendSecureUDPMessage).toHaveBeenNthCalledWith(6, '200::1', expect.objectContaining({ payloadHash: 'shard:large-file-hash:0:5' }));

        const remoteCustodians = vi.mocked(assetOps.trackDistributedAsset).mock.calls
            .map((call) => call[4])
            .filter((custodianSid) => custodianSid !== 'my-id');
        expect(new Set(remoteCustodians)).toEqual(new Set(['custodian-1', 'custodian-2', 'custodian-3', 'custodian-4', 'custodian-5']));
        expect(assetOps.trackDistributedAsset).toHaveBeenCalledTimes(24);
    });

    it('skips failed remote custodians while continuing distribution to the remaining peers', async () => {
        const { ChunkVault } = await import('../../../src/main_process/network/vault/chunk-vault.js');
        const contactsOps = await import('../../../src/main_process/storage/contacts/operations.js');
        const assetOps = await import('../../../src/main_process/storage/vault/asset-operations.js');
        const transport = await import('../../../src/main_process/network/server/transport.js');
        const dhtShared = await import('../../../src/main_process/network/dht/shared.js');

        vi.mocked(contactsOps.getContacts).mockResolvedValue([
            { upeerId: 'custodian-2', address: '200::2', status: 'connected', lastSeen: '2026-04-03T10:04:00.000Z' },
            { upeerId: 'custodian-3', address: '200::3', status: 'connected', lastSeen: '2026-04-03T10:03:00.000Z' },
            { upeerId: 'custodian-1', address: '200::1', status: 'connected', lastSeen: '2026-04-03T10:05:00.000Z' },
            { upeerId: 'my-id', address: '200::self', status: 'connected', lastSeen: '2026-04-03T10:06:00.000Z' },
        ] as never);

        vi.mocked(transport.sendSecureUDPMessage).mockImplementation(async (address: string) => {
            if (address === '200::2') {
                throw new Error('custodian-offline');
            }
        });

        const storeValue = vi.fn().mockResolvedValue(undefined);
        vi.mocked(dhtShared.getKademliaInstance).mockReturnValue({ storeValue } as never);

        const shards = Array.from({ length: 6 }, (_, index) => Buffer.from((index + 1).toString(16).padStart(2, '0'), 'hex'));
        const stored = await (ChunkVault as ChunkVaultInternals)._distributeShards('resilient-file-hash', shards, 'recipient-id');

        expect(transport.sendSecureUDPMessage).toHaveBeenCalledTimes(6);
        expect(stored).toBe(10);
        expect(assetOps.trackDistributedAsset).toHaveBeenCalledTimes(10);

        const remoteCustodians = vi.mocked(assetOps.trackDistributedAsset).mock.calls
            .map((call) => call[4])
            .filter((custodianSid) => custodianSid !== 'my-id');
        expect(remoteCustodians).toEqual(['custodian-1', 'custodian-3', 'custodian-1', 'custodian-3']);
        expect(remoteCustodians).not.toContain('custodian-2');

        expect(storeValue).toHaveBeenCalledTimes(4);
        expect(storeValue.mock.calls.every((call) => call[1].custodians.includes('custodian-2') === false)).toBe(true);
    });
});
