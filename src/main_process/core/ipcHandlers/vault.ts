import { ipcMain } from 'electron';

/**
 * Registra los manejadores IPC relacionados con vault (mensajes offline)
 */
export function registerVaultHandlers(): void {
  ipcMain.handle('get-vault-stats', async () => {
    const { getVaultStats } = await import('../../storage/vault/operations.js');
    return await getVaultStats();
  });
}