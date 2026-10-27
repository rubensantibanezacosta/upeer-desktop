import { describe, it, expect } from 'vitest';
import path from 'node:path';

import {
    BACKUP_NAME_PATTERN,
    backupLabel,
    isBackupName,
    resolveBackupPath,
    sortBackups,
    type DatabaseBackup,
} from '../../../src/main_process/storage/backupSelection';

describe('isBackupName', () => {
    it('accepts the names the app generates', () => {
        expect(isBackupName('p2p-chat.db.backup-2025-03-04')).toBe(true);
        expect(BACKUP_NAME_PATTERN.test('p2p-chat.db.backup-1999-12-31')).toBe(true);
    });

    it('rejects anything else', () => {
        expect(isBackupName('p2p-chat.db')).toBe(false);
        expect(isBackupName('p2p-chat.db.backup-2025-3-4')).toBe(false);
        expect(isBackupName('p2p-chat.db.pre-restore-2025-03-04')).toBe(false);
        expect(isBackupName('')).toBe(false);
        expect(isBackupName(null)).toBe(false);
        expect(isBackupName(42)).toBe(false);
    });
});

describe('sortBackups', () => {
    it('orders from newest to oldest without mutating the input', () => {
        const backups: DatabaseBackup[] = [
            { name: 'p2p-chat.db.backup-2025-03-01', bytes: 10, createdAt: '2025-03-01T08:00:00.000Z' },
            { name: 'p2p-chat.db.backup-2025-03-03', bytes: 30, createdAt: '2025-03-03T08:00:00.000Z' },
            { name: 'p2p-chat.db.backup-2025-03-02', bytes: 20, createdAt: '2025-03-02T08:00:00.000Z' },
        ];

        const sorted = sortBackups(backups);

        expect(sorted.map((backup) => backup.name)).toEqual([
            'p2p-chat.db.backup-2025-03-03',
            'p2p-chat.db.backup-2025-03-02',
            'p2p-chat.db.backup-2025-03-01',
        ]);
        expect(backups[0].name).toBe('p2p-chat.db.backup-2025-03-01');
    });
});

describe('backupLabel', () => {
    it('formats a valid date in Spanish', () => {
        const label = backupLabel('2025-03-04T10:30:00.000Z');
        expect(label).toContain('2025');
        expect(label).toMatch(/marzo/i);
    });

    it('falls back to the raw value when the date is invalid', () => {
        expect(backupLabel('no-es-una-fecha')).toBe('no-es-una-fecha');
    });
});

describe('resolveBackupPath', () => {
    const userDataPath = path.resolve('/tmp/upeer-user-data');

    it('resolves a valid backup inside the user data folder', () => {
        const resolved = resolveBackupPath(userDataPath, 'p2p-chat.db.backup-2025-03-04');
        expect(resolved).toBe(path.join(userDataPath, 'p2p-chat.db.backup-2025-03-04'));
    });

    it('refuses traversal and unknown names', () => {
        expect(resolveBackupPath(userDataPath, '../p2p-chat.db.backup-2025-03-04')).toBeNull();
        expect(resolveBackupPath(userDataPath, 'p2p-chat.db.backup-2025-03-04/../../etc/passwd')).toBeNull();
        expect(resolveBackupPath(userDataPath, '..\\p2p-chat.db.backup-2025-03-04')).toBeNull();
        expect(resolveBackupPath(userDataPath, 'p2p-chat.db')).toBeNull();
        expect(resolveBackupPath(userDataPath, '')).toBeNull();
        expect(resolveBackupPath(userDataPath, undefined)).toBeNull();
        expect(resolveBackupPath('', 'p2p-chat.db.backup-2025-03-04')).toBeNull();
    });
});
