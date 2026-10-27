import { ipcMain } from 'electron';
import { getPrivacyPrefs, setPrivacyPrefs, type PrivacyPrefs } from '../../security/privacy-prefs.js';

export function registerPrivacyHandlers(): void {
    ipcMain.handle('get-privacy-prefs', () => getPrivacyPrefs());

    ipcMain.handle('set-privacy-prefs', (_event, patch: Partial<PrivacyPrefs>) => setPrivacyPrefs(patch ?? {}));
}
