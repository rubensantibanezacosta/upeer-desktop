import { app, ipcMain } from 'electron';
import fs from 'node:fs';

import { resolveBackupPath, sortBackups, type DatabaseBackup } from '../../storage/backupSelection.js';
import { warn } from '../../security/secure-logger.js';

const BACKUP_RETENTION_DAYS = 7;

export function registerStorageHandlers(): void {
  ipcMain.handle('get-storage-usage', async () => {
    const { getStorageUsage } = await import('../../storage/usage.js');
    return await getStorageUsage(app.getPath('userData'));
  });

  ipcMain.handle('clear-vault', async () => {
    const { clearVault } = await import('../../storage/vault/operations.js');
    const removed = await clearVault();
    return { removed };
  });

  ipcMain.handle('list-database-backups', async () => {
    const userDataPath = app.getPath('userData');
    const { listBackups } = await import('../../storage/backup.js');
    const backups: DatabaseBackup[] = listBackups(userDataPath)
      .map((entry) => ({ name: entry.name, bytes: entry.size, createdAt: entry.modified.toISOString() }));
    return { backups: sortBackups(backups), retentionDays: BACKUP_RETENTION_DAYS };
  });

  ipcMain.handle('restore-database-backup', async (_event, name: unknown) => {
    const userDataPath = app.getPath('userData');
    const backupPath = resolveBackupPath(userDataPath, name);
    if (!backupPath) {
      warn('Se rechaza restaurar una copia con nombre no reconocido', { name: typeof name === 'string' ? name : typeof name }, 'backup');
      return { restored: false, error: 'Copia de seguridad no válida' };
    }
    if (!fs.existsSync(backupPath)) {
      return { restored: false, error: 'La copia ya no está en el disco' };
    }
    const { restoreFromBackup } = await import('../../storage/backup.js');
    if (!restoreFromBackup(backupPath, userDataPath)) {
      return { restored: false, error: 'No se pudo restaurar la copia' };
    }
    return { restored: true };
  });

  ipcMain.handle('restart-app', async () => {
    app.relaunch();
    app.exit(0);
    return { success: true };
  });
}
