import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
    performDatabaseBackup,
    scheduleBackups,
    listBackups,
    restoreFromBackup
} from '../../../src/main_process/storage/backup.js';

type PathLike = Parameters<typeof fs.existsSync>[0];
type MockStats = Pick<fs.Stats, 'size' | 'mtime'>;

function createStats(size: number, mtime = new Date()): MockStats {
    return { size, mtime };
}

vi.mock('node:fs', () => ({
    default: {
        existsSync: vi.fn(),
        readdirSync: vi.fn(),
        statSync: vi.fn(),
        copyFileSync: vi.fn(),
        chmodSync: vi.fn(),
        unlinkSync: vi.fn(),
    }
}));
vi.mock('../../../src/main_process/security/secure-logger.js');

describe('Database Backup Unit Tests', () => {
    const userDataPath = '/home/user/chat-p2p';
    const dbPath = path.join(userDataPath, 'p2p-chat.db');
    const today = new Date().toISOString().split('T')[0];
    const backupFileName = `p2p-chat.db.backup-${today}`;
    const backupPath = path.join(userDataPath, backupFileName);

    beforeEach(() => {
        vi.resetAllMocks();
        vi.useFakeTimers();

        vi.mocked(fs.existsSync).mockReturnValue(false);
        vi.mocked(fs.readdirSync).mockReturnValue([]);
        vi.mocked(fs.statSync).mockReturnValue(createStats(0) as fs.Stats);
        vi.mocked(fs.copyFileSync).mockImplementation(() => undefined);
        vi.mocked(fs.chmodSync).mockImplementation(() => undefined);
        vi.mocked(fs.unlinkSync).mockImplementation(() => undefined);
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('should skip backup if database file does not exist', () => {
        vi.mocked(fs.existsSync).mockReturnValue(false);
        const result = performDatabaseBackup(userDataPath);
        expect(result).toBeUndefined();
        expect(fs.existsSync).toHaveBeenCalledWith(dbPath);
    });

    it('should skip backup if it already exists for today', () => {
        vi.mocked(fs.existsSync).mockImplementation((p: PathLike) => {
            if (p === dbPath) return true;
            if (p === backupPath) return true;
            return false;
        });

        const result = performDatabaseBackup(userDataPath);
        expect(result).toBe(backupPath);
        expect(fs.copyFileSync).not.toHaveBeenCalled();
    });

    it('should create a new backup if it does not exist for today', () => {
        vi.mocked(fs.existsSync).mockImplementation((p: PathLike) => p === dbPath);
        vi.mocked(fs.statSync).mockReturnValue(createStats(1024) as fs.Stats);

        const result = performDatabaseBackup(userDataPath);

        expect(result).toBe(backupPath);
        expect(fs.copyFileSync).toHaveBeenCalledWith(dbPath, backupPath);
        expect(fs.chmodSync).toHaveBeenCalledWith(backupPath, 0o600);
    });

    it('should handle errors during backup creation', () => {
        vi.mocked(fs.existsSync).mockImplementation((p: PathLike) => p === dbPath);
        vi.mocked(fs.copyFileSync).mockImplementation(() => {
            throw new Error('Disk full');
        });

        const result = performDatabaseBackup(userDataPath);
        expect(result).toBeUndefined();
    });

    it('should cleanup old backups (> 7 days)', () => {
        vi.mocked(fs.existsSync).mockImplementation((p: PathLike) => p === dbPath);

        const oldDate = new Date();
        oldDate.setDate(oldDate.getDate() - 10);
        const oldDateStr = oldDate.toISOString().split('T')[0];
        const oldBackupFile = `p2p-chat.db.backup-${oldDateStr}`;

        const recentDate = new Date();
        recentDate.setDate(recentDate.getDate() - 2);
        const recentDateStr = recentDate.toISOString().split('T')[0];
        const recentBackupFile = `p2p-chat.db.backup-${recentDateStr}`;

        vi.mocked(fs.readdirSync).mockReturnValue([
            oldBackupFile,
            recentBackupFile,
            'other-file.txt'
        ]);

        performDatabaseBackup(userDataPath, 7);

        expect(fs.unlinkSync).toHaveBeenCalledWith(path.join(userDataPath, oldBackupFile));
        expect(fs.unlinkSync).not.toHaveBeenCalledWith(path.join(userDataPath, recentBackupFile));
    });

    it('should schedule periodic backups', () => {
        const stop = scheduleBackups(userDataPath, 1);
        vi.mocked(fs.existsSync).mockReturnValue(true);

        vi.advanceTimersByTime(60 * 60 * 1000 + 100);
        expect(fs.existsSync).toHaveBeenCalled();

        stop();
    });

    it('should list available backups', () => {
        vi.mocked(fs.readdirSync).mockReturnValue([
            `p2p-chat.db.backup-${today}`,
            'random.txt'
        ]);
        vi.mocked(fs.statSync).mockReturnValue(createStats(1234) as fs.Stats);

        const list = listBackups(userDataPath);
        expect(list.length).toBe(1);
        expect(list[0].name).toBe(`p2p-chat.db.backup-${today}`);
    });

    it('should restore from backup', () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.statSync).mockReturnValue(createStats(5000) as fs.Stats);

        const success = restoreFromBackup(backupPath, userDataPath);
        expect(success).toBe(true);
        expect(fs.copyFileSync).toHaveBeenCalled();
    });

    it('should fail restore if backup file missing', () => {
        vi.mocked(fs.existsSync).mockReturnValue(false);
        const success = restoreFromBackup(backupPath, userDataPath);
        expect(success).toBe(false);
    });

    it('should fail restore if backup file too small', () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.statSync).mockReturnValue(createStats(100) as fs.Stats);
        const success = restoreFromBackup(backupPath, userDataPath);
        expect(success).toBe(false);
    });

    describe('Edge Cases and Error Handling', () => {
        it('should handle readdirSync errors in cleanupOldBackups', () => {
            vi.mocked(fs.existsSync).mockImplementation((p: PathLike) => p === dbPath);
            vi.mocked(fs.readdirSync).mockImplementation(() => {
                throw new Error('Read error');
            });

            const result = performDatabaseBackup(userDataPath);
            expect(result).toBeDefined();
        });

        it('should handle unlinkSync errors in cleanupOldBackups', () => {
            vi.mocked(fs.existsSync).mockImplementation((p: PathLike) => p === dbPath);
            const oldDateStr = '2000-01-01';
            const oldFile = `p2p-chat.db.backup-${oldDateStr}`;

            vi.mocked(fs.readdirSync).mockReturnValue([oldFile]);
            vi.mocked(fs.unlinkSync).mockImplementation(() => {
                throw new Error('Permission denied');
            });

            performDatabaseBackup(userDataPath, 1);
            expect(fs.unlinkSync).toHaveBeenCalled();
        });

        it('should handle invalid date strings in backup files', () => {
            vi.mocked(fs.existsSync).mockImplementation((p: PathLike) => p === dbPath);
            vi.mocked(fs.readdirSync).mockReturnValue(['p2p-chat.db.backup-not-a-date']);

            performDatabaseBackup(userDataPath, 1);
            expect(fs.unlinkSync).not.toHaveBeenCalled();
        });

        it('should handle readdirSync failure in listBackups', () => {
            vi.mocked(fs.readdirSync).mockImplementation(() => {
                throw new Error('List error');
            });
            const list = listBackups(userDataPath);
            expect(list).toEqual([]);
        });

        it('should create a pre-restore backup if db exists during restore', () => {
            vi.mocked(fs.existsSync).mockImplementation((p: PathLike) => {
                if (p === backupPath) return true;
                if (p === dbPath) return true;
                return false;
            });
            vi.mocked(fs.statSync).mockReturnValue(createStats(5000) as fs.Stats);

            const success = restoreFromBackup(backupPath, userDataPath);
            expect(success).toBe(true);
            expect(fs.copyFileSync).toHaveBeenCalledTimes(2);
        });
    });
});
