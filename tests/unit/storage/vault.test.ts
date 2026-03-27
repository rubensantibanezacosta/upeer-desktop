import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    getVaultStats,
    getSenderUsage,
    saveVaultEntry,
    getVaultEntriesForRecipient,
    deleteVaultEntry,
    cleanupExpiredVaultEntries,
    getExpiringSoonEntries,
    getVaultEntryByHash,
    renewVaultEntry
} from '../../../src/main_process/storage/vault/operations.js';
import { getDb } from '../../../src/main_process/storage/shared.js';

type MockDb = {
    select: ReturnType<typeof vi.fn>;
    insert: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
};

vi.mock('../../../src/main_process/storage/shared.js', () => ({
    getDb: vi.fn(),
    getSchema: vi.fn(() => ({
        vaultStorage: {
            payloadHash: 'payloadHash',
            recipientSid: 'recipientSid',
            senderSid: 'senderSid',
            priority: 'priority',
            data: 'data',
            expiresAt: 'expiresAt'
        }
    })),
    eq: (a: unknown, b: unknown) => ({ type: 'eq', a, b }),
    lt: (a: unknown, b: unknown) => ({ type: 'lt', a, b }),
    gt: (a: unknown, b: unknown) => ({ type: 'gt', a, b }),
    and: (...args: unknown[]) => ({ type: 'and', args }),
    sql: {
        raw: (s: string) => s
    }
}));

describe('Storage - Vault Operations', () => {
    const mockDb: MockDb = {
        select: vi.fn(),
        insert: vi.fn(),
        delete: vi.fn(),
        update: vi.fn(),
    };

    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(getDb).mockReturnValue(mockDb as ReturnType<typeof getDb>);
    });

    it('should retrieve vault stats correctly', async () => {
        mockDb.select.mockReturnValue({
            from: vi.fn().mockReturnValue([{ count: 10, totalSize: 2048 }])
        });

        const stats = await getVaultStats();

        expect(stats.count).toBe(10);
        expect(stats.sizeBytes).toBe(1024);
        expect(mockDb.select).toHaveBeenCalled();
    });

    it('should return 0 stats when no entries exist', async () => {
        mockDb.select.mockReturnValue({
            from: vi.fn().mockReturnValue([])
        });

        const stats = await getVaultStats();

        expect(stats.count).toBe(0);
        expect(stats.sizeBytes).toBe(0);
    });

    it('should get sender usage', async () => {
        mockDb.select.mockReturnValue({
            from: vi.fn().mockReturnValue({
                where: vi.fn().mockReturnValue({
                    get: vi.fn().mockReturnValue({ usage: 100 })
                })
            })
        });

        const usage = await getSenderUsage('sender-1');
        expect(usage).toBe(50); // 100 / 2
    });

    it('should save a vault entry with conflict update', async () => {
        const mockInsertChain = {
            values: vi.fn().mockReturnThis(),
            onConflictDoUpdate: vi.fn().mockReturnThis()
        };
        mockDb.insert.mockReturnValue(mockInsertChain);

        await saveVaultEntry('hash1', 'recipient1', 'sender1', 1, 'deadbeef', 123456789);

        expect(mockDb.insert).toHaveBeenCalled();
        expect(mockInsertChain.values).toHaveBeenCalledWith(expect.objectContaining({
            payloadHash: 'hash1',
            data: 'deadbeef'
        }));
    });

    it('should retrieve non-expired entries for recipient', async () => {
        const mockEntries = [{ payloadHash: 'h1', data: 'd1' }];
        mockDb.select.mockReturnValue({
            from: vi.fn().mockReturnValue({
                where: vi.fn().mockReturnValue(mockEntries)
            })
        });

        const results = await getVaultEntriesForRecipient('recipient-sid');
        expect(results).toEqual(mockEntries);
        expect(mockDb.select).toHaveBeenCalled();
    });

    it('should delete vault entry and return boolean success', async () => {
        mockDb.delete.mockReturnValue({
            where: vi.fn().mockReturnValue({
                run: vi.fn().mockReturnValue({ changes: 1 })
            })
        });

        const success = await deleteVaultEntry('hash1');
        expect(success).toBe(true);
        expect(mockDb.delete).toHaveBeenCalled();
    });

    it('should return false if deleting non-existent entry', async () => {
        mockDb.delete.mockReturnValue({
            where: vi.fn().mockReturnValue({
                run: vi.fn().mockReturnValue({ changes: 0 })
            })
        });

        const success = await deleteVaultEntry('missing-hash');
        expect(success).toBe(false);
    });

    it('should cleanup expired entries', async () => {
        mockDb.delete.mockReturnValue({
            where: vi.fn().mockReturnValue({
                run: vi.fn().mockReturnValue({ changes: 5 })
            })
        });

        await cleanupExpiredVaultEntries();
        expect(mockDb.delete).toHaveBeenCalled();
    });

    it('should find expiring soon entries', async () => {
        const mockEntries = [{ payloadHash: 'exp1' }];
        mockDb.select.mockReturnValue({
            from: vi.fn().mockReturnValue({
                where: vi.fn().mockReturnValue(mockEntries)
            })
        });

        const results = await getExpiringSoonEntries(3600);
        expect(results).toEqual(mockEntries);
    });

    it('should get entry by hash', async () => {
        const mockEntry = { payloadHash: 'h1' };
        mockDb.select.mockReturnValue({
            from: vi.fn().mockReturnValue({
                where: vi.fn().mockReturnValue({
                    get: vi.fn().mockReturnValue(mockEntry)
                })
            })
        });

        const entry = await getVaultEntryByHash('h1');
        expect(entry).toEqual(mockEntry);
    });

    it('should renew vault entry', async () => {
        mockDb.update.mockReturnValue({
            set: vi.fn().mockReturnValue({
                where: vi.fn().mockReturnValue({
                    run: vi.fn().mockReturnValue({ changes: 1 })
                })
            })
        });

        const success = await renewVaultEntry('h1', 999999);
        expect(success).toBe(true);
        expect(mockDb.update).toHaveBeenCalled();
    });
});
