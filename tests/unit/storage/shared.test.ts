import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getDb, getSqlite, getSchema, setDatabase, closeDatabase, clearUserData, runTransaction, type SqliteLike } from '../../../src/main_process/storage/shared.js';

vi.mock('../../../src/main_process/security/secure-logger.js', () => ({
    warn: vi.fn(),
    error: vi.fn()
}));

describe('Storage Shared Unit Tests', () => {
    type MockDb = {
        select: ReturnType<typeof vi.fn>;
        insert: ReturnType<typeof vi.fn>;
    };

    let mockDb: MockDb;
    let mockSqlite: SqliteLike;

    beforeEach(() => {
        vi.clearAllMocks();
        mockDb = {
            select: vi.fn(),
            insert: vi.fn(),
        };
        mockSqlite = {
            close: vi.fn(),
            exec: vi.fn(),
            transaction: vi.fn(<T>(fn: () => T) => () => fn())
        };
    });

    it('should throw if getting DB before initialization', () => {
        closeDatabase();
        expect(() => getDb()).toThrow('Database not initialized');
    });

    it('should set and get database instances', () => {
        setDatabase(mockDb as ReturnType<typeof getDb>, mockSqlite);
        expect(getDb()).toBe(mockDb as ReturnType<typeof getDb>);
        expect(getSqlite()).toBe(mockSqlite);
        expect(getSchema()).toBeDefined();
    });

    it('should close database', () => {
        setDatabase(mockDb as ReturnType<typeof getDb>, mockSqlite);
        closeDatabase();
        expect(mockSqlite.close).toHaveBeenCalled();
        expect(() => getDb()).toThrow();
    });

    it('should clear user data', () => {
        setDatabase(mockDb as ReturnType<typeof getDb>, mockSqlite);
        clearUserData();
        expect(mockSqlite.exec).toHaveBeenCalledWith(expect.stringContaining('DELETE FROM messages'));
        expect(mockSqlite.exec).toHaveBeenCalledWith(expect.stringContaining('DELETE FROM ratchet_sessions'));
    });

    it('should handle clearUserData when sqlite is null', () => {
        closeDatabase();
        expect(() => clearUserData()).not.toThrow();
    });

    it('should run transaction successfully', () => {
        setDatabase(mockDb as ReturnType<typeof getDb>, mockSqlite);
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
        setDatabase(mockDb as ReturnType<typeof getDb>, mockSqlite);
        const error = new Error('Transaction Crash');
        const failingTask = vi.fn().mockImplementation(() => { throw error; });

        mockSqlite.transaction.mockReturnValue(() => failingTask());

        expect(() => runTransaction(failingTask)).toThrow('Transaction Crash');
    });
});
