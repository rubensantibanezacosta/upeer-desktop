import fs from 'node:fs';
import path from 'node:path';
import sodium from 'sodium-native';
import { ACCOUNT_PUBLIC_FILE, identityState, type IdentityMode } from './identityState.js';
import { deriveUPeerId, getOrCreateDeviceKey } from './identityStorage.js';
import { debug, warn } from './secure-logger.js';

export interface AccountPublicIdentity {
    accountUpeerId: string;
    accountPublicKey: string;
}

export class RootIdentityUnavailableError extends Error {
    constructor(operation: string) {
        super(`La identidad raíz no está disponible en este dispositivo (${operation})`);
        this.name = 'RootIdentityUnavailableError';
    }
}

export function getIdentityMode(): IdentityMode {
    return identityState.identityMode;
}

export function isDeviceOnlyMode(): boolean {
    return identityState.identityMode === 'device';
}

export function requireRootIdentity(operation: string): void {
    if (isDeviceOnlyMode()) throw new RootIdentityUnavailableError(operation);
    if (identityState.isLocked || !identityState.secretKey) throw new Error('Identity is locked');
}

export function resetIdentityMode(): void {
    identityState.identityMode = 'root';
}

export function normalizeAccountPublicIdentity(value: unknown): AccountPublicIdentity | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const record = value as Record<string, unknown>;
    const accountUpeerId = typeof record.accountUpeerId === 'string' ? record.accountUpeerId.trim().toLowerCase() : '';
    const accountPublicKey = typeof record.accountPublicKey === 'string' ? record.accountPublicKey.trim().toLowerCase() : '';
    if (!isHex(accountUpeerId, 32) || !isHex(accountPublicKey, 32)) return null;
    if (deriveUPeerId(Buffer.from(accountPublicKey, 'hex')) !== accountUpeerId) return null;
    return { accountUpeerId, accountPublicKey };
}

export function loadAccountPublicIdentity(userDataPath: string): AccountPublicIdentity | null {
    const file = accountPublicFile(userDataPath);
    if (!file || !fs.existsSync(file)) return null;
    try {
        const deviceKey = getOrCreateDeviceKey(userDataPath);
        const blob = fs.readFileSync(file);
        if (blob.length <= sodium.crypto_secretbox_NONCEBYTES + sodium.crypto_secretbox_MACBYTES) {
            warn('La identidad pública de la cuenta está truncada', {}, 'identity');
            return null;
        }
        const nonce = blob.subarray(0, sodium.crypto_secretbox_NONCEBYTES);
        const cipher = blob.subarray(sodium.crypto_secretbox_NONCEBYTES);
        const plain = Buffer.alloc(cipher.length - sodium.crypto_secretbox_MACBYTES);
        if (!sodium.crypto_secretbox_open_easy(plain, cipher, nonce, deviceKey)) {
            warn('La identidad pública de la cuenta no se pudo descifrar', {}, 'identity');
            return null;
        }
        const stored = JSON.parse(plain.toString('utf8')) as Record<string, unknown>;
        if (stored.mode !== 'device') {
            warn('La identidad pública de la cuenta no declara modo dispositivo', {}, 'identity');
            return null;
        }
        const identity = normalizeAccountPublicIdentity(stored);
        if (!identity) warn('La identidad pública de la cuenta es inválida', {}, 'identity');
        return identity;
    } catch (err) {
        warn('La identidad pública de la cuenta no se pudo leer', { error: errorMessage(err) }, 'identity');
        return null;
    }
}

export function saveAccountPublicIdentity(userDataPath: string, identity: AccountPublicIdentity): boolean {
    const file = accountPublicFile(userDataPath);
    if (!file) return false;
    try {
        const deviceKey = getOrCreateDeviceKey(userDataPath);
        const payload = Buffer.from(JSON.stringify({
            mode: 'device',
            accountUpeerId: identity.accountUpeerId,
            accountPublicKey: identity.accountPublicKey,
        }), 'utf8');
        const nonce = Buffer.alloc(sodium.crypto_secretbox_NONCEBYTES);
        sodium.randombytes_buf(nonce);
        const cipher = Buffer.alloc(payload.length + sodium.crypto_secretbox_MACBYTES);
        sodium.crypto_secretbox_easy(cipher, payload, nonce, deviceKey);
        fs.writeFileSync(file, Buffer.concat([nonce, cipher]), { mode: 0o600 });
        return true;
    } catch (err) {
        warn('La identidad pública de la cuenta no se pudo persistir', { error: errorMessage(err) }, 'identity');
        return false;
    }
}

export function enableDeviceOnlyMode(userDataPath: string, input: AccountPublicIdentity): boolean {
    if (!userDataPath) return false;
    if (identityState.secretKey) {
        warn('Se rechaza el modo dispositivo con una raíz cargada en memoria', {}, 'identity');
        return false;
    }
    const identity = normalizeAccountPublicIdentity(input);
    if (!identity) {
        warn('Se rechaza el modo dispositivo con datos de cuenta inválidos', {}, 'identity');
        return false;
    }
    if (!saveAccountPublicIdentity(userDataPath, identity)) return false;
    applyDeviceOnlyIdentity(userDataPath, identity);
    return true;
}

export function applyDeviceOnlyIdentity(userDataPath: string, identity: AccountPublicIdentity): void {
    identityState.userDataPath = userDataPath;
    identityState.identityMode = 'device';
    identityState.publicKey = Buffer.from(identity.accountPublicKey, 'hex');
    identityState.secretKey = null;
    identityState.upeerId = identity.accountUpeerId;
    identityState.mnemonic = null;
    identityState.isMnemonicBased = false;
    identityState.isLocked = false;
    debug('Identidad en modo dispositivo activada', { upeerId: identity.accountUpeerId }, 'identity');
}

export function clearAccountPublicIdentity(userDataPath: string): void {
    const file = accountPublicFile(userDataPath);
    if (!file || !fs.existsSync(file)) return;
    try {
        fs.unlinkSync(file);
        debug('Identidad pública de la cuenta eliminada', {}, 'identity');
    } catch (err) {
        warn('La identidad pública de la cuenta no se pudo eliminar', { error: errorMessage(err) }, 'identity');
    }
}

function accountPublicFile(userDataPath: string): string | null {
    return userDataPath ? path.join(userDataPath, ACCOUNT_PUBLIC_FILE) : null;
}

function isHex(value: string, expectedBytes: number): boolean {
    return value.length === expectedBytes * 2 && /^[0-9a-f]+$/i.test(value);
}

function errorMessage(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
}
