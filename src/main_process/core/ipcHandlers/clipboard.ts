import { clipboard, ipcMain } from 'electron';
import { error as logError, info } from '../../security/secure-logger.js';

export function registerClipboardHandlers(): void {
    ipcMain.handle('write-clipboard-text', (_event, text: unknown) => {
        if (typeof text !== 'string') {
            logError('Clipboard write rejected: expected text string', { receivedType: typeof text }, 'clipboard');
            return { success: false, error: 'El texto recibido no es válido.' };
        }

        try {
            clipboard.writeText(text);
            info('Clipboard write succeeded', { characterCount: text.length }, 'clipboard');
            return { success: true };
        } catch (cause) {
            const reason = cause instanceof Error ? `${cause.name}: ${cause.message}` : String(cause);
            logError('Clipboard write failed', { reason }, 'clipboard');
            return { success: false, error: reason };
        }
    });
}