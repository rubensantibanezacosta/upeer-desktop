import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
    performDatabaseBackup,
    scheduleBackups,
    listBackups,
    restoreFromBackup
} from '../../../src/main_process/storage/backup.js';

vi.mock('node:fs');
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

        // Setup default mocks for path-related fs functions
        (fs.existsSync as any) = vi.fn().mockReturnValue(false);
        (fs.readdirSync as any) = vi.fn().mockReturnValue([]);
        (fs.statSync as any) = vi.fn().mockReturnValue({ size: 0, mtime: new Date() });
        (fs.copyFileSync as any) = vi.fn();
        (fs.chmodSync as any) = vi.fn();
        (fs.unlinkSync as any) = vi.fn();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('should skip backup if database file does not exist', () => {
        (fs.existsSync as any).mockReturnValue(false);
        const result = performDatabaseBackup(userDataPath);
        expect(result).toBeUndefined();
        expect(fs.existsSync).toHaveBeenCalledWith(dbPath);
    });

    it('should skip backup if it already exists for today', () => {
        (fs.existsSync as any).mockImplementation((p: any) => {
            if (p === dbPath) return true;
            if (p === backupPath) return true;
            return false;
        });

        const result = performDatabaseBackup(userDataPath);
        expect(result).toBe(backupPath);
        expect(fs.copyFileSync).not.toHaveBeenCalled();
    });

    it('should create a new backup if it does not exist for today', () => {
        (fs.existsSync as any).mockImplementation((p: any) => p === dbPath);
        (fs.statSync as any).mockReturnValue({ size: 1024 });

        const result = performDatabaseBackup(userDataPath);

        expect(result).toBe(backupPath);
        expect(fs.copyFileSync).toHaveBeenCalledWith(dbPath, backupPath);
        expect(fs.chmodSync).toHaveBeenCalledWith(backupPath, 0o600);
    });

    it('should handle errors during backup creation', () => {
        (fs.existsSync as any).mockImplementation((p: any) => p === dbPath);
        (fs.copyFileSync as any).mockImplementation(() => {
            throw new Error('Disk full');
        });

        const result = performDatabaseBackup(userDataPath);
        expect(result).toBeUndefined();
    });

    it('should cleanup old backups (> 7 days)', () => {
        (fs.existsSync as any).mockImplementation((p: any) => p === dbPath);

        const oldDate = new Date();
        oldDate.setDate(oldDate.getDate() - 10);
        const oldDateStr = oldDate.toISOString().split('T')[0];
        const oldBackupFile = `p2p-chat.db.backup-${oldDateStr}`;

        const recentDate = new Date();
        recentDate.setDate(recentDate.getDate() - 2);
        const recentDateStr = recentDate.toISOString().split('T')[0];
        const recentBackupFile = `p2p-chat.db.backup-${recentDateStr}`;

        (fs.readdirSync as any).mockReturnValue([
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
        (fs.existsSync as any).mockReturnValue(true);

        vi.advanceTimersByTime(60 * 60 * 1000 + 100);
        expect(fs.existsSync).toHaveBeenCalled();

        stop();
    });

    it('should list available backups', () => {
        (fs.readdirSync as any).mockReturnValue([
            `p2p-chat.db.backup-${today}`,
            'random.txt'
        ]);
        (fs.statSync as any).mockReturnValue({ size: 1234, mtime: new Date() });

        const list = listBackups(userDataPath);
        expect(list.length).toBe(1);
        expect(list[0].name).toBe(`p2p-chat.db.backup-${today}`);
    });

    it('should restore from backup', () => {
        (fs.existsSync as any).mockReturnValue(true);
        (fs.statSync as any).mockReturnValue({ size: 5000 });

        const success = restoreFromBackup(backupPath, userDataPath);
        expect(success).toBe(true);
        expect(fs.copyFileSync).toHaveBeenCalled();
    });

    it('should fail restore if backup file missing', () => {
        (fs.existsSync as any).mockReturnValue(false);
        const success = restoreFromBackup(backupPath, userDataPath);
        expect(success).toBe(false);
    });

    it('should fail restore if backup file too small', () => {
        (fs.existsSync as any).mockReturnValue(true);
        (fs.statSync as any).mockReturnValue({ size: 100 });
        const success = restoreFromBackup(backupPath, userDataPath);
        expect(success).toBe(false);
    });

    describe('Edge Cases and Error Handling', () => {
        it('should handle readdirSync errors in cleanupOldBackups', () => {
            (fs.existsSync as any).mockImplementation((p: any) => p === dbPath);
            (fs.readdirSync as any).mockImplementation(() => {
                throw new Error('Read error');
            });

            // Should not throw
            const result = performDatabaseBackup(userDataPath);
            expect(result).toBeDefined();
        });

        it('should handle unlinkSync errors in cleanupOldBackups', () => {
            (fs.existsSync as any).mockImplementation((p: any) => p === dbPath);
            const oldDateStr = '2000-01-01';
            const oldFile = `p2p-chat.db.backup-${oldDateStr}`;

            (fs.readdirSync as any).mockReturnValue([oldFile]);
            (fs.unlinkSync as any).mockImplementation(() => {
                throw new Error('Permission denied');
            });

            // Should not throw, should log error
            performDatabaseBackup(userDataPath, 1);
            expect(fs.unlinkSync).toHaveBeenCalled();
        });

        it('should handle invalid date strings in backup files', () => {
            (fs.existsSync as any).mockImplementation((p: any) => p === dbPath);
            (fs.readdirSync as any).mockReturnValue(['p2p-chat.db.backup-not-a-date']);

            performDatabaseBackup(userDataPath, 1);
            expect(fs.unlinkSync).not.toHaveBeenCalled();
        });

        it('should handle readdirSync failure in listBackups', () => {
            (fs.readdirSync as any).mockImplementation(() => {
                throw new Error('List error');
            });
            const list = listBackups(userDataPath);
            expect(list).toEqual([]);
        });

        it('should create a pre-restore backup if db exists during restore', () => {
            (fs.existsSync as any).mockImplementation((p: any) => {
                if (p === backupPath) return true;
                if (p === dbPath) return true;
                return false;
            });
            (fs.statSync as any).mockReturnValue({ size: 5000 });

            const success = restoreFromBackup(backupPath, userDataPath);
            expect(success).toBe(true);
            // One for pre-restore, one for the actual restore
            expect(fs.copyFileSync).toHaveBeenCalledTimes(2);
        });
    });
});
