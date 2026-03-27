import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    trackDistributedAsset,
    getAssetHealth,
    updateAssetHealth,
    getAssetShards
} from '../../../src/main_process/storage/vault/asset-operations.js';
import { getDb } from '../../../src/main_process/storage/shared.js';

type MockDb = {
    select: ReturnType<typeof vi.fn>;
    insert: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
};

vi.mock('../../../src/main_process/storage/shared.js', () => ({
    getDb: vi.fn(),
    getSchema: vi.fn(),
    eq: (a: unknown, b: unknown) => ({ type: 'eq', a, b }),
}));

describe('Storage - Asset Operations', () => {
    const mockDb: MockDb = {
        select: vi.fn(),
        insert: vi.fn(),
        update: vi.fn(),
    };

    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(getDb).mockReturnValue(mockDb as ReturnType<typeof getDb>);
    });

    it('should track a distributed asset', async () => {
        const mockInsert = {
            values: vi.fn().mockReturnThis(),
            onConflictDoUpdate: vi.fn().mockResolvedValue({ changes: 1 })
        };
        mockDb.insert.mockReturnValue(mockInsert);

        await trackDistributedAsset('file1', 'cid1', 0, 10, 'custodian1');

        expect(mockDb.insert).toHaveBeenCalled();
        expect(mockInsert.values).toHaveBeenCalledWith(expect.objectContaining({
            fileHash: 'file1',
            cid: 'cid1'
        }));
    });

    it('should get asset health', async () => {
        const mockResult = [{ assetHash: 'h1', availableShards: 8 }];
        mockDb.select.mockReturnValue({
            from: vi.fn().mockReturnValue({
                where: vi.fn().mockReturnValue(mockResult)
            })
        });

        const health = await getAssetHealth('h1');
        expect(health).toEqual(mockResult[0]);
    });

    it('should return null if asset health not found', async () => {
        mockDb.select.mockReturnValue({
            from: vi.fn().mockReturnValue({
                where: vi.fn().mockReturnValue([])
            })
        });

        const health = await getAssetHealth('unknown');
        expect(health).toBeNull();
    });

    it('should update asset health', async () => {
        const mockInsert = {
            values: vi.fn().mockReturnThis(),
            onConflictDoUpdate: vi.fn().mockResolvedValue({ changes: 1 })
        };
        mockDb.insert.mockReturnValue(mockInsert);

        await updateAssetHealth('h1', 8, 10, 'healthy');

        expect(mockDb.insert).toHaveBeenCalled();
        expect(mockInsert.values).toHaveBeenCalledWith(expect.objectContaining({
            assetHash: 'h1',
            healthStatus: 'healthy'
        }));
    });

    it('should get asset shards', async () => {
        const mockShards = [{ fileHash: 'file1', cid: 'cid1' }];
        mockDb.select.mockReturnValue({
            from: vi.fn().mockReturnValue({
                where: vi.fn().mockReturnValue(mockShards)
            })
        });

        const shards = await getAssetShards('file1');
        expect(shards).toEqual(mockShards);
    });
});
