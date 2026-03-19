import { ipcMain } from 'electron';
import { setAccessPin, verifyAccessPin, disableAccessPin, isPinEnabled } from '../../security/pin.js';
import { info, warn } from '../../security/secure-logger.js';

/**
 * Registra manejadores para la seguridad local (PIN)
 */
export function registerSecurityHandlers(): void {
    /** Verifica si el PIN está habilitado */
    ipcMain.handle('is-pin-enabled', () => isPinEnabled());

    /** Establece el PIN (solo si no hay uno o se provee el anterior) */
    ipcMain.handle('set-pin', (_event, { newPin, currentPin }) => {
        try {
            if (isPinEnabled()) {
                if (!currentPin || !verifyAccessPin(currentPin)) {
                    warn('Invalid current PIN on set-pin attempt', {}, 'security');
                    return { success: false, error: 'PIN actual incorrecto' };
                }
            }
            if (typeof newPin !== 'string') {
                return { success: false, error: 'PIN must be a string' };
            }
            setAccessPin(newPin);
            return { success: true };
        } catch (err: any) {
            return { success: false, error: err.message };
        }
    });

    /** Deshabilita el PIN */
    ipcMain.handle('disable-pin', (_event, { pin }) => {
        try {
            if (typeof pin !== 'string') {
                return { success: false, error: 'PIN must be a string' };
            }
            disableAccessPin(pin);
            return { success: true };
        } catch (err: any) {
            return { success: false, error: err.message };
        }
    });

    /** Valida el PIN (ej: al abrir la app) */
    ipcMain.handle('verify-pin', (_event, { pin }) => {
        if (typeof pin !== 'string') {
            warn('PIN verify called with non-string argument', { type: typeof pin }, 'security');
            return false;
        }
        const isValid = verifyAccessPin(pin);
        if (isValid) {
            info('PIN verified', {}, 'security');
        }
        return isValid;
    });
}
