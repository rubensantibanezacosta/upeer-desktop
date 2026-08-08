import { describe, expect, it, vi, beforeEach } from 'vitest';

const NotificationMock = vi.fn();
const isSupported = vi.fn(() => true);
const showMock = vi.fn();

vi.mock('electron', () => ({
    Notification: class {
        static isSupported = isSupported;
        constructor(_opts: { title: string; body: string }) { NotificationMock(); }
        on(_event: string, _cb: () => void) { /* noop */ }
        show() { showMock(); }
    },
}));

vi.mock('../../../src/main_process/security/secure-logger.js', () => ({
    warn: vi.fn(),
}));

describe('desktopNotification (Electron/X11)', () => {
    beforeEach(async () => {
        vi.clearAllMocks();
        delete process.env.WAYLAND_DISPLAY;
        process.env.XDG_SESSION_TYPE = 'x11';
    });

    it('usa Electron Notification cuando no es Wayland', async () => {
        const { showDesktopNotification } = await import('../../../src/main_process/utils/desktopNotification.js');
        showDesktopNotification({ title: 'T', body: 'B', onClick: () => {} });
        expect(NotificationMock).toHaveBeenCalled();
        expect(showMock).toHaveBeenCalled();
    });

    it('no hace nada si Electron Notification no es compatible', async () => {
        isSupported.mockReturnValue(false);
        const { showDesktopNotification } = await import('../../../src/main_process/utils/desktopNotification.js');
        showDesktopNotification({ title: 'T', body: 'B', onClick: () => {} });
        expect(NotificationMock).not.toHaveBeenCalled();
        expect(showMock).not.toHaveBeenCalled();
    });
});


