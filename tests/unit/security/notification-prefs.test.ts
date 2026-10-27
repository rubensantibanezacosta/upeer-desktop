import { beforeEach, describe, expect, it, vi } from 'vitest';

const settings = vi.hoisted(() => ({
    getAppSetting: vi.fn(),
    setAppSetting: vi.fn(),
}));

vi.mock('../../../src/main_process/storage/settings-operations.js', () => settings);

describe('notification-prefs', () => {
    beforeEach(() => {
        vi.resetModules();
        settings.getAppSetting.mockReset();
        settings.setAppSetting.mockReset();
    });

    it('parte de los tres avisos activos', async () => {
        settings.getAppSetting.mockReturnValue({});
        const { getNotificationPrefs } = await import('../../../src/main_process/security/notification-prefs.js');

        expect(getNotificationPrefs()).toEqual({ messages: true, requests: true, sound: true });
    });

    it('lee lo guardado cuando es booleano', async () => {
        settings.getAppSetting.mockReturnValue({ messages: false, requests: true, sound: false });
        const { getNotificationPrefs } = await import('../../../src/main_process/security/notification-prefs.js');

        expect(getNotificationPrefs()).toEqual({ messages: false, requests: true, sound: false });
    });

    it('ignora valores que no son booleanos', async () => {
        settings.getAppSetting.mockReturnValue({ messages: 'sí', sound: 1 });
        const { getNotificationPrefs } = await import('../../../src/main_process/security/notification-prefs.js');

        expect(getNotificationPrefs()).toEqual({ messages: true, requests: true, sound: true });
    });

    it('guarda el parche sin perder las demás claves', async () => {
        settings.getAppSetting.mockReturnValue({ messages: true, requests: true, sound: true });
        const { setNotificationPrefs } = await import('../../../src/main_process/security/notification-prefs.js');

        expect(setNotificationPrefs({ sound: false })).toEqual({ messages: true, requests: true, sound: false });
        expect(settings.setAppSetting).toHaveBeenCalledWith('notification-prefs', {
            messages: true,
            requests: true,
            sound: false,
        });
    });

    it('responde por tipo de aviso', async () => {
        settings.getAppSetting.mockReturnValue({ messages: false, requests: true });
        const { allowsNotification } = await import('../../../src/main_process/security/notification-prefs.js');

        expect(allowsNotification('messages')).toBe(false);
        expect(allowsNotification('requests')).toBe(true);
    });

    it('responde si el sonido está activo', async () => {
        settings.getAppSetting.mockReturnValue({ sound: false });
        const { notificationSoundEnabled } = await import('../../../src/main_process/security/notification-prefs.js');

        expect(notificationSoundEnabled()).toBe(false);
    });
});
