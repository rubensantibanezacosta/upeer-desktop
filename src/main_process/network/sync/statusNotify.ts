import type { BrowserWindow } from 'electron';
import { getMyUPeerId } from '../../security/identity.js';
import { getMainWindow } from '../../core/windowManager.js';
import { getSyncStatusView } from './statusView.js';
import { countActiveFileTransfers } from '../file-transfer/activeFiles.js';

const TICKER_MS = 5_000;

let lastPayload = '';
let lastWindow: BrowserWindow | null = null;
let ticker: ReturnType<typeof setInterval> | null = null;

export function notifySyncStatus(win: BrowserWindow | null = getMainWindow()): void {
    const myId = getMyUPeerId();
    if (!win || !myId) return;
    const view = getSyncStatusView({ activeFiles: countActiveFileTransfers() });
    const payload = JSON.stringify(view);
    if (payload === lastPayload && win === lastWindow) return;
    lastPayload = payload;
    lastWindow = win;
    win.webContents.send('sync-status', view);
}

export function startSyncStatusTicker(intervalMs: number = TICKER_MS): void {
    if (ticker) return;
    ticker = setInterval(() => notifySyncStatus(), intervalMs);
}

export function stopSyncStatusTicker(): void {
    if (!ticker) return;
    clearInterval(ticker);
    ticker = null;
    lastPayload = '';
    lastWindow = null;
}
