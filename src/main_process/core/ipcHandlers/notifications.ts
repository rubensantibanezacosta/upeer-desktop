import { ipcMain } from 'electron';
import { getNotificationPrefs, setNotificationPrefs, type NotificationPrefs } from '../../security/notification-prefs.js';

export function registerNotificationHandlers(): void {
    ipcMain.handle('get-notification-prefs', () => getNotificationPrefs());

    ipcMain.handle('set-notification-prefs', (_event, patch: Partial<NotificationPrefs>) => setNotificationPrefs(patch ?? {}));
}
