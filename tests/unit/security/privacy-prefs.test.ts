import { beforeEach, describe, expect, it, vi } from 'vitest';

const settings = vi.hoisted(() => ({
    getAppSetting: vi.fn(),
    setAppSetting: vi.fn(),
}));

vi.mock('../../../src/main_process/storage/settings-operations.js', () => settings);

describe('privacy-prefs', () => {
    beforeEach(() => {
        vi.resetModules();
        settings.getAppSetting.mockReset();
        settings.setAppSetting.mockReset();
    });

    it('parte de las tres preferencias activas', async () => {
        settings.getAppSetting.mockReturnValue({});
        const { getPrivacyPrefs } = await import('../../../src/main_process/security/privacy-prefs.js');

        expect(getPrivacyPrefs()).toEqual({ readReceipts: true, onlineStatus: true, lastSeen: true });
    });

    it('lee lo guardado cuando es booleano', async () => {
        settings.getAppSetting.mockReturnValue({ readReceipts: false, onlineStatus: true, lastSeen: false });
        const { getPrivacyPrefs } = await import('../../../src/main_process/security/privacy-prefs.js');

        expect(getPrivacyPrefs()).toEqual({ readReceipts: false, onlineStatus: true, lastSeen: false });
    });

    it('ignora valores que no son booleanos', async () => {
        settings.getAppSetting.mockReturnValue({ readReceipts: 'no', lastSeen: 0 });
        const { getPrivacyPrefs } = await import('../../../src/main_process/security/privacy-prefs.js');

        expect(getPrivacyPrefs()).toEqual({ readReceipts: true, onlineStatus: true, lastSeen: true });
    });

    it('guarda el parche sin perder las demás claves', async () => {
        settings.getAppSetting.mockReturnValue({ readReceipts: true, onlineStatus: true, lastSeen: true });
        const { setPrivacyPrefs } = await import('../../../src/main_process/security/privacy-prefs.js');

        expect(setPrivacyPrefs({ readReceipts: false })).toEqual({ readReceipts: false, onlineStatus: true, lastSeen: true });
        expect(settings.setAppSetting).toHaveBeenCalledWith('privacy-prefs', {
            readReceipts: false,
            onlineStatus: true,
            lastSeen: true,
        });
    });

    it('responde si las confirmaciones de lectura están activas', async () => {
        settings.getAppSetting.mockReturnValue({ readReceipts: false });
        const { readReceiptsEnabled } = await import('../../../src/main_process/security/privacy-prefs.js');

        expect(readReceiptsEnabled()).toBe(false);
    });
});
