import fs from 'node:fs';
import path from 'node:path';
import sodium from 'sodium-native';
import { isHex } from './deviceCertificate.js';
import { getOrCreateDeviceKey } from './identityStorage.js';
import { identityState } from './identityState.js';
import { warn } from './secure-logger.js';

const STATE_FILE = 'account-registry.enc';
const MAX_REVOKED = 32;
const MAX_REASON_LENGTH = 160;
const CLOCK_SKEW_MS = 5 * 60 * 1000;

export type AccountRegistryRevocation = {
    deviceId: string;
    revokedAt: number;
    reason: string;
};

export type AccountRegistryState = {
    version: 1;
    accountUpeerId: string;
    epoch: number;
    issuedAt: number;
    revoked: AccountRegistryRevocation[];
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

export function saveAccountRegistryState(state: AccountRegistryState): boolean {
    const file = stateFile();
    if (!file || !identityState.userDataPath) return false;
    try {
        const normalized = parseState(state, Date.now());
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
        : { version: 1 as const, accountUpeerId, epoch: 0, issuedAt: 0, revoked: [] };
    if (current.revoked.some(item => item.deviceId === revocation.deviceId)) return current;
    if (current.revoked.length >= MAX_REVOKED) throw new Error('account registry revocation limit reached');
    return {
        version: 1,
        accountUpeerId,
        epoch: Math.max(epoch, current.epoch) + 1,
        issuedAt: Math.max(issuedAt, current.issuedAt),
        revoked: [...current.revoked, revocation].sort((left, right) => left.deviceId.localeCompare(right.deviceId)),
    };
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
    if (!Array.isArray(record.revoked) || record.revoked.length > MAX_REVOKED) return null;
    const revoked: AccountRegistryRevocation[] = [];
    for (const item of record.revoked) {
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
    return {
        version: 1,
        accountUpeerId: record.accountUpeerId.toLowerCase(),
        epoch: record.epoch,
        issuedAt: record.issuedAt,
        revoked,
    };
}

function stateFile(): string | null {
    return identityState.userDataPath ? path.join(identityState.userDataPath, STATE_FILE) : null;
}

function errorMessage(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
}
