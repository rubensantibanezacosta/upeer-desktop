import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    getRatchetSession,
    saveRatchetSession,
    deleteRatchetSession
} from '../../../src/main_process/storage/ratchet/operations.js';

// Mocks
const mockRun = vi.fn();
const mockGet = vi.fn();

const mockDb = {
    select: vi.fn(() => mockDb),
    from: vi.fn(() => mockDb),
    where: vi.fn(() => mockDb),
    get: mockGet,
    insert: vi.fn(() => mockDb),
    values: vi.fn(() => mockDb),
    onConflictDoUpdate: vi.fn(() => mockDb),
    run: mockRun,
    delete: vi.fn(() => mockDb),
};

const mockSchema = {
    ratchetSessions: {
        upeerId: 'upeerId',
        state: 'state',
        spkIdUsed: 'spkIdUsed',
        establishedAt: 'establishedAt',
        updatedAt: 'updatedAt'
    }
};

vi.mock('../../../src/main_process/storage/shared.js', () => ({
    getDb: () => mockDb,
    getSchema: () => mockSchema,
    eq: (a: any, b: any) => ({ column: a, value: b })
}));

vi.mock('../../../src/main_process/security/ratchet.js', () => ({
    serializeState: (state: any, spkIdUsed: any) => ({ ...state, spkIdUsed }),
    deserializeState: (serialized: any) => serialized,
}));

describe('Ratchet Storage Unit Tests', () => {
    const upeerId = 'test-peer-id';
    const mockState = { some: 'state' };

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should return null when no ratchet session exists', () => {
        mockGet.mockReturnValueOnce(undefined);
        const result = getRatchetSession(upeerId);
        expect(result).toBeNull();
    });

    it('should return deserialized state when session exists', () => {
        const row = {
            state: JSON.stringify({ ...mockState, spkIdUsed: 42 }),
            spkIdUsed: 42
        };
        mockGet.mockReturnValueOnce(row);
        const result = getRatchetSession(upeerId);
        expect(result).toEqual({ ...mockState, spkIdUsed: 42 });
    });

    it('should handle migration/fallback for spkIdUsed', () => {
        const row = {
            state: JSON.stringify({ ...mockState, spkIdUsed: null }),
            spkIdUsed: 99
        };
        mockGet.mockReturnValueOnce(row);
        const result = getRatchetSession(upeerId) as any;
        expect(result.spkIdUsed).toBe(99);
    });

    it('should return null on invalid JSON in state', () => {
        mockGet.mockReturnValueOnce({ state: 'invalid-json' });
        const result = getRatchetSession(upeerId);
        expect(result).toBeNull();
    });

    it('should save a ratchet session', () => {
        saveRatchetSession(upeerId, mockState as any, 101);
        expect(mockDb.insert).toHaveBeenCalledWith(mockSchema.ratchetSessions);
        expect(mockDb.values).toHaveBeenCalledWith(expect.objectContaining({
            upeerId,
            spkIdUsed: 101
        }));
        expect(mockRun).toHaveBeenCalled();
    });

    it('should delete a ratchet session', () => {
        deleteRatchetSession(upeerId);
        expect(mockDb.delete).toHaveBeenCalledWith(mockSchema.ratchetSessions);
        expect(mockRun).toHaveBeenCalled();
    });
});
