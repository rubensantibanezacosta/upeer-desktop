import { describe, it, expect, vi, beforeEach } from 'vitest';
import path from 'node:path';

const userDataPath = path.resolve('/tmp/upeer-user-data');
const handlers = new Map<string, (...args: unknown[]) => Promise<unknown>>();

const listBackups = vi.fn();
const restoreFromBackup = vi.fn();
const existsSync = vi.fn();
const relaunch = vi.fn();
const exit = vi.fn();
const warn = vi.fn();

vi.mock('electron', () => ({
    app: {
        getPath: () => userDataPath,
        relaunch: (...args: unknown[]) => relaunch(...args),
        exit: (...args: unknown[]) => exit(...args),
    },
    ipcMain: {
        handle: (channel: string, handler: (...args: unknown[]) => Promise<unknown>) => {
            handlers.set(channel, handler);
        },
    },
}));

vi.mock('node:fs', () => ({
    default: { existsSync: (...args: unknown[]) => existsSync(...args) },
}));

vi.mock('../../../../src/main_process/storage/backup.js', () => ({
    listBackups: (...args: unknown[]) => listBackups(...args),
    restoreFromBackup: (...args: unknown[]) => restoreFromBackup(...args),
}));

vi.mock('../../../../src/main_process/storage/usage.js', () => ({
    getStorageUsage: async () => ({ databaseBytes: 1, mediaBytes: 2, ownBytes: 3 }),
}));

vi.mock('../../../../src/main_process/storage/vault/operations.js', () => ({
    clearVault: async () => 0,
}));

vi.mock('../../../../src/main_process/security/secure-logger.js', () => ({
    warn: (...args: unknown[]) => warn(...args),
}));

import { registerStorageHandlers } from '../../../../src/main_process/core/ipcHandlers/storage';

const invoke = (channel: string, ...args: unknown[]) => {
    const handler = handlers.get(channel);
    if (!handler) throw new Error(`Handler no registrado: ${channel}`);
    return handler({}, ...args);
};

describe('IPC de copias de seguridad', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        handlers.clear();
        registerStorageHandlers();
    });

    it('lista las copias ordenadas de más reciente a más antigua', async () => {
        listBackups.mockReturnValue([
            { name: 'p2p-chat.db.backup-2025-03-01', size: 100, modified: new Date('2025-03-01T08:00:00.000Z') },
            { name: 'p2p-chat.db.backup-2025-03-03', size: 300, modified: new Date('2025-03-03T08:00:00.000Z') },
        ]);

        const result = (await invoke('list-database-backups')) as {
            backups: Array<{ name: string; bytes: number; createdAt: string }>;
            retentionDays: number;
        };

        expect(result.retentionDays).toBe(7);
        expect(result.backups.map((backup) => backup.name)).toEqual([
            'p2p-chat.db.backup-2025-03-03',
            'p2p-chat.db.backup-2025-03-01',
        ]);
        expect(result.backups[0].bytes).toBe(300);
        expect(result.backups[0].createdAt).toBe('2025-03-03T08:00:00.000Z');
        expect(listBackups).toHaveBeenCalledWith(userDataPath);
    });

    it('restaura una copia existente', async () => {
        existsSync.mockReturnValue(true);
        restoreFromBackup.mockReturnValue(true);

        const result = await invoke('restore-database-backup', 'p2p-chat.db.backup-2025-03-04');

        expect(result).toEqual({ restored: true });
        expect(restoreFromBackup).toHaveBeenCalledWith(
            path.join(userDataPath, 'p2p-chat.db.backup-2025-03-04'),
            userDataPath,
        );
    });

    it('rechaza un nombre con salto de directorio sin tocar el disco', async () => {
        const result = (await invoke('restore-database-backup', '../p2p-chat.db.backup-2025-03-04')) as {
            restored: boolean;
            error?: string;
        };

        expect(result.restored).toBe(false);
        expect(result.error).toBe('Copia de seguridad no válida');
        expect(restoreFromBackup).not.toHaveBeenCalled();
        expect(warn).toHaveBeenCalled();
    });

    it('avisa cuando la copia desapareció del disco', async () => {
        existsSync.mockReturnValue(false);

        const result = (await invoke('restore-database-backup', 'p2p-chat.db.backup-2025-03-04')) as {
            restored: boolean;
            error?: string;
        };

        expect(result).toEqual({ restored: false, error: 'La copia ya no está en el disco' });
        expect(restoreFromBackup).not.toHaveBeenCalled();
    });

    it('informa si restoreFromBackup falla', async () => {
        existsSync.mockReturnValue(true);
        restoreFromBackup.mockReturnValue(false);

        const result = (await invoke('restore-database-backup', 'p2p-chat.db.backup-2025-03-04')) as {
            restored: boolean;
            error?: string;
        };

        expect(result).toEqual({ restored: false, error: 'No se pudo restaurar la copia' });
    });

    it('reinicia la aplicación tras restaurar', async () => {
        const result = await invoke('restart-app');

        expect(result).toEqual({ success: true });
        expect(relaunch).toHaveBeenCalled();
        expect(exit).toHaveBeenCalledWith(0);
    });
});
