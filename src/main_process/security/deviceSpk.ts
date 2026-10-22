import fs from 'node:fs';
import path from 'node:path';
import sodium from 'sodium-native';
import { getDeviceIdentity } from './deviceIdentity.js';
import { getOrCreateDeviceKey } from './identityStorage.js';
import { identityState } from './identityState.js';
import { debug, warn } from './secure-logger.js';

const STATE_FILE = 'device-spk.enc';
const ROTATION_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_PREVIOUS = 5;
const CLOCK_SKEW_MS = 5 * 60 * 1000;

type StoredSpk = {
    spkPub: string;
    spkSk: string;
    spkId: number;
};

type DeviceSpkState = {
    current: StoredSpk;
    previous: StoredSpk[];
};

export type DeviceSignedPreKeyBundle = {
    spkPub: string;
    spkSig: string;
    spkId: number;
};

let cached: { accountUpeerId: string; devicePublicKey: string; state: DeviceSpkState } | null = null;

export function clearDeviceSpkCache(): void {
    cached = null;
}

export function getMyDeviceSignedPreKey(now = Date.now()): DeviceSignedPreKeyBundle | null {
    const state = ensureState(now);
    const identity = getDeviceIdentity(now);
    if (!state || !identity) return null;
    return signBundle(identity.secretKey, state.current);
}

export function getDeviceSpkBySpkId(id: number, now = Date.now()): { spkPk: Buffer; spkSk: Buffer } | null {
    if (!Number.isInteger(id) || id <= 0) return null;
    const state = ensureState(now);
    if (!state) return null;
    const entry = state.current.spkId === id
        ? state.current
        : state.previous.find(candidate => candidate.spkId === id);
    if (!entry) return null;
    return {
        spkPk: Buffer.from(entry.spkPub, 'hex'),
        spkSk: Buffer.from(entry.spkSk, 'hex'),
    };
}

function ensureState(now: number): DeviceSpkState | null {
    const identity = getDeviceIdentity(now);
    if (!identity) return null;
    if (cached && cached.accountUpeerId === identity.certificate.accountUpeerId && cached.devicePublicKey === identity.publicKey) {
        if (now - cached.state.current.spkId < ROTATION_INTERVAL_MS && cached.state.current.spkId <= now + CLOCK_SKEW_MS) {
            return cached.state;
        }
        cached.state = rotate(cached.state);
        saveState(cached.state);
        return cached.state;
    }
    const loaded = loadState();
    const state = loaded && loaded.current.spkId <= now + CLOCK_SKEW_MS ? loaded : null;
    const next = state && now - state.current.spkId < ROTATION_INTERVAL_MS ? state : rotate(state);
    cached = {
        accountUpeerId: identity.certificate.accountUpeerId,
        devicePublicKey: identity.publicKey,
        state: next,
    };
    if (next !== loaded) saveState(next);
    return next;
}

function rotate(previous: DeviceSpkState | null): DeviceSpkState {
    const current: StoredSpk = generateEntry();
    const history = previous ? [previous.current, ...previous.previous].slice(0, MAX_PREVIOUS) : [];
    debug('Device signed pre-key rotated', { spkId: current.spkId }, 'identity');
    return { current, previous: history };
}

function generateEntry(): StoredSpk {
    const publicKey = Buffer.alloc(sodium.crypto_box_PUBLICKEYBYTES);
    const secretKey = Buffer.alloc(sodium.crypto_box_SECRETKEYBYTES);
    sodium.crypto_box_keypair(publicKey, secretKey);
    return {
        spkPub: publicKey.toString('hex'),
        spkSk: secretKey.toString('hex'),
        spkId: Date.now(),
    };
}

function signBundle(secretKey: Buffer, entry: StoredSpk): DeviceSignedPreKeyBundle {
    const signature = Buffer.alloc(sodium.crypto_sign_BYTES);
    sodium.crypto_sign_detached(signature, Buffer.from(entry.spkPub, 'hex'), secretKey);
    return {
        spkPub: entry.spkPub,
        spkSig: signature.toString('hex'),
        spkId: entry.spkId,
    };
}

function stateFile(): string | null {
    return identityState.userDataPath ? path.join(identityState.userDataPath, STATE_FILE) : null;
}

function loadState(): DeviceSpkState | null {
    const file = stateFile();
    if (!file || !fs.existsSync(file)) return null;
    try {
        const deviceKey = getOrCreateDeviceKey(identityState.userDataPath);
        const blob = fs.readFileSync(file);
        if (blob.length <= sodium.crypto_secretbox_NONCEBYTES + sodium.crypto_secretbox_MACBYTES) {
            warn('Device signed pre-key state is truncated', {}, 'identity');
            return null;
        }
        const nonce = blob.subarray(0, sodium.crypto_secretbox_NONCEBYTES);
        const cipher = blob.subarray(sodium.crypto_secretbox_NONCEBYTES);
        const plain = Buffer.alloc(cipher.length - sodium.crypto_secretbox_MACBYTES);
        if (!sodium.crypto_secretbox_open_easy(plain, cipher, nonce, deviceKey)) {
            warn('Device signed pre-key state could not be decrypted', {}, 'identity');
            return null;
        }
        return parseState(JSON.parse(plain.toString('utf8')));
    } catch (err) {
        warn('Device signed pre-key state could not be loaded', { error: errorMessage(err) }, 'identity');
        return null;
    }
}

function saveState(state: DeviceSpkState): void {
    const file = stateFile();
    if (!file || !identityState.userDataPath) return;
    try {
        const deviceKey = getOrCreateDeviceKey(identityState.userDataPath);
        const payload = Buffer.from(JSON.stringify(state), 'utf8');
        const nonce = Buffer.alloc(sodium.crypto_secretbox_NONCEBYTES);
        sodium.randombytes_buf(nonce);
        const cipher = Buffer.alloc(payload.length + sodium.crypto_secretbox_MACBYTES);
        sodium.crypto_secretbox_easy(cipher, payload, nonce, deviceKey);
        fs.writeFileSync(file, Buffer.concat([nonce, cipher]), { mode: 0o600 });
    } catch (err) {
        warn('Device signed pre-key state could not be persisted', { error: errorMessage(err) }, 'identity');
    }
}

function parseState(value: unknown): DeviceSpkState | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const record = value as Record<string, unknown>;
    const current = parseEntry(record.current);
    if (!current) return null;
    const rawPrevious = Array.isArray(record.previous) ? record.previous : [];
    const previous = rawPrevious
        .map(parseEntry)
        .filter((entry): entry is StoredSpk => entry !== null)
        .slice(0, MAX_PREVIOUS);
    return { current, previous };
}

function parseEntry(value: unknown): StoredSpk | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const record = value as Record<string, unknown>;
    if (typeof record.spkPub !== 'string' || !isHex(record.spkPub, 32)) return null;
    if (typeof record.spkSk !== 'string' || !isHex(record.spkSk, 32)) return null;
    if (typeof record.spkId !== 'number' || !Number.isInteger(record.spkId) || record.spkId <= 0) return null;
    return {
        spkPub: record.spkPub.toLowerCase(),
        spkSk: record.spkSk.toLowerCase(),
        spkId: record.spkId,
    };
}

function isHex(value: string, expectedBytes: number): boolean {
    return value.length === expectedBytes * 2 && /^[0-9a-f]+$/i.test(value);
}

function errorMessage(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
}
