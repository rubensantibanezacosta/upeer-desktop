import { app, ipcMain } from 'electron';

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
}
