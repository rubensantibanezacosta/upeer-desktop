import fs from 'node:fs';
import path from 'node:path';
import sodium from 'sodium-native';
import { isHex } from './deviceCertificate.js';
import { getOrCreateDeviceKey } from './identityStorage.js';
import { identityState } from './identityState.js';
import { warn } from './secure-logger.js';

const STATE_FILE = 'account-registry.enc';
const MAX_REVOKED = 32;
export const MAX_AUTHORIZED_DEVICES = 10;
const MAX_REASON_LENGTH = 160;
const CLOCK_SKEW_MS = 5 * 60 * 1000;

export type AccountRegistryRevocation = {
    deviceId: string;
    revokedAt: number;
    reason: string;
};

export type AuthorizedDeviceRecord = {
    deviceId: string;
    devicePublicKey: string;
    staticX25519PublicKey?: string;
    platform?: string;
    capabilities?: string[];
    authorizedAt: number;
    expiresAt: number;
    epoch: number;
};

export type AccountRegistryState = {
    version: 1;
    accountUpeerId: string;
    epoch: number;
    issuedAt: number;
    revoked: AccountRegistryRevocation[];
    devices: AuthorizedDeviceRecord[];
};

export type AccountRegistryStateLoad =
    | { status: 'missing' }
    | { status: 'foreign' }
    | { status: 'invalid' }
    | { status: 'ready'; state: AccountRegistryState };

let cached: AccountRegistryState | null = null;

export function clearAccountRegistryStateCache(): void {
    cached = null;
}

export function loadAccountRegistryState(now = Date.now()): AccountRegistryState | null {
    const result = loadAccountRegistryStateResult(now);
    return result.status === 'ready' ? result.state : null;
}

export function loadAccountRegistryStateResult(now = Date.now()): AccountRegistryStateLoad {
    if (cached) {
        return cached.accountUpeerId === identityState.upeerId
            ? { status: 'ready', state: cached }
            : { status: 'foreign' };
    }
    const file = stateFile();
    if (!file || !identityState.userDataPath || !fs.existsSync(file)) return { status: 'missing' };
    try {
        const deviceKey = getOrCreateDeviceKey(identityState.userDataPath);
        const blob = fs.readFileSync(file);
        if (blob.length <= sodium.crypto_secretbox_NONCEBYTES + sodium.crypto_secretbox_MACBYTES) {
            return { status: 'invalid' };
        }
        const nonce = blob.subarray(0, sodium.crypto_secretbox_NONCEBYTES);
        const cipher = blob.subarray(sodium.crypto_secretbox_NONCEBYTES);
        const plain = Buffer.alloc(cipher.length - sodium.crypto_secretbox_MACBYTES);
        if (!sodium.crypto_secretbox_open_easy(plain, cipher, nonce, deviceKey)) return { status: 'invalid' };
        const state = parseState(JSON.parse(plain.toString('utf8')), now);
        if (!state) return { status: 'invalid' };
        if (state.accountUpeerId !== identityState.upeerId) return { status: 'foreign' };
        cached = state;
        return { status: 'ready', state };
    } catch (err) {
        warn('Account registry state could not be loaded', { error: errorMessage(err) }, 'identity');
        return { status: 'invalid' };
    }
}

export function saveAccountRegistryState(state: AccountRegistryState, now = Date.now()): boolean {
    const file = stateFile();
    if (!file || !identityState.userDataPath) return false;
    try {
        const normalized = parseState(state, now);
        if (!normalized || normalized.accountUpeerId !== identityState.upeerId) return false;
        const deviceKey = getOrCreateDeviceKey(identityState.userDataPath);
        const payload = Buffer.from(JSON.stringify(normalized), 'utf8');
        const nonce = Buffer.alloc(sodium.crypto_secretbox_NONCEBYTES);
        sodium.randombytes_buf(nonce);
        const cipher = Buffer.alloc(payload.length + sodium.crypto_secretbox_MACBYTES);
        sodium.crypto_secretbox_easy(cipher, payload, nonce, deviceKey);
        fs.writeFileSync(file, Buffer.concat([nonce, cipher]), { mode: 0o600 });
        cached = normalized;
        return true;
    } catch (err) {
        warn('Account registry state could not be persisted', { error: errorMessage(err) }, 'identity');
        return false;
    }
}

export function appendAccountRegistryRevocation(
    state: AccountRegistryState | null,
    accountUpeerId: string,
    epoch: number,
    issuedAt: number,
    revocation: AccountRegistryRevocation,
): AccountRegistryState {
    const current = state && state.accountUpeerId === accountUpeerId
        ? state
        : emptyState(accountUpeerId);
    if (current.revoked.some(item => item.deviceId === revocation.deviceId)) return current;
    if (current.revoked.length >= MAX_REVOKED) throw new Error('account registry revocation limit reached');
    return {
        ...current,
        epoch: Math.max(epoch, current.epoch) + 1,
        issuedAt: Math.max(issuedAt, current.issuedAt),
        revoked: [...current.revoked, revocation].sort((left, right) => left.deviceId.localeCompare(right.deviceId)),
        devices: current.devices.filter(device => device.deviceId !== revocation.deviceId),
    };
}

export function appendAuthorizedDevice(
    state: AccountRegistryState | null,
    accountUpeerId: string,
    certificate: { deviceId: string; devicePublicKey: string; platform?: string; capabilities?: string[]; issuedAt: number; expiresAt: number; epoch: number },
): AccountRegistryState {
    const current = state && state.accountUpeerId === accountUpeerId
        ? state
        : emptyState(accountUpeerId);
    if (current.revoked.some(item => item.deviceId === certificate.deviceId)) {
        throw new Error('device is revoked');
    }
    const devices = [
        ...current.devices.filter(device => device.deviceId !== certificate.deviceId),
        {
            deviceId: certificate.deviceId,
            devicePublicKey: certificate.devicePublicKey,
            platform: certificate.platform,
            capabilities: certificate.capabilities ? [...certificate.capabilities] : undefined,
            authorizedAt: certificate.issuedAt,
            expiresAt: certificate.expiresAt,
            epoch: certificate.epoch,
        },
    ].sort((left, right) => left.deviceId.localeCompare(right.deviceId));
    if (devices.length > MAX_AUTHORIZED_DEVICES) throw new Error('account registry device limit reached');
    return {
        version: 1,
        accountUpeerId,
        epoch: Math.max(certificate.epoch, current.epoch) + 1,
        issuedAt: Math.max(certificate.issuedAt, current.issuedAt),
        revoked: [...current.revoked],
        devices,
    };
}

export function emptyState(accountUpeerId: string): AccountRegistryState {
    return { version: 1, accountUpeerId, epoch: 0, issuedAt: 0, revoked: [], devices: [] };
}

export function normalizeRevocation(
    deviceId: string,
    reason: string,
    now: number,
): AccountRegistryRevocation {
    const normalizedId = deviceId.trim().toLowerCase();
    if (!isHex(normalizedId, 32)) throw new Error('deviceId must be a 32-byte hexadecimal value');
    const normalizedReason = reason.trim();
    if (normalizedReason.length === 0 || normalizedReason.length > MAX_REASON_LENGTH) {
        throw new Error(`revocation reason must contain 1-${MAX_REASON_LENGTH} characters`);
    }
    if (Array.from(normalizedReason).some(character => {
        const code = character.codePointAt(0) ?? 0;
        return code < 0x20 || code === 0x7f;
    })) {
        throw new Error('revocation reason must not contain control characters');
    }
    return { deviceId: normalizedId, revokedAt: now, reason: normalizedReason };
}

function parseState(value: unknown, now: number): AccountRegistryState | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const record = value as Record<string, unknown>;
    if (record.version !== 1) return null;
    if (typeof record.accountUpeerId !== 'string' || !isHex(record.accountUpeerId, 32)) return null;
    if (typeof record.epoch !== 'number' || !Number.isInteger(record.epoch) || record.epoch < 0) return null;
    if (typeof record.issuedAt !== 'number' || record.issuedAt <= 0 || record.issuedAt > now + CLOCK_SKEW_MS) return null;
    const revoked = parseRevoked(record.revoked, now);
    if (!revoked) return null;
    const devices = parseDevices(record.devices, now);
    if (!devices) return null;
    return {
        version: 1,
        accountUpeerId: record.accountUpeerId.toLowerCase(),
        epoch: record.epoch,
        issuedAt: record.issuedAt,
        revoked,
        devices,
    };
}

function parseRevoked(value: unknown, now: number): AccountRegistryRevocation[] | null {
    const raw = value === undefined ? [] : value;
    if (!Array.isArray(raw) || raw.length > MAX_REVOKED) return null;
    const revoked: AccountRegistryRevocation[] = [];
    for (const item of raw) {
        if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
        const entry = item as Record<string, unknown>;
        if (typeof entry.deviceId !== 'string' || !isHex(entry.deviceId, 32)) return null;
        if (typeof entry.revokedAt !== 'number' || entry.revokedAt <= 0 || entry.revokedAt > now + CLOCK_SKEW_MS) return null;
        if (typeof entry.reason !== 'string' || entry.reason.length === 0 || entry.reason.length > MAX_REASON_LENGTH) return null;
        const deviceId = entry.deviceId.toLowerCase();
        if (revoked.some(existing => existing.deviceId === deviceId)) return null;
        revoked.push({
            deviceId,
            revokedAt: entry.revokedAt,
            reason: entry.reason,
        });
    }
    return revoked;
}

function parseDevices(value: unknown, now: number): AuthorizedDeviceRecord[] | null {
    const raw = value === undefined ? [] : value;
    if (!Array.isArray(raw) || raw.length > MAX_AUTHORIZED_DEVICES) return null;
    const devices: AuthorizedDeviceRecord[] = [];
    for (const item of raw) {
        if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
        const entry = item as Record<string, unknown>;
        if (typeof entry.deviceId !== 'string' || !isHex(entry.deviceId, 32)) return null;
        if (typeof entry.devicePublicKey !== 'string' || !isHex(entry.devicePublicKey, 32)) return null;
        if (entry.staticX25519PublicKey !== undefined && entry.staticX25519PublicKey !== ''
            && (typeof entry.staticX25519PublicKey !== 'string' || !isHex(entry.staticX25519PublicKey, 32))) {
            return null;
        }
        if (entry.platform !== undefined && typeof entry.platform !== 'string') return null;
        if (entry.capabilities !== undefined) {
            if (!Array.isArray(entry.capabilities) || entry.capabilities.some(capability => typeof capability !== 'string')) {
                return null;
            }
        }
        if (typeof entry.authorizedAt !== 'number' || entry.authorizedAt <= 0 || entry.authorizedAt > now + CLOCK_SKEW_MS) return null;
        if (typeof entry.expiresAt !== 'number' || entry.expiresAt <= entry.authorizedAt) return null;
        if (typeof entry.epoch !== 'number' || !Number.isInteger(entry.epoch) || entry.epoch < 0) return null;
        const deviceId = entry.deviceId.toLowerCase();
        if (devices.some(existing => existing.deviceId === deviceId)) return null;
        devices.push({
            deviceId,
            devicePublicKey: entry.devicePublicKey.toLowerCase(),
            staticX25519PublicKey: typeof entry.staticX25519PublicKey === 'string' && entry.staticX25519PublicKey !== ''
                ? entry.staticX25519PublicKey.toLowerCase()
                : undefined,
            platform: entry.platform as string | undefined,
            capabilities: entry.capabilities as string[] | undefined,
            authorizedAt: entry.authorizedAt,
            expiresAt: entry.expiresAt,
            epoch: entry.epoch,
        });
    }
    return devices;
}

function stateFile(): string | null {
    return identityState.userDataPath ? path.join(identityState.userDataPath, STATE_FILE) : null;
}

function errorMessage(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
}
