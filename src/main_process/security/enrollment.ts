import sodium from 'sodium-native';
import { canonicalStringify } from '../network/cryptoUtils.js';
import {
    certificatePayload,
    certificateUsable,
    deriveDeviceId,
    isHex,
    parseCertificate,
    type AccountDeviceCertificate,
} from './deviceCertificate.js';
import { debug, warn } from './secure-logger.js';

export const ENROLLMENT_VERSION = 1;
export const ENROLLMENT_DEFAULT_TTL_MS = 5 * 60 * 1000;
export const ENROLLMENT_MAX_TTL_MS = 15 * 60 * 1000;
export const ENROLLMENT_MAX_REQUEST_AGE_MS = 10 * 60 * 1000;
export const ENROLLMENT_SECRET_BYTES = 32;
export const ENROLLMENT_CERTIFICATE_TTL_MS = 90 * 24 * 60 * 60 * 1000;
export const ENROLLMENT_CAPABILITIES = ['dht', 'location'] as const;

export type EnrollmentCapability = typeof ENROLLMENT_CAPABILITIES[number];

export interface EnrollmentOffer {
    version: 1;
    accountUpeerId: string;
    accountPublicKey: string;
    authorizerDeviceId: string;
    inviteId: string;
    expiresAt: number;
    authorizerAddress?: string;
}

export interface EnrollmentCode {
    offer: EnrollmentOffer;
    secret: Buffer;
    code: string;
}

export interface EnrollmentRequest {
    version: 1;
    inviteId: string;
    accountUpeerId: string;
    deviceId: string;
    devicePublicKey: string;
    platform: string;
    capabilities: EnrollmentCapability[];
    requestedAt: number;
    deviceSignature: string;
}

export interface SealedEnrollmentMessage {
    inviteId: string;
    nonce: string;
    ciphertext: string;
}

export interface EnrollmentCertificateInput {
    request: EnrollmentRequest;
    accountUpeerId: string;
    accountPublicKey: string;
    accountSecretKey: Buffer;
    epoch: number;
    now?: number;
    ttlMs?: number;
}

export interface ParsedEnrollmentRequest {
    request: EnrollmentRequest;
    sealed: SealedEnrollmentMessage;
}

export function createEnrollmentInvite(input: {
    accountUpeerId: string;
    accountPublicKey: string;
    authorizerDeviceId: string;
    authorizerAddress?: string;
    now?: number;
    ttlMs?: number;
    secret?: Buffer;
}): EnrollmentCode | null {
    const now = input.now ?? Date.now();
    const ttlMs = input.ttlMs ?? ENROLLMENT_DEFAULT_TTL_MS;
    const accountUpeerId = input.accountUpeerId.trim().toLowerCase();
    const accountPublicKey = input.accountPublicKey.trim().toLowerCase();
    const authorizerDeviceId = input.authorizerDeviceId.trim().toLowerCase();
    if (!isHex(accountUpeerId, 32) || !isHex(accountPublicKey, 32) || !isHex(authorizerDeviceId, 32)) return null;
    if (!Number.isFinite(ttlMs) || ttlMs <= 0 || ttlMs > ENROLLMENT_MAX_TTL_MS) return null;
    const secret = input.secret ?? Buffer.alloc(ENROLLMENT_SECRET_BYTES);
    if (!input.secret) sodium.randombytes_buf(secret);
    if (secret.length !== ENROLLMENT_SECRET_BYTES) return null;
    const authorizerAddress = normalizeAuthorizerAddress(input.authorizerAddress);
    if (input.authorizerAddress && !authorizerAddress) return null;
    const offer: EnrollmentOffer = {
        version: ENROLLMENT_VERSION,
        accountUpeerId,
        accountPublicKey,
        authorizerDeviceId,
        inviteId: inviteIdFor(secret),
        expiresAt: now + ttlMs,
    };
    if (authorizerAddress) offer.authorizerAddress = authorizerAddress;
    const code = Buffer.from(JSON.stringify({
        offer,
        secret: secret.toString('base64url'),
    }), 'utf8').toString('base64url');
    return { offer, secret: Buffer.from(secret), code };
}

export function parseEnrollmentCode(code: string, now = Date.now()): EnrollmentCode | null {
    if (typeof code !== 'string' || code.length === 0 || code.length > 2048) return null;
    const decoded = decodeBase64Url(code);
    if (!decoded) return null;
    let parsed: unknown;
    try {
        parsed = JSON.parse(decoded.toString('utf8'));
    } catch {
        return null;
    }
    if (!isRecord(parsed)) return null;
    const offer = parseOffer(parsed.offer);
    if (!offer) return null;
    if (offer.expiresAt <= now) return null;
    if (typeof parsed.secret !== 'string') return null;
    const secret = decodeBase64Url(parsed.secret);
    if (!secret || secret.length !== ENROLLMENT_SECRET_BYTES) return null;
    if (inviteIdFor(secret) !== offer.inviteId) return null;
    return { offer, secret, code };
}

export function createEnrollmentRequest(input: {
    offer: EnrollmentOffer;
    secret: Buffer;
    devicePublicKey: Buffer;
    deviceSecretKey: Buffer;
    platform: string;
    capabilities?: readonly string[];
    now?: number;
}): SealedEnrollmentMessage | null {
    if (input.secret.length !== ENROLLMENT_SECRET_BYTES) return null;
    if (input.devicePublicKey.length !== sodium.crypto_sign_PUBLICKEYBYTES) return null;
    if (input.deviceSecretKey.length !== sodium.crypto_sign_SECRETKEYBYTES) return null;
    const devicePublicKey = input.devicePublicKey.toString('hex');
    const deviceId = deriveDeviceId(devicePublicKey);
    const platform = input.platform.trim().toLowerCase();
    const capabilities = normalizeCapabilities(input.capabilities ?? ENROLLMENT_CAPABILITIES);
    if (!deviceId || !platform || platform.length > 32 || !capabilities) return null;
    const request: EnrollmentRequest = {
        version: ENROLLMENT_VERSION,
        inviteId: input.offer.inviteId,
        accountUpeerId: input.offer.accountUpeerId,
        deviceId,
        devicePublicKey,
        platform,
        capabilities,
        requestedAt: input.now ?? Date.now(),
        deviceSignature: '',
    };
    request.deviceSignature = signRequest(request, input.deviceSecretKey);
    return sealWithSecret(input.secret, request, input.offer.inviteId);
}

export function openEnrollmentRequest(
    invite: { offer: EnrollmentOffer; secret: Buffer },
    sealed: unknown,
    now = Date.now(),
): EnrollmentRequest | null {
    const message = parseSealed(sealed);
    if (!message) return null;
    if (message.inviteId !== invite.offer.inviteId) return null;
    const plain = openWithSecret(invite.secret, message);
    if (!plain) return null;
    const request = parseRequest(plain);
    if (!request) return null;
    if (request.inviteId !== invite.offer.inviteId) return null;
    if (request.accountUpeerId !== invite.offer.accountUpeerId) return null;
    if (Math.abs(now - request.requestedAt) > ENROLLMENT_MAX_REQUEST_AGE_MS) return null;
    if (request.requestedAt > invite.offer.expiresAt + ENROLLMENT_MAX_REQUEST_AGE_MS) return null;
    if (!verifyRequestSignature(request)) return null;
    return request;
}

export function issueEnrollmentCertificate(input: EnrollmentCertificateInput): AccountDeviceCertificate | null {
    const now = input.now ?? Date.now();
    const accountUpeerId = input.accountUpeerId.trim().toLowerCase();
    const accountPublicKey = input.accountPublicKey.trim().toLowerCase();
    if (!isHex(accountUpeerId, 32) || !isHex(accountPublicKey, 32)) return null;
    if (input.accountSecretKey.length !== sodium.crypto_sign_SECRETKEYBYTES) return null;
    if (input.request.accountUpeerId !== accountUpeerId) return null;
    if (deriveDeviceId(input.request.devicePublicKey) !== input.request.deviceId) return null;
    if (!Number.isInteger(input.epoch) || input.epoch < 0) return null;
    const ttlMs = input.ttlMs ?? ENROLLMENT_CERTIFICATE_TTL_MS;
    if (ttlMs <= 0 || ttlMs > ENROLLMENT_CERTIFICATE_TTL_MS) return null;
    const certificate: AccountDeviceCertificate = {
        version: 1,
        accountUpeerId,
        accountPublicKey,
        deviceId: input.request.deviceId,
        devicePublicKey: input.request.devicePublicKey,
        platform: input.request.platform,
        capabilities: [...input.request.capabilities],
        issuedAt: now,
        expiresAt: now + ttlMs,
        epoch: input.epoch,
        signature: '',
    };
    const signature = Buffer.alloc(sodium.crypto_sign_BYTES);
    sodium.crypto_sign_detached(
        signature,
        Buffer.from(canonicalStringify(certificatePayload(certificate))),
        input.accountSecretKey,
    );
    certificate.signature = signature.toString('hex');
    return certificate;
}

export function sealEnrollmentCertificate(secret: Buffer, certificate: AccountDeviceCertificate): SealedEnrollmentMessage | null {
    if (secret.length !== ENROLLMENT_SECRET_BYTES) return null;
    return sealWithSecret(secret, { version: ENROLLMENT_VERSION, certificate }, inviteIdFor(secret));
}

export function openEnrollmentCertificate(
    secret: Buffer,
    sealed: unknown,
    accountUpeerId: string,
    now = Date.now(),
): AccountDeviceCertificate | null {
    if (secret.length !== ENROLLMENT_SECRET_BYTES) return null;
    const message = parseSealed(sealed);
    if (!message) return null;
    if (message.inviteId !== inviteIdFor(secret)) return null;
    const plain = openWithSecret(secret, message);
    if (!plain || !isRecord(plain)) return null;
    if (plain.version !== ENROLLMENT_VERSION) return null;
    const certificate = parseCertificate(plain.certificate);
    if (!certificate) return null;
    if (certificate.accountUpeerId !== accountUpeerId.trim().toLowerCase()) return null;
    if (!certificateUsable(certificate, certificate.accountUpeerId, now)) return null;
    debug('Certificado de enrolamiento abierto', { deviceId: certificate.deviceId }, 'identity');
    return certificate;
}

export function inviteIdFor(secret: Buffer): string {
    const hash = Buffer.alloc(32);
    sodium.crypto_generichash(hash, secret);
    return hash.toString('hex');
}

function sealWithSecret(secret: Buffer, payload: unknown, inviteId: string): SealedEnrollmentMessage | null {
    const key = Buffer.alloc(sodium.crypto_secretbox_KEYBYTES);
    sodium.crypto_generichash(key, Buffer.from('upeer-enrollment'), secret);
    const nonce = Buffer.alloc(sodium.crypto_secretbox_NONCEBYTES);
    sodium.randombytes_buf(nonce);
    const plain = Buffer.from(canonicalStringify(payload), 'utf8');
    const cipher = Buffer.alloc(plain.length + sodium.crypto_secretbox_MACBYTES);
    sodium.crypto_secretbox_easy(cipher, plain, nonce, key);
    return {
        inviteId,
        nonce: nonce.toString('hex'),
        ciphertext: cipher.toString('hex'),
    };
}

function openWithSecret(secret: Buffer, message: SealedEnrollmentMessage): Record<string, unknown> | null {
    if (!secret || secret.length !== ENROLLMENT_SECRET_BYTES) return null;
    const key = Buffer.alloc(sodium.crypto_secretbox_KEYBYTES);
    sodium.crypto_generichash(key, Buffer.from('upeer-enrollment'), secret);
    let nonce: Buffer;
    let cipher: Buffer;
    try {
        nonce = Buffer.from(message.nonce, 'hex');
        cipher = Buffer.from(message.ciphertext, 'hex');
    } catch {
        return null;
    }
    if (nonce.length !== sodium.crypto_secretbox_NONCEBYTES) return null;
    if (cipher.length <= sodium.crypto_secretbox_MACBYTES) return null;
    const plain = Buffer.alloc(cipher.length - sodium.crypto_secretbox_MACBYTES);
    if (!sodium.crypto_secretbox_open_easy(plain, cipher, nonce, key)) {
        warn('Mensaje de enrolamiento no descifrable', {}, 'identity');
        return null;
    }
    try {
        const parsed = JSON.parse(plain.toString('utf8')) as unknown;
        return isRecord(parsed) ? parsed : null;
    } catch {
        return null;
    }
}

function signRequest(request: EnrollmentRequest, deviceSecretKey: Buffer): string {
    const signature = Buffer.alloc(sodium.crypto_sign_BYTES);
    sodium.crypto_sign_detached(
        signature,
        Buffer.from(canonicalStringify(requestPayload(request))),
        deviceSecretKey,
    );
    return signature.toString('hex');
}

function verifyRequestSignature(request: EnrollmentRequest): boolean {
    try {
        return sodium.crypto_sign_verify_detached(
            Buffer.from(request.deviceSignature, 'hex'),
            Buffer.from(canonicalStringify(requestPayload(request))),
            Buffer.from(request.devicePublicKey, 'hex'),
        );
    } catch (err) {
        warn('Firma de enrolamiento inválida', { error: err instanceof Error ? err.message : String(err) }, 'identity');
        return false;
    }
}

function requestPayload(request: EnrollmentRequest): Record<string, unknown> {
    return {
        version: request.version,
        inviteId: request.inviteId,
        accountUpeerId: request.accountUpeerId,
        deviceId: request.deviceId,
        devicePublicKey: request.devicePublicKey,
        platform: request.platform,
        capabilities: [...request.capabilities],
        requestedAt: request.requestedAt,
    };
}

function parseOffer(value: unknown): EnrollmentOffer | null {
    if (!isRecord(value)) return null;
    if (value.version !== ENROLLMENT_VERSION) return null;
    const accountUpeerId = normalizeHex(value.accountUpeerId);
    const accountPublicKey = normalizeHex(value.accountPublicKey);
    const authorizerDeviceId = normalizeHex(value.authorizerDeviceId);
    const inviteId = normalizeHex(value.inviteId);
    if (!accountUpeerId || !accountPublicKey || !authorizerDeviceId || !inviteId) return null;
    if (typeof value.expiresAt !== 'number' || !Number.isFinite(value.expiresAt)) return null;
    const offer: EnrollmentOffer = {
        version: ENROLLMENT_VERSION,
        accountUpeerId,
        accountPublicKey,
        authorizerDeviceId,
        inviteId,
        expiresAt: value.expiresAt,
    };
    const authorizerAddress = normalizeAuthorizerAddress(value.authorizerAddress);
    if (authorizerAddress) offer.authorizerAddress = authorizerAddress;
    return offer;
}

export function normalizeAuthorizerAddress(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const candidate = value.trim().toLowerCase();
    if (candidate.length < 3 || candidate.length > 45) return null;
    if (!candidate.includes(':')) return null;
    return /^[0-9a-f:.]+$/.test(candidate) ? candidate : null;
}

function parseRequest(value: Record<string, unknown>): EnrollmentRequest | null {
    if (value.version !== ENROLLMENT_VERSION) return null;
    const inviteId = normalizeHex(value.inviteId);
    const accountUpeerId = normalizeHex(value.accountUpeerId);
    const deviceId = normalizeHex(value.deviceId);
    const devicePublicKey = normalizeHex(value.devicePublicKey);
    if (!inviteId || !accountUpeerId || !deviceId || !devicePublicKey) return null;
    if (deriveDeviceId(devicePublicKey) !== deviceId) return null;
    if (typeof value.platform !== 'string' || value.platform.length === 0 || value.platform.length > 32) return null;
    const capabilities = normalizeCapabilities(value.capabilities);
    if (!capabilities) return null;
    if (typeof value.requestedAt !== 'number' || !Number.isFinite(value.requestedAt)) return null;
    if (typeof value.deviceSignature !== 'string' || !isHex(value.deviceSignature, 64)) return null;
    return {
        version: ENROLLMENT_VERSION,
        inviteId,
        accountUpeerId,
        deviceId,
        devicePublicKey,
        platform: value.platform,
        capabilities,
        requestedAt: value.requestedAt,
        deviceSignature: value.deviceSignature.toLowerCase(),
    };
}

function parseSealed(value: unknown): SealedEnrollmentMessage | null {
    if (!isRecord(value)) return null;
    const inviteId = normalizeHex(value.inviteId);
    if (!inviteId) return null;
    if (typeof value.nonce !== 'string' || !isHex(value.nonce, 24)) return null;
    if (typeof value.ciphertext !== 'string' || value.ciphertext.length === 0) return null;
    if (!/^[0-9a-f]+$/i.test(value.ciphertext) || value.ciphertext.length % 2 !== 0) return null;
    return { inviteId, nonce: value.nonce.toLowerCase(), ciphertext: value.ciphertext.toLowerCase() };
}

function normalizeCapabilities(value: unknown): EnrollmentCapability[] | null {
    if (!Array.isArray(value) || value.length === 0) return null;
    const result: EnrollmentCapability[] = [];
    for (const item of value) {
        if (typeof item !== 'string') return null;
        const capability = ENROLLMENT_CAPABILITIES.find(candidate => candidate === item);
        if (!capability || result.includes(capability)) return null;
        result.push(capability);
    }
    return result;
}

function normalizeHex(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const normalized = value.trim().toLowerCase();
    return isHex(normalized, 32) ? normalized : null;
}

function decodeBase64Url(value: string): Buffer | null {
    if (!/^[A-Za-z0-9_-]+$/.test(value)) return null;
    try {
        const decoded = Buffer.from(value, 'base64url');
        return decoded.length > 0 ? decoded : null;
    } catch {
        return null;
    }
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
