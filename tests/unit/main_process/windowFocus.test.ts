import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

const focusMock = vi.fn();
const restoreMock = vi.fn();
const showMock = vi.fn();
const flashFrameMock = vi.fn();
const isDestroyedMock = vi.fn(() => false);
const winFocusMock = vi.fn();
const isMinimizedMock = vi.fn(() => false);
const isVisibleMock = vi.fn(() => true);

vi.mock('electron', () => ({
    app: { focus: vi.fn() },
    BrowserWindow: class {
        isMinimized() { return isMinimizedMock(); }
        isVisible() { return isVisibleMock(); }
        isDestroyed() { return isDestroyedMock(); }
        restore() { restoreMock(); }
        show() { showMock(); }
        focus() { winFocusMock(); }
        flashFrame(v: boolean) { flashFrameMock(v); }
        get webContents() { return { focus: focusMock }; }
    },
}));

describe('windowFocus', () => {
    let mod: typeof import('../../../src/main_process/utils/windowFocus.js');
    let win: never;

    beforeEach(async () => {
        vi.clearAllMocks();
        mod = await import('../../../src/main_process/utils/windowFocus.js');
        const { BrowserWindow } = await import('electron');
        win = new BrowserWindow() as never;
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('restaura la ventana minimizada y la muestra si no es visible', () => {
        isMinimizedMock.mockReturnValue(true);
        isVisibleMock.mockReturnValue(false);
        mod.focusWindow(win);
        expect(restoreMock).toHaveBeenCalled();
        expect(showMock).toHaveBeenCalled();
        expect(winFocusMock).toHaveBeenCalled();
        expect(focusMock).toHaveBeenCalled();
    });

    it('hace flash de la ventana en Linux (IS_LINUX true) y lo detiene tras el timeout', () => {
        vi.useFakeTimers();
        mod.focusWindow(win);
        expect(flashFrameMock).toHaveBeenCalledWith(true);
        vi.advanceTimersByTime(3000);
        expect(flashFrameMock).toHaveBeenCalledWith(false);
    });

    it('no intenta des-flashear si la ventana fue destruida', () => {
        vi.useFakeTimers();
        isDestroyedMock.mockReturnValue(true);
        mod.focusWindow(win);
        vi.advanceTimersByTime(3000);
        expect(flashFrameMock).toHaveBeenCalledTimes(1);
    });
});
