import { describe, expect, it, vi, beforeEach } from 'vitest';

const NotificationMock = vi.fn();
const isSupported = vi.fn(() => true);
const showMock = vi.fn();
const beepMock = vi.fn();

vi.mock('electron', () => ({
    Notification: class {
        static isSupported = isSupported;
        constructor(_opts: { title: string; body: string }) { NotificationMock(); }
        on(_event: string, _cb: () => void) { /* noop */ }
        show() { showMock(); }
    },
    shell: { beep: beepMock },
}));

vi.mock('../../../src/main_process/security/secure-logger.js', () => ({
    warn: vi.fn(),
}));

const prefs = vi.hoisted(() => ({
    allowsNotification: vi.fn(() => true),
    notificationSoundEnabled: vi.fn(() => true),
}));

vi.mock('../../../src/main_process/security/notification-prefs.js', () => prefs);

describe('desktopNotification (Electron/X11)', () => {
    beforeEach(async () => {
        vi.clearAllMocks();
        prefs.allowsNotification.mockReturnValue(true);
        prefs.notificationSoundEnabled.mockReturnValue(true);
        isSupported.mockReturnValue(true);
        delete process.env.WAYLAND_DISPLAY;
        process.env.XDG_SESSION_TYPE = 'x11';
    });

    it('usa Electron Notification cuando no es Wayland', async () => {
        const { showDesktopNotification } = await import('../../../src/main_process/utils/desktopNotification.js');
        showDesktopNotification({ kind: 'messages', title: 'T', body: 'B', onClick: () => {} });
        expect(NotificationMock).toHaveBeenCalled();
        expect(showMock).toHaveBeenCalled();
    });

    it('no hace nada si Electron Notification no es compatible', async () => {
        isSupported.mockReturnValue(false);
        const { showDesktopNotification } = await import('../../../src/main_process/utils/desktopNotification.js');
        showDesktopNotification({ kind: 'messages', title: 'T', body: 'B', onClick: () => {} });
        expect(NotificationMock).not.toHaveBeenCalled();
        expect(showMock).not.toHaveBeenCalled();
    });

    it('no avisa ni suena cuando la preferencia del tipo está apagada', async () => {
        prefs.allowsNotification.mockReturnValue(false);
        const { showDesktopNotification } = await import('../../../src/main_process/utils/desktopNotification.js');
        showDesktopNotification({ kind: 'requests', title: 'T', body: 'B', onClick: () => {} });
        expect(prefs.allowsNotification).toHaveBeenCalledWith('requests');
        expect(NotificationMock).not.toHaveBeenCalled();
        expect(beepMock).not.toHaveBeenCalled();
    });

    it('avisa sin sonido con los sonidos apagados', async () => {
        prefs.notificationSoundEnabled.mockReturnValue(false);
        const { showDesktopNotification } = await import('../../../src/main_process/utils/desktopNotification.js');
        showDesktopNotification({ kind: 'messages', title: 'T', body: 'B', onClick: () => {} });
        expect(showMock).toHaveBeenCalled();
        expect(beepMock).not.toHaveBeenCalled();
    });

    it('suena una vez por aviso permitido', async () => {
        const { showDesktopNotification } = await import('../../../src/main_process/utils/desktopNotification.js');
        showDesktopNotification({ kind: 'messages', title: 'T', body: 'B', onClick: () => {} });
        expect(beepMock).toHaveBeenCalledTimes(1);
    });

    it('agrupa los mensajes antes de presentarlos', async () => {
        vi.useFakeTimers();
        const { showMessageNotification } = await import('../../../src/main_process/utils/desktopNotification.js');
        showMessageNotification({ conversationId: 'u1', title: 'Ana', body: 'hola', onClick: () => {} });
        showMessageNotification({ conversationId: 'u2', title: 'Beto', body: 'ey', onClick: () => {} });

        expect(showMock).not.toHaveBeenCalled();
        vi.advanceTimersByTime(1000);
        vi.useRealTimers();

        expect(showMock).toHaveBeenCalledTimes(1);
        expect(beepMock).toHaveBeenCalledTimes(1);
    });

    it('no encola mensajes con los avisos de mensajes apagados', async () => {
        vi.useFakeTimers();
        prefs.allowsNotification.mockReturnValue(false);
        const { showMessageNotification, flushMessageNotifications } = await import('../../../src/main_process/utils/desktopNotification.js');
        showMessageNotification({ conversationId: 'u1', title: 'Ana', body: 'hola', onClick: () => {} });
        flushMessageNotifications();
        vi.useRealTimers();

        expect(prefs.allowsNotification).toHaveBeenCalledWith('messages');
        expect(showMock).not.toHaveBeenCalled();
    });
});
