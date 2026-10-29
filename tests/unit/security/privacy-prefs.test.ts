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

    it('parte de las dos preferencias activas', async () => {
        settings.getAppSetting.mockReturnValue({});
        const { getPrivacyPrefs } = await import('../../../src/main_process/security/privacy-prefs.js');

        expect(getPrivacyPrefs()).toEqual({ readReceipts: true, shareActivity: true });
    });

    it('lee lo guardado cuando es booleano', async () => {
        settings.getAppSetting.mockReturnValue({ readReceipts: false, shareActivity: false });
        const { getPrivacyPrefs } = await import('../../../src/main_process/security/privacy-prefs.js');

        expect(getPrivacyPrefs()).toEqual({ readReceipts: false, shareActivity: false });
    });

    it('ignora valores que no son booleanos', async () => {
        settings.getAppSetting.mockReturnValue({ readReceipts: 'no', shareActivity: 0 });
        const { getPrivacyPrefs } = await import('../../../src/main_process/security/privacy-prefs.js');

        expect(getPrivacyPrefs()).toEqual({ readReceipts: true, shareActivity: true });
    });

    it('guarda el parche sin perder las demás claves', async () => {
        settings.getAppSetting.mockReturnValue({ readReceipts: true, shareActivity: true });
        const { setPrivacyPrefs } = await import('../../../src/main_process/security/privacy-prefs.js');

        expect(setPrivacyPrefs({ readReceipts: false })).toEqual({ readReceipts: false, shareActivity: true });
        expect(settings.setAppSetting).toHaveBeenCalledWith('privacy-prefs', {
            readReceipts: false,
            shareActivity: true,
        });
    });

    it('responde si las confirmaciones de lectura están activas', async () => {
        settings.getAppSetting.mockReturnValue({ readReceipts: false });
        const { readReceiptsEnabled } = await import('../../../src/main_process/security/privacy-prefs.js');

        expect(readReceiptsEnabled()).toBe(false);
    });

    it('comparte la actividad salvo que se desactive', async () => {
        settings.getAppSetting.mockReturnValue({});
        const enabled = await import('../../../src/main_process/security/privacy-prefs.js');
        expect(enabled.activitySharingEnabled()).toBe(true);

        vi.resetModules();
        settings.getAppSetting.mockReturnValue({ shareActivity: false });
        const disabled = await import('../../../src/main_process/security/privacy-prefs.js');
        expect(disabled.activitySharingEnabled()).toBe(false);
    });
});
