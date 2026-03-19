import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mocks de base de datos
const mockDb = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    all: vi.fn(),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    run: vi.fn(),
    delete: vi.fn().mockReturnThis()
};

const mockSchema = {
    backupSurvivalKit: {
        kitId: 'kitId',
        name: 'name',
        description: 'description',
        created: 'created',
        expires: 'expires',
        isActive: 'isActive'
    }
};

vi.mock('../../../src/main_process/storage/shared.js', () => ({
    getDb: () => mockDb,
    getSchema: () => mockSchema,
    eq: (a: any, b: any) => ({ type: 'eq', column: a, value: b })
}));

vi.mock('drizzle-orm', () => ({
    lt: (a: any, b: any) => ({ type: 'lt', column: a, value: b })
}));

vi.mock('../../../src/main_process/security/secure-logger.js', () => ({
    error: vi.fn()
}));

import {
    getAllPulseSyncs,
    updatePulseSync,
    deletePulseSync,
    cleanupExpiredPulseSyncs
} from '../../../src/main_process/storage/backup/management.js';
import { error } from '../../../src/main_process/security/secure-logger.js';

describe('storage/backup/management.ts', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('getAllPulseSyncs', () => {
        it('should return all pulse syncs mapped correctly', () => {
            const mockKits = [
                { kitId: 'k1', name: 'Kit 1', description: 'Desc', created: '2023', expires: 100, isActive: true }
            ];
            mockDb.all.mockReturnValueOnce(mockKits);

            const result = getAllPulseSyncs();
            expect(result).toHaveLength(1);
            expect(result[0].kitId).toBe('k1');
            expect(mockDb.from).toHaveBeenCalledWith(mockSchema.backupSurvivalKit);
        });

        it('should handle missing optional fields', () => {
            mockDb.all.mockReturnValueOnce([{ kitId: 'k1', name: 'K1', isActive: false }]);
            const result = getAllPulseSyncs();
            expect(result[0].description).toBeUndefined();
            expect(result[0].created).toBe('');
            expect(result[0].expires).toBe(0);
        });
    });

    describe('updatePulseSync', () => {
        it('should update a kit and return true', () => {
            const data = { version: 1, encrypted: 'data' } as any;
            const res = updatePulseSync('k1', data);

            expect(res).toBe(true);
            expect(mockDb.update).toHaveBeenCalledWith(mockSchema.backupSurvivalKit);
            expect(mockDb.set).toHaveBeenCalledWith(expect.objectContaining({
                data: JSON.stringify(data)
            }));
        });

        it('should log error and return false on failure', () => {
            mockDb.run.mockImplementationOnce(() => { throw new Error('db-err'); });
            const res = updatePulseSync('k1', {} as any);
            expect(res).toBe(false);
            expect(error).toHaveBeenCalled();
        });
    });

    describe('deletePulseSync', () => {
        it('should delete a kit and return true', () => {
            const res = deletePulseSync('k1');
            expect(res).toBe(true);
            expect(mockDb.delete).toHaveBeenCalledWith(mockSchema.backupSurvivalKit);
        });

        it('should log error and return false on failure', () => {
            mockDb.run.mockImplementationOnce(() => { throw new Error('db-err'); });
            const res = deletePulseSync('k1');
            expect(res).toBe(false);
            expect(error).toHaveBeenCalled();
        });
    });

    describe('cleanupExpiredPulseSyncs', () => {
        it('should cleanup inactive and expired kits', () => {
            mockDb.run.mockReturnValueOnce({ changes: 2 }); // Inactive
            mockDb.run.mockReturnValueOnce({ changes: 3 }); // Expired

            expect(cleanupExpiredPulseSyncs()).toBe(5);
            expect(mockDb.delete).toHaveBeenCalledTimes(2);
        });

        it('should handle undefined changes', () => {
            mockDb.run.mockReturnValue({ changes: undefined });
            expect(cleanupExpiredPulseSyncs()).toBe(0);
        });
    });
});
