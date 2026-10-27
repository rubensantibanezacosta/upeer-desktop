import { ipcMain } from 'electron';
import { getSyncStatusView } from '../../network/sync/statusView.js';
import { countActiveFileTransfers } from '../../network/file-transfer/activeFiles.js';

export function registerSyncHandlers(): void {
    ipcMain.handle('get-sync-status', () => getSyncStatusView({ activeFiles: countActiveFileTransfers() }));
}
