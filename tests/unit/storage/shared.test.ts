import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getDb, getSqlite, getSchema, setDatabase, closeDatabase, clearUserData, runTransaction } from '../../../src/main_process/storage/shared.js';

vi.mock('../../../src/main_process/security/secure-logger.js', () => ({
    warn: vi.fn(),
    error: vi.fn()
}));

describe('Storage Shared Unit Tests', () => {
    let mockDb: any;
    let mockSqlite: any;

    beforeEach(() => {
        vi.clearAllMocks();
        mockDb = {
            select: vi.fn(),
            insert: vi.fn(),
        };
        mockSqlite = {
            close: vi.fn(),
            exec: vi.fn(),
            transaction: vi.fn((fn) => {
                return () => fn();
            })
        };
    });

    it('should throw if getting DB before initialization', () => {
        closeDatabase();
        expect(() => getDb()).toThrow('Database not initialized');
    });

    it('should set and get database instances', () => {
        setDatabase(mockDb, mockSqlite);
        expect(getDb()).toBe(mockDb);
        expect(getSqlite()).toBe(mockSqlite);
        expect(getSchema()).toBeDefined();
    });

    it('should close database', () => {
        setDatabase(mockDb, mockSqlite);
        closeDatabase();
        expect(mockSqlite.close).toHaveBeenCalled();
        expect(() => getDb()).toThrow();
    });

    it('should clear user data', () => {
        setDatabase(mockDb, mockSqlite);
        clearUserData();
        expect(mockSqlite.exec).toHaveBeenCalledWith(expect.stringContaining('DELETE FROM messages'));
        expect(mockSqlite.exec).toHaveBeenCalledWith(expect.stringContaining('DELETE FROM ratchet_sessions'));
    });

    it('should handle clearUserData when sqlite is null', () => {
        closeDatabase();
        expect(() => clearUserData()).not.toThrow();
    });

    it('should run transaction successfully', () => {
        setDatabase(mockDb, mockSqlite);
        const task = vi.fn().mockReturnValue('result');
        const result = runTransaction(task);

        expect(result).toBe('result');
        expect(task).toHaveBeenCalled();
        expect(mockSqlite.transaction).toHaveBeenCalled();
    });

    it('should throw error in runTransaction if not initialized', () => {
        closeDatabase();
        expect(() => runTransaction(() => { })).toThrow('Database not initialized');
    });

    it('should re-throw and log error if transaction fails', async () => {
        setDatabase(mockDb, mockSqlite);
        const error = new Error('Transaction Crash');
        const failingTask = vi.fn().mockImplementation(() => { throw error; });

        // Mock transaction to call the failing task
        mockSqlite.transaction.mockReturnValue(() => failingTask());

        expect(() => runTransaction(failingTask)).toThrow('Transaction Crash');
    });
});
