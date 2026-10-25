import type { BrowserWindow } from 'electron';
import { getMyUPeerId } from '../../security/identity.js';
import { getMainWindow } from '../../core/windowManager.js';
import { getSyncStatusView } from './statusView.js';

export function notifySyncStatus(win: BrowserWindow | null = getMainWindow()): void {
    const myId = getMyUPeerId();
    if (!win || !myId) return;
    win.webContents.send('sync-status', getSyncStatusView());
}
