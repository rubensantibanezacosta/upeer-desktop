import { BrowserWindow, app } from 'electron';

const IS_LINUX = process.platform === 'linux';
const FLASH_DURATION_MS = 3000;

export function focusWindow(win: BrowserWindow): void {
    app.focus({ steal: true });

    if (win.isMinimized()) win.restore();
    if (!win.isVisible()) win.show();

    win.focus();
    win.webContents.focus();

    if (IS_LINUX) {
        win.flashFrame(true);
        setTimeout(() => {
            if (!win.isDestroyed()) win.flashFrame(false);
        }, FLASH_DURATION_MS);
    }
}
