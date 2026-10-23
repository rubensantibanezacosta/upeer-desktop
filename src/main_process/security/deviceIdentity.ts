import sodium from 'sodium-native';
import fs from 'node:fs';
import path from 'node:path';
import { canonicalStringify, safeBufferFromHex } from '../network/cryptoUtils.js';
import { identityState, SESSION_LOCKED_FILE } from './identityState.js';
import { incrementDhtSeq } from './identityLifecycleInternal.js';
import { getUPeerIdFromPublicKey, verify } from './identityCrypto.js';
import { isDeviceOnlyMode } from './identityMode.js';
import { debug, warn } from './secure-logger.js';
import { readStoredDeviceIdentity, saveStoredDeviceIdentity } from './deviceIdentityStorage.js';
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

export interface DeviceIdentity {
    secretKey: Buffer;
    publicKey: string;
    deviceId: string;
    certificate: AccountDeviceCertificate;
}

let cached: { account: string; identity: DeviceIdentity } | null = null;

export type DeviceIdentityStatus = 'root' | 'ready' | 'renewal-required' | 'locked';

export function getDeviceIdentityStatus(now = Date.now()): DeviceIdentityStatus {
    if (!isDeviceOnlyMode()) return 'root';
    if (identityState.isLocked) return 'locked';
    return getDeviceIdentity(now) ? 'ready' : 'renewal-required';
}

export function getDeviceIdentity(now = Date.now()): DeviceIdentity | null {
    if (identityState.isLocked || !identityState.publicKey || !identityState.userDataPath) {
        return null;
    }
    const account = identityState.upeerId;
    if (isDeviceOnlyMode()) return loadEnrolledIdentity(account, now);
    if (!identityState.secretKey) return null;
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
    saveStoredDeviceIdentity(created.secretKey, created.certificate);
    return created;
}

export function resetDeviceIdentityCache(): void {
    if (cached) sodium.sodium_memzero(cached.identity.secretKey);
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
    if (isDeviceOnlyMode() || !identityState.secretKey) return null;
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

function loadEnrolledIdentity(account: string, now: number): DeviceIdentity | null {
    if (cached?.account === account && certificateUsable(cached.identity.certificate, account, now)) {
        return cached.identity;
    }
    const stored = readStoredDeviceIdentity(account);
    if (!stored) {
        warn('El dispositivo no tiene identidad enrolada', { upeerId: account }, 'identity');
        return null;
    }
    if (!verifyDeviceCertificate(stored.certificate, account, now)) {
        warn('El certificado del dispositivo no es utilizable sin la raíz', { upeerId: account }, 'identity');
        return null;
    }
    const identity: DeviceIdentity = {
        secretKey: stored.secretKey,
        publicKey: stored.publicKey.toString('hex'),
        deviceId: stored.certificate.deviceId,
        certificate: stored.certificate,
    };
    cached = { account, identity };
    return identity;
}

export function installDeviceCertificate(secretKeyHex: string, certificateValue: unknown, now = Date.now()): boolean {
    if (!isDeviceOnlyMode() || !identityState.userDataPath) return false;
    if (typeof secretKeyHex !== 'string' || !isHex(secretKeyHex, 64)) {
        warn('Se rechaza el certificado de dispositivo con clave secreta inválida', {}, 'identity');
        return false;
    }
    const certificate = verifyDeviceCertificate(certificateValue, identityState.upeerId, now);
    if (!certificate) {
        warn('Se rechaza el certificado de dispositivo no verificable', {}, 'identity');
        return false;
    }
    const secretKey = Buffer.from(secretKeyHex, 'hex');
    const publicKey = Buffer.alloc(sodium.crypto_sign_PUBLICKEYBYTES);
    sodium.crypto_sign_ed25519_sk_to_pk(publicKey, secretKey);
    if (publicKey.toString('hex') !== certificate.devicePublicKey) {
        warn('Se rechaza el certificado de dispositivo de otra clave', {}, 'identity');
        sodium.sodium_memzero(secretKey);
        return false;
    }
    const identity: DeviceIdentity = {
        secretKey,
        publicKey: certificate.devicePublicKey,
        deviceId: certificate.deviceId,
        certificate,
    };
    saveStoredDeviceIdentity(identity.secretKey, identity.certificate);
    clearSessionLock();
    resetDeviceIdentityCache();
    cached = { account: certificate.accountUpeerId, identity };
    debug('Certificado de dispositivo instalado', { deviceId: certificate.deviceId }, 'identity');
    return true;
}

function clearSessionLock(): void {
    if (!identityState.userDataPath) return;
    const locked = path.join(identityState.userDataPath, SESSION_LOCKED_FILE);
    try {
        if (fs.existsSync(locked)) fs.rmSync(locked, { force: true });
    } catch (err) {
        warn('No se pudo limpiar el bloqueo previo del dispositivo', {
            error: err instanceof Error ? err.message : String(err),
        }, 'identity');
    }
    identityState.isLocked = false;
}

function loadStoredIdentity(account: string, now: number): DeviceIdentity | null {
    const stored = readStoredDeviceIdentity(account);
    if (!stored) return null;
    const { secretKey, publicKey, certificate } = stored;
    if (!verifyDeviceCertificate(certificate, account, now)) {
        incrementDhtSeq();
        const rebuilt = buildIdentity(secretKey, publicKey, now, certificate.epoch + 1);
        if (rebuilt) saveStoredDeviceIdentity(rebuilt.secretKey, rebuilt.certificate);
        return rebuilt;
    }
    if (certificate.epoch < identityPeriod(now).epoch) {
        incrementDhtSeq();
        const rebuilt = buildIdentity(secretKey, publicKey, now);
        if (rebuilt) saveStoredDeviceIdentity(rebuilt.secretKey, rebuilt.certificate);
        return rebuilt;
    }
    return { secretKey, publicKey: publicKey.toString('hex'), deviceId: certificate.deviceId, certificate };
}
