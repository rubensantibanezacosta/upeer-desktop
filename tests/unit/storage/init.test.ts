import { describe, it, expect, vi, beforeEach } from 'vitest';
import { initDB } from '../../../src/main_process/storage/init.js';
import BetterSqlite3 from 'better-sqlite3-multiple-ciphers';
import fs from 'node:fs';
import { setDatabase } from '../../../src/main_process/storage/shared.js';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';

// Mock dependencies
vi.mock('better-sqlite3-multiple-ciphers', () => {
    return {
        default: vi.fn()
    }
});
vi.mock('node:fs', () => ({
    default: {
        existsSync: vi.fn(),
        readFileSync: vi.fn(),
        writeFileSync: vi.fn()
    }
}));
vi.mock('node:path', () => ({
    default: {
        join: (...args: string[]) => args.join('/'),
        resolve: (...args: string[]) => args.join('/')
    }
}));

vi.mock('../../../src/main_process/security/secure-logger.js', () => ({
    info: vi.fn(),
    error: vi.fn()
}));

vi.mock('../../../src/main_process/storage/shared.js', () => ({
    setDatabase: vi.fn()
}));

vi.mock('drizzle-orm/better-sqlite3/migrator', () => ({
    migrate: vi.fn()
}));

vi.mock('../../../src/main_process/storage/backup.js', () => ({
    performDatabaseBackup: vi.fn(),
    scheduleBackups: vi.fn()
}));

// Mock sodium-native
vi.mock('sodium-native', () => ({
    default: {
        crypto_secretbox_KEYBYTES: 32,
        randombytes_buf: vi.fn(),
        crypto_generichash: vi.fn(),
        sodium_memzero: vi.fn()
    }
}));

describe('Storage Init Unit Tests', () => {
    type MockSqlite = {
        prepare: ReturnType<typeof vi.fn>;
        pragma: ReturnType<typeof vi.fn>;
        close: ReturnType<typeof vi.fn>;
        transaction: ReturnType<typeof vi.fn>;
        exec: ReturnType<typeof vi.fn>;
    };

    let mockSqlite: MockSqlite;

    beforeEach(() => {
        vi.clearAllMocks();
        mockSqlite = {
            prepare: vi.fn().mockReturnValue({
                get: vi.fn(),
                run: vi.fn(),
            }),
            pragma: vi.fn(),
            close: vi.fn(),
            transaction: vi.fn(),
            exec: vi.fn(),
        };
        vi.mocked(BetterSqlite3).mockImplementation(function () {
            return mockSqlite as never;
        });
        const mockedFs = vi.mocked(fs);
        mockedFs.existsSync.mockReturnValue(true);
        mockedFs.readFileSync.mockReturnValue(Buffer.alloc(32));
    });

    it('should initialize basic encrypted database', async () => {
        const result = await initDB('/mock/path');

        expect(result).toBeDefined();
        expect(BetterSqlite3).toHaveBeenCalled();
        expect(mockSqlite.pragma).toHaveBeenCalledWith(expect.stringContaining('key ='));
        expect(setDatabase).toHaveBeenCalled();
        expect(migrate).toHaveBeenCalled();
    });

    it('should create new device key if not exists', async () => {
        vi.mocked(fs).existsSync.mockReturnValue(false);

        await initDB('/mock/path');

        expect(fs.writeFileSync).toHaveBeenCalled();
    });

    it('should handle rekeying if database is not yet encrypted', async () => {
        // Success on first check (not encrypted)
        mockSqlite.prepare.mockReturnValueOnce({ get: vi.fn() });

        await initDB('/mock/path');

        expect(mockSqlite.pragma).toHaveBeenCalledWith(expect.stringContaining('rekey ='));
    });

    it('should throw if SQLCipher check fails', async () => {
        // Fail checking sqlite_master
        mockSqlite.prepare.mockReturnValue({
            get: vi.fn().mockImplementation(() => { throw new Error('SQLCipher failure'); })
        });

        await expect(initDB('/mock/path')).rejects.toThrow('SQLCipher failure');
    });

    it('should throw if SQLCipher not available after keying', async () => {
        // First check fails (encrypted), then key is set, then second check fails (e.g. wrong key)
        mockSqlite.prepare.mockReturnValueOnce({
            get: vi.fn().mockImplementation(() => { throw { message: 'not a database' }; })
        });
        mockSqlite.prepare.mockReturnValueOnce({
            get: vi.fn().mockImplementation(() => { throw new Error('Auth failed'); })
        });

        await expect(initDB('/mock/path')).rejects.toThrow('SQLCipher not available');
    });
});
