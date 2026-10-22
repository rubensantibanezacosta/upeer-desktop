import fs from 'node:fs';
import path from 'node:path';
import sodium from 'sodium-native';
import { canonicalStringify, safeBufferFromHex } from '../network/cryptoUtils.js';
import { getOrCreateDeviceKey } from './identityStorage.js';
import { identityState } from './identityState.js';
import { incrementDhtSeq } from './identityLifecycleInternal.js';
import { getUPeerIdFromPublicKey, verify } from './identityCrypto.js';
import { debug, warn } from './secure-logger.js';
import {
    certificatePayload,
    certificateUsable,
    deriveDeviceId,
    identityPeriod,
    isHex,
    normalizeAddresses,
    parseCertificate,
    type AccountDeviceCertificate,
} from './deviceCertificate.js';

const STATE_FILE = 'device-identity.enc';

export interface DeviceIdentity {
    secretKey: Buffer;
    publicKey: string;
    deviceId: string;
    certificate: AccountDeviceCertificate;
}

let cached: { account: string; identity: DeviceIdentity } | null = null;

export function getDeviceIdentity(now = Date.now()): DeviceIdentity | null {
    if (identityState.isLocked || !identityState.secretKey || !identityState.publicKey || !identityState.userDataPath) {
        return null;
    }
    const account = identityState.upeerId;
    const period = identityPeriod(now);
    if (
        cached?.account === account &&
        cached.identity.certificate.epoch >= period.epoch &&
        certificateUsable(cached.identity.certificate, account, now)
    ) {
        return cached.identity;
    }
    const stored = loadStoredIdentity(account, now);
    if (stored) {
        cached = { account, identity: stored };
        return stored;
    }
    const created = createIdentity(now);
    if (!created) return null;
    cached = { account, identity: created };
    saveStoredIdentity(created);
    return created;
}

export function resetDeviceIdentityCache(): void {
    cached = null;
}

export function verifyDeviceCertificate(
    value: unknown,
    expectedAccountUpeerId: string,
    now = Date.now(),
): AccountDeviceCertificate | null {
    const certificate = parseCertificate(value);
    if (!certificate) return null;
    if (certificate.accountUpeerId !== expectedAccountUpeerId.toLowerCase()) return null;
    if (getUPeerIdFromPublicKey(Buffer.from(certificate.accountPublicKey, 'hex')) !== certificate.accountUpeerId) {
        return null;
    }
    if (!certificateUsable(certificate, expectedAccountUpeerId, now)) return null;
    try {
        return verify(
            Buffer.from(canonicalStringify(certificatePayload(certificate))),
            Buffer.from(certificate.signature, 'hex'),
            Buffer.from(certificate.accountPublicKey, 'hex'),
        ) ? certificate : null;
    } catch (err) {
        debug('Device certificate signature verification failed', { error: err instanceof Error ? err.message : String(err) }, 'identity');
        return null;
    }
}

export function verifyDeviceLocationBlock(
    upeerId: string,
    block: Record<string, unknown>,
    accountPublicKey: string,
    now = Date.now(),
): boolean {
    const certificate = verifyDeviceCertificate(block.deviceCertificate, upeerId, now);
    if (!certificate) return false;
    if (certificate.accountPublicKey !== accountPublicKey.toLowerCase()) return false;
    if (certificate.deviceId !== String(block.deviceId ?? '').toLowerCase()) return false;
    if (typeof block.dhtSeq !== 'number' || block.dhtSeq < 0) return false;
    if (typeof block.expiresAt !== 'number' || block.expiresAt <= now) return false;
    if (typeof block.signature !== 'string' || block.signature.length !== 128) return false;
    const addresses = normalizeAddresses(block);
    if (!addresses) return false;
    const payload: Record<string, unknown> = {
        upeerId: certificate.accountUpeerId,
        addresses,
        dhtSeq: block.dhtSeq,
        expiresAt: block.expiresAt,
        deviceId: certificate.deviceId,
    };
    if (block.deviceMeta && typeof block.deviceMeta === 'object') payload.deviceMeta = block.deviceMeta;
    try {
        return verify(
            Buffer.from(canonicalStringify(payload)),
            safeBufferFromHex(block.signature, 64, 'signature'),
            Buffer.from(certificate.devicePublicKey, 'hex'),
        );
    } catch (err) {
        debug('Device location signature verification failed', { error: err instanceof Error ? err.message : String(err) }, 'identity');
        return false;
    }
}

function createIdentity(now: number): DeviceIdentity | null {
    if (!identityState.secretKey || !identityState.publicKey) return null;
    const publicKey = Buffer.alloc(sodium.crypto_sign_PUBLICKEYBYTES);
    const secretKey = Buffer.alloc(sodium.crypto_sign_SECRETKEYBYTES);
    sodium.crypto_sign_keypair(publicKey, secretKey);
    incrementDhtSeq();
    return buildIdentity(secretKey, publicKey, now);
}

function buildIdentity(secretKey: Buffer, publicKey: Buffer, now: number, minimumEpoch = 0): DeviceIdentity | null {
    const devicePublicKey = publicKey.toString('hex');
    const deviceId = deriveDeviceId(devicePublicKey);
    if (!deviceId || !identityState.secretKey) return null;
    const period = identityPeriod(now);
    const epoch = Math.max(period.epoch, minimumEpoch);
    const issuedAt = epoch === period.epoch ? period.start : now;
    const certificate: AccountDeviceCertificate = {
        version: 1,
        accountUpeerId: identityState.upeerId,
        accountPublicKey: identityState.publicKey?.toString('hex') ?? '',
        deviceId,
        devicePublicKey,
        platform: process.platform,
        capabilities: ['dht', 'location'],
        issuedAt,
        expiresAt: issuedAt + 7 * 24 * 60 * 60 * 1000,
        epoch,
        signature: '',
    };
    certificate.signature = signCertificate(certificate);
    return { secretKey, publicKey: devicePublicKey, deviceId, certificate };
}

function signCertificate(certificate: AccountDeviceCertificate): string {
    if (!identityState.secretKey) throw new Error('Identity is locked');
    const signature = Buffer.alloc(sodium.crypto_sign_BYTES);
    sodium.crypto_sign_detached(
        signature,
        Buffer.from(canonicalStringify(certificatePayload(certificate))),
        identityState.secretKey,
    );
    return signature.toString('hex');
}

function loadStoredIdentity(account: string, now: number): DeviceIdentity | null {
    const file = stateFile();
    if (!file || !fs.existsSync(file)) return null;
    try {
        const deviceKey = getOrCreateDeviceKey(identityState.userDataPath);
        const blob = fs.readFileSync(file);
        const nonce = blob.subarray(0, sodium.crypto_secretbox_NONCEBYTES);
        const cipher = blob.subarray(sodium.crypto_secretbox_NONCEBYTES);
        const plain = Buffer.alloc(cipher.length - sodium.crypto_secretbox_MACBYTES);
        if (!sodium.crypto_secretbox_open_easy(plain, cipher, nonce, deviceKey)) return null;
        const stored = JSON.parse(plain.toString('utf8')) as { secretKey?: unknown; certificate?: unknown };
        if (typeof stored.secretKey !== 'string' || !isHex(stored.secretKey, 64)) return null;
        const certificate = parseCertificate(stored.certificate);
        if (!certificate || certificate.accountUpeerId !== account.toLowerCase()) return null;
        const secretKey = Buffer.from(stored.secretKey, 'hex');
        const publicKey = Buffer.alloc(sodium.crypto_sign_PUBLICKEYBYTES);
        sodium.crypto_sign_ed25519_sk_to_pk(publicKey, secretKey);
        if (!verifyDeviceCertificate(certificate, account, now)) {
            incrementDhtSeq();
            const rebuilt = buildIdentity(secretKey, publicKey, now, certificate.epoch + 1);
            if (rebuilt) saveStoredIdentity(rebuilt);
            return rebuilt;
        }
        if (certificate.epoch < identityPeriod(now).epoch) {
            incrementDhtSeq();
            const rebuilt = buildIdentity(secretKey, publicKey, now);
            if (rebuilt) saveStoredIdentity(rebuilt);
            return rebuilt;
        }
        return { secretKey, publicKey: publicKey.toString('hex'), deviceId: certificate.deviceId, certificate };
    } catch (err) {
        warn('Device identity could not be loaded', { error: err instanceof Error ? err.message : String(err) }, 'identity');
        return null;
    }
}

function saveStoredIdentity(identity: DeviceIdentity): void {
    const file = stateFile();
    if (!file) return;
    try {
        const deviceKey = getOrCreateDeviceKey(identityState.userDataPath);
        const payload = Buffer.from(JSON.stringify({
            secretKey: identity.secretKey.toString('hex'),
            certificate: identity.certificate,
        }), 'utf8');
        const nonce = Buffer.alloc(sodium.crypto_secretbox_NONCEBYTES);
        sodium.randombytes_buf(nonce);
        const cipher = Buffer.alloc(payload.length + sodium.crypto_secretbox_MACBYTES);
        sodium.crypto_secretbox_easy(cipher, payload, nonce, deviceKey);
        fs.writeFileSync(file, Buffer.concat([nonce, cipher]), { mode: 0o600 });
    } catch (err) {
        warn('Device identity could not be persisted', { error: err instanceof Error ? err.message : String(err) }, 'identity');
    }
}

function stateFile(): string | null {
    return identityState.userDataPath ? path.join(identityState.userDataPath, STATE_FILE) : null;
}
