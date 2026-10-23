import sodium from 'sodium-native';
import { getDeviceIdentity, verifyDeviceCertificate, type DeviceIdentity } from './deviceIdentity.js';
import { getDeviceSpkBySpkId, getMyDeviceSignedPreKey } from './deviceSpk.js';
import { identityState } from './identityState.js';
import type { AccountDeviceCertificate } from './deviceCertificate.js';

export type DeviceHandshakeFields = {
    devicePublicKey: string;
    deviceId: string;
    deviceCertificate: AccountDeviceCertificate;
    deviceSignedPreKey: {
        spkPub: string;
        spkSig: string;
        spkId: number;
    };
};

export type ContactDeviceBinding = {
    devicePublicKey: string;
    deviceId: string;
    deviceCertificate: string;
    deviceSignedPreKey: string;
    deviceSignedPreKeySignature: string;
    deviceSignedPreKeyId: number;
};

export type DeviceMessagingIdentity = {
    identity: DeviceIdentity;
    signedPreKey: { spkPub: string; spkSig: string; spkId: number };
};

export function buildMyDeviceHandshakeFields(now = Date.now()): DeviceHandshakeFields | null {
    const identity = getDeviceIdentity(now);
    const signedPreKey = getMyDeviceSignedPreKey(now);
    if (!identity || !signedPreKey) return null;
    return {
        devicePublicKey: identity.publicKey,
        deviceId: identity.deviceId,
        deviceCertificate: identity.certificate,
        deviceSignedPreKey: signedPreKey,
    };
}

export function parseDeviceHandshakeFields(
    data: Record<string, unknown>,
    accountUpeerId: string,
    now = Date.now(),
): DeviceHandshakeFields | null {
    if (typeof data.devicePublicKey !== 'string' || !isHex(data.devicePublicKey, 32)) return null;
    if (typeof data.deviceId !== 'string' || !isHex(data.deviceId, 32)) return null;
    if (!data.deviceCertificate) return null;
    if (!isRecord(data.deviceSignedPreKey)) return null;
    const certificate = verifyDeviceCertificate(data.deviceCertificate, accountUpeerId, now);
    if (!certificate) return null;
    const devicePublicKey = data.devicePublicKey.toLowerCase();
    const deviceId = data.deviceId.toLowerCase();
    if (certificate.devicePublicKey !== devicePublicKey) return null;
    if (certificate.deviceId !== deviceId) return null;
    const { spkPub, spkSig, spkId } = data.deviceSignedPreKey;
    if (typeof spkPub !== 'string' || !isHex(spkPub, 32)) return null;
    if (typeof spkSig !== 'string' || !isHex(spkSig, 64)) return null;
    if (typeof spkId !== 'number' || !Number.isInteger(spkId) || spkId <= 0) return null;
    if (!verifyDeviceSignature(Buffer.from(spkPub, 'hex'), spkSig, devicePublicKey)) return null;
    return {
        devicePublicKey,
        deviceId,
        deviceCertificate: certificate,
        deviceSignedPreKey: {
            spkPub: spkPub.toLowerCase(),
            spkSig: spkSig.toLowerCase(),
            spkId,
        },
    };
}

export function toContactDeviceBinding(fields: DeviceHandshakeFields): ContactDeviceBinding {
    return {
        devicePublicKey: fields.devicePublicKey,
        deviceId: fields.deviceId,
        deviceCertificate: JSON.stringify(fields.deviceCertificate),
        deviceSignedPreKey: fields.deviceSignedPreKey.spkPub,
        deviceSignedPreKeySignature: fields.deviceSignedPreKey.spkSig,
        deviceSignedPreKeyId: fields.deviceSignedPreKey.spkId,
    };
}

export function hasDeviceHandshakeFields(data: Record<string, unknown>): boolean {
    return data.devicePublicKey !== undefined
        || data.deviceId !== undefined
        || data.deviceCertificate !== undefined
        || data.deviceSignedPreKey !== undefined;
}

export function getDeviceMessagingIdentity(now = Date.now()): DeviceMessagingIdentity | null {
    const identity = getDeviceIdentity(now);
    const signedPreKey = getMyDeviceSignedPreKey(now);
    if (!identity || !signedPreKey) return null;
    return { identity, signedPreKey };
}

export function isMyDevicePublicKey(publicKeyHex: string, now = Date.now()): boolean {
    const identity = getDeviceIdentity(now);
    return Boolean(identity && identity.publicKey === publicKeyHex.toLowerCase());
}

export function signWithDevice(payload: Buffer, now = Date.now()): Buffer | null {
    const identity = getDeviceIdentity(now);
    if (!identity || identityState.isLocked) return null;
    const signature = Buffer.alloc(sodium.crypto_sign_BYTES);
    sodium.crypto_sign_detached(signature, payload, identity.secretKey);
    return signature;
}

export function verifyDeviceSignature(payload: Buffer, signatureHex: string, devicePublicKey: string): boolean {
    try {
        return sodium.crypto_sign_verify_detached(
            Buffer.from(signatureHex, 'hex'),
            payload,
            Buffer.from(devicePublicKey, 'hex'),
        );
    } catch {
        return false;
    }
}

export function decryptSealedWithDevice(ciphertext: Buffer, now = Date.now()): Buffer | null {
    const identity = getDeviceIdentity(now);
    if (!identity || identityState.isLocked) return null;
    const boxPublicKey = Buffer.alloc(sodium.crypto_box_PUBLICKEYBYTES);
    const boxSecretKey = Buffer.alloc(sodium.crypto_box_SECRETKEYBYTES);
    sodium.crypto_sign_ed25519_sk_to_curve25519(boxSecretKey, identity.secretKey);
    sodium.crypto_sign_ed25519_pk_to_curve25519(boxPublicKey, Buffer.from(identity.publicKey, 'hex'));
    const plaintext = Buffer.alloc(ciphertext.length - sodium.crypto_box_SEALBYTES);
    const opened = sodium.crypto_box_seal_open(plaintext, ciphertext, boxPublicKey, boxSecretKey);
    return opened ? plaintext : null;
}

export function resolveInboundDeviceSpk(
    spkId: number,
    now = Date.now(),
): { secretKey: Buffer; spkPk: Buffer; spkSk: Buffer } | null {
    const identity = getDeviceIdentity(now);
    const spk = getDeviceSpkBySpkId(spkId, now);
    if (!identity || !spk) return null;
    return { secretKey: identity.secretKey, ...spk };
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isHex(value: string, expectedBytes: number): boolean {
    return value.length === expectedBytes * 2 && /^[0-9a-f]+$/i.test(value);
}
