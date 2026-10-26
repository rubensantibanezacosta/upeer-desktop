import { ipcMain } from 'electron';
import { getMyUPeerId } from '../../security/identity.js';
import { getSyncStatusView } from '../../network/sync/statusView.js';
import { countActiveFileTransfers } from '../../network/file-transfer/activeFiles.js';

export function registerSyncHandlers(): void {
    ipcMain.handle('get-sync-status', () => {
        if (!getMyUPeerId()) {
            return {
                state: 'disabled',
                pendingEvents: 0,
                pendingMessages: 0,
                pendingMetadata: 0,
                pendingEntityIds: [],
                peers: [],
                devices: [],
            };
        }
        return getSyncStatusView({ activeFiles: countActiveFileTransfers() });
    });
}
