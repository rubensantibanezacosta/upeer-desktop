import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clipboard, ipcMain } from 'electron';
import { registerClipboardHandlers } from '../../../../src/main_process/core/ipcHandlers/clipboard.js';
import { error as logError, info } from '../../../../src/main_process/security/secure-logger.js';

type ClipboardHandler = (_event: unknown, text: unknown) => unknown;

function getClipboardHandler(): ClipboardHandler {
    const call = vi.mocked(ipcMain.handle).mock.calls.find(([channel]) => channel === 'write-clipboard-text');
    if (!call) throw new Error('Missing write-clipboard-text handler');
    return call[1] as ClipboardHandler;
}

vi.mock('electron', () => ({
    clipboard: { writeText: vi.fn() },
    ipcMain: { handle: vi.fn() },
}));

vi.mock('../../../../src/main_process/security/secure-logger.js', () => ({
    error: vi.fn(),
    info: vi.fn(),
}));

describe('Clipboard IPC handler', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        registerClipboardHandlers();
    });

    it('copies text and logs the successful operation', () => {
        expect(getClipboardHandler()(null, 'hello')).toEqual({ success: true });
        expect(clipboard.writeText).toHaveBeenCalledWith('hello');
        expect(info).toHaveBeenCalledWith('Clipboard write succeeded', { characterCount: 5 }, 'clipboard');
    });

    it('returns and logs the native clipboard failure reason', () => {
        vi.mocked(clipboard.writeText).mockImplementation(() => {
            throw new Error('clipboard unavailable');
        });

        expect(getClipboardHandler()(null, 'hello')).toEqual({ success: false, error: 'Error: clipboard unavailable' });
        expect(logError).toHaveBeenCalledWith('Clipboard write failed', { reason: 'Error: clipboard unavailable' }, 'clipboard');
    });

    it('rejects non-string payloads and logs their type', () => {
        expect(getClipboardHandler()(null, 42)).toEqual({ success: false, error: 'El texto recibido no es válido.' });
        expect(clipboard.writeText).not.toHaveBeenCalled();
        expect(logError).toHaveBeenCalledWith('Clipboard write rejected: expected text string', { receivedType: 'number' }, 'clipboard');
    });
});