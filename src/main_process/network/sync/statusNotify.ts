import type { BrowserWindow } from 'electron';
import { getMyUPeerId } from '../../security/identity.js';
import { getMainWindow } from '../../core/windowManager.js';
import { getSyncStatus } from '../../storage/sync/status.js';

export function notifySyncStatus(win: BrowserWindow | null = getMainWindow()): void {
    const myId = getMyUPeerId();
    if (!win || !myId) return;
    win.webContents.send('sync-status', getSyncStatus(myId));
}
