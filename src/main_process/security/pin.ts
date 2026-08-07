import { getAppSetting, setAppSetting } from '../storage/settings-operations.js';
import crypto from 'crypto';
import { info, warn } from './secure-logger.js';

const PIN_SETTING_KEY = 'security.pin.hash';
const PIN_ENABLED_KEY = 'security.pin.enabled';
const PIN_FAILED_ATTEMPTS_KEY = 'security.pin.failedAttempts';
const PIN_LOCKED_UNTIL_KEY = 'security.pin.lockedUntil';
const PIN_MAX_ATTEMPTS = 5;
const PIN_LOCKOUT_MS = 30_000;

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

    const lockedUntil = getAppSetting<number>(PIN_LOCKED_UNTIL_KEY, 0);
    if (Date.now() < lockedUntil) {
        warn('PIN lockout active', { remainingMs: lockedUntil - Date.now() }, 'security');
        return false;
    }

    const data = getAppSetting<{ hash: string, salt: string } | null>(PIN_SETTING_KEY, null);
    if (!data || typeof data.hash !== 'string' || typeof data.salt !== 'string') {
        warn('PIN is enabled but no valid hash found', {}, 'security');
        return false;
    }

    const { hash, salt } = data;
    if (!/^[0-9a-fA-F]+$/.test(hash) || !/^[0-9a-fA-F]+$/.test(salt)) {
        warn('PIN hash or salt corrupt', {}, 'security');
        return false;
    }

    const storedHash = Buffer.from(hash, 'hex');
    if (storedHash.length !== 64) {
        warn('PIN hash has unexpected length', { bytes: storedHash.length }, 'security');
        return false;
    }

    const verifyHash = crypto.scryptSync(pin, salt, 64);
    const isValid = crypto.timingSafeEqual(storedHash, verifyHash);

    if (isValid) {
        setAppSetting(PIN_FAILED_ATTEMPTS_KEY, 0);
        setAppSetting(PIN_LOCKED_UNTIL_KEY, 0);
        return true;
    }

    const failedAttempts = getAppSetting<number>(PIN_FAILED_ATTEMPTS_KEY, 0) + 1;
    setAppSetting(PIN_FAILED_ATTEMPTS_KEY, failedAttempts);
    warn('Invalid PIN attempt', { failedAttempts }, 'security');
    if (failedAttempts >= PIN_MAX_ATTEMPTS) {
        setAppSetting(PIN_LOCKED_UNTIL_KEY, Date.now() + PIN_LOCKOUT_MS);
        setAppSetting(PIN_FAILED_ATTEMPTS_KEY, 0);
        warn('PIN locked out after failed attempts', {}, 'security');
    }
    return false;
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
