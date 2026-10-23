import { ipcMain } from 'electron';
import { getMyUPeerId } from '../../security/identity.js';
import { getSyncStatus } from '../../storage/sync/status.js';

export function registerSyncHandlers(): void {
    ipcMain.handle('get-sync-status', () => {
        const myId = getMyUPeerId();
        if (!myId) return { state: 'disabled', pendingEvents: 0, pendingEntityIds: [], peers: [] };
        return getSyncStatus(myId);
    });
}
