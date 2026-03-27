import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    insertVouch,
    vouchExists,
    getVouchIds,
    getVouchesByIds,
    getVouchesForNode,
    countRecentVouchesByFrom
} from '../../../src/main_process/storage/reputation/operations.js';
import { getDb, getSchema } from '../../../src/main_process/storage/shared.js';

type MockDb = {
    insert: ReturnType<typeof vi.fn>;
    select: ReturnType<typeof vi.fn>;
};

vi.mock('../../../src/main_process/storage/shared.js', () => ({
    getDb: vi.fn(),
    getSchema: vi.fn(() => ({
        reputationVouches: {
            id: 'id',
            fromId: 'fromId',
            toId: 'toId',
            type: 'type',
            positive: 'positive',
            timestamp: 'timestamp',
            signature: 'signature',
            receivedAt: 'receivedAt'
        }
    })),
    eq: (a: unknown, b: unknown) => ({ type: 'eq', a, b }),
    and: (...args: unknown[]) => ({ type: 'and', args }),
    gte: (a: unknown, b: unknown) => ({ type: 'gte', a, b }),
    inArray: (a: unknown, b: unknown) => ({ type: 'inArray', a, b }),
}));

describe('Storage - Reputation Operations', () => {
    const mockDb: MockDb = {
        insert: vi.fn(),
        select: vi.fn(),
    };

    const sampleVouch = {
        id: 'v1',
        fromId: 'f1',
        toId: 't1',
        type: 'handshake',
        positive: true,
        timestamp: 1000,
        signature: 'sig',
        receivedAt: 1005
    };

    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(getDb).mockReturnValue(mockDb as ReturnType<typeof getDb>);
    });

    it('should insert a vouch', () => {
        const mockInsert = {
            values: vi.fn().mockReturnThis(),
            onConflictDoNothing: vi.fn().mockReturnThis(),
            run: vi.fn().mockReturnValue({ changes: 1 })
        };
        mockDb.insert.mockReturnValue(mockInsert);

        const result = insertVouch(sampleVouch);
        expect(result).toBe(true);
        expect(getSchema).toHaveBeenCalled();
        expect(mockDb.insert).toHaveBeenCalled();
    });

    it('should return false if insertion fails', () => {
        mockDb.insert.mockImplementation(() => { throw new Error('DB Error'); });
        const result = insertVouch(sampleVouch);
        expect(result).toBe(false);
    });

    it('should check if vouch exists', () => {
        mockDb.select.mockReturnValue({
            from: vi.fn().mockReturnValue({
                where: vi.fn().mockReturnValue({
                    get: vi.fn().mockReturnValue({ id: 'v1' })
                })
            })
        });

        expect(vouchExists('v1')).toBe(true);
        expect(getSchema).toHaveBeenCalled();
    });

    it('should get vouch IDs since a timestamp', () => {
        mockDb.select.mockReturnValue({
            from: vi.fn().mockReturnValue({
                where: vi.fn().mockReturnValue({
                    all: vi.fn().mockReturnValue([{ id: 'v1' }, { id: 'v2' }])
                })
            })
        });

        const ids = getVouchIds(500);
        expect(ids).toEqual(['v1', 'v2']);
        expect(getSchema).toHaveBeenCalled();
    });

    it('should get vouches by IDs', () => {
        mockDb.select.mockReturnValue({
            from: vi.fn().mockReturnValue({
                where: vi.fn().mockReturnValue({
                    all: vi.fn().mockReturnValue([sampleVouch])
                })
            })
        });

        const result = getVouchesByIds(['v1']);
        expect(result).toEqual([sampleVouch]);
        expect(getSchema).toHaveBeenCalled();
    });

    it('should return empty if no IDs provided to getVouchesByIds', () => {
        const result = getVouchesByIds([]);
        expect(result).toEqual([]);
    });

    it('should get vouches for a node since a timestamp', () => {
        mockDb.select.mockReturnValue({
            from: vi.fn().mockReturnValue({
                where: vi.fn().mockReturnValue({
                    all: vi.fn().mockReturnValue([sampleVouch])
                })
            })
        });

        const results = getVouchesForNode('t1', 500);
        expect(results).toEqual([sampleVouch]);
    });

    it('should count recent vouches by fromId', () => {
        mockDb.select.mockReturnValue({
            from: vi.fn().mockReturnValue({
                where: vi.fn().mockReturnValue({
                    all: vi.fn().mockReturnValue([{ id: 'v1' }, { id: 'v2' }])
                })
            })
        });

        const count = countRecentVouchesByFrom('f1', 500);
        expect(count).toBe(2);
    });

    it('should return empty/count 0 if DB fails in any fetch', () => {
        mockDb.select.mockImplementation(() => { throw new Error('DB Error'); });
        expect(vouchExists('v1')).toBe(false);
        expect(getVouchIds(0)).toEqual([]);
        expect(getVouchesByIds(['v1'])).toEqual([]);
        expect(getVouchesForNode('t1', 0)).toEqual([]);
        expect(countRecentVouchesByFrom('f1', 0)).toBe(0);
    });
});
