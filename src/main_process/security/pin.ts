import { getAppSetting, setAppSetting } from '../storage/settings-operations.js';
import crypto from 'crypto';
import { info, warn } from './secure-logger.js';

const PIN_SETTING_KEY = 'security.pin.hash';
const PIN_ENABLED_KEY = 'security.pin.enabled';

/**
 * Establece un nuevo PIN de acceso
 */
export function setAccessPin(pin: string): void {
    if (!pin || typeof pin !== 'string') {
        throw new Error('PIN must be a string');
    }
    if (pin.length < 4) {
        throw new Error('PIN must be at least 4 digits');
    }

    // Usamos salt aleatoria y Scrypt para protección contra fuerza bruta
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.scryptSync(pin, salt, 64).toString('hex');

    setAppSetting(PIN_SETTING_KEY, { hash, salt });
    setAppSetting(PIN_ENABLED_KEY, true);

    info('Access PIN set successfully', {}, 'security');
}

/**
 * Verifica si el PIN proporcionado es correcto
 */
export function verifyAccessPin(pin: string): boolean {
    if (!pin || typeof pin !== 'string') {
        return false;
    }
    if (!isPinEnabled()) return true;

    const data = getAppSetting<{ hash: string, salt: string } | null>(PIN_SETTING_KEY, null);
    if (!data) {
        warn('PIN is enabled but no hash found', {}, 'security');
        return false;
    }

    const { hash, salt } = data;
    const verifyHash = crypto.scryptSync(pin, salt, 64).toString('hex');

    const isValid = crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(verifyHash, 'hex'));

    if (!isValid) {
        warn('Invalid PIN attempt', {}, 'security');
    }

    return isValid;
}

/**
 * Deshabilita el PIN de acceso
 */
export function disableAccessPin(currentPin: string): void {
    if (!currentPin || typeof currentPin !== 'string') {
        throw new Error('PIN must be a string');
    }
    if (verifyAccessPin(currentPin)) {
        setAppSetting(PIN_ENABLED_KEY, false);
        setAppSetting(PIN_SETTING_KEY, null);
        info('Access PIN disabled', {}, 'security');
    } else {
        throw new Error('Invalid current PIN');
    }
}

/**
 * Verifica si el sistema de PIN está habilitado
 */
export function isPinEnabled(): boolean {
    return getAppSetting<boolean>(PIN_ENABLED_KEY, false);
}
