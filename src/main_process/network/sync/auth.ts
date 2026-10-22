import { getDeviceMessagingIdentity, verifyDeviceSignature } from '../../security/deviceMessaging.js';
import { getDeviceIdentity, verifyDeviceCertificate } from '../../security/deviceIdentity.js';
import { getMyAccountRegistry } from '../accountRegistry.js';
import { canonicalStringify } from '../utils.js';
import type { AccountDeviceCertificate } from '../../security/deviceCertificate.js';
import type { SyncDeviceBinding, SyncHelloPayload } from './types.js';

type SyncIdentity = {
    deviceId: string;
    devicePublicKey: string;
    certificate: AccountDeviceCertificate;
    signedPreKey: { spkPub: string; spkSig: string; spkId: number };
};

export function getMySyncIdentity(now = Date.now()): SyncIdentity | null {
    const identity = getDeviceIdentity(now);
    const messaging = getDeviceMessagingIdentity(now);
    if (!identity || !messaging) return null;
    return {
        deviceId: identity.deviceId,
        devicePublicKey: identity.publicKey,
        certificate: identity.certificate,
        signedPreKey: messaging.signedPreKey,
    };
}

export function buildHelloPayload(ack: boolean, now = Date.now()): SyncHelloPayload | null {
    const identity = getMySyncIdentity(now);
    if (!identity) return null;
    return {
        deviceId: identity.deviceId,
        deviceCertificate: identity.certificate,
        deviceSignedPreKey: identity.signedPreKey,
        timestamp: now,
        ack,
    };
}

export function verifySyncHelloBinding(
    payload: SyncHelloPayload,
    accountUpeerId: string,
    now = Date.now(),
): SyncDeviceBinding | null {
    const certificate = verifyDeviceCertificate(payload.deviceCertificate, accountUpeerId, now);
    if (!certificate) return null;
    if (certificate.deviceId !== payload.deviceId.toLowerCase()) return null;
    if (isDeviceRevoked(accountUpeerId, certificate.deviceId)) return null;
    const signedPreKey = payload.deviceSignedPreKey;
    if (!verifyDeviceSignature(
        Buffer.from(signedPreKey.spkPub, 'hex'),
        signedPreKey.spkSig,
        certificate.devicePublicKey,
    )) {
        return null;
    }
    return {
        deviceId: certificate.deviceId,
        devicePublicKey: certificate.devicePublicKey,
        deviceCertificate: certificate,
        deviceSignedPreKey: signedPreKey,
    };
}

export function verifySelfSyncSignature(
    data: Record<string, unknown>,
    certificate: AccountDeviceCertificate,
    signature: string,
    senderUpeerId: string,
    senderYggAddress?: string,
): boolean {
    const dataForVerification = { ...data };
    delete dataForVerification.contactCache;
    delete dataForVerification.renewalToken;
    delete dataForVerification.signature;
    delete dataForVerification.senderUpeerId;
    delete dataForVerification.senderYggAddress;
    const payload: Record<string, unknown> = { ...dataForVerification, senderUpeerId };
    if (senderYggAddress !== undefined) payload.senderYggAddress = senderYggAddress;
    if (verifyDeviceSignature(
        Buffer.from(canonicalStringify(payload)),
        signature,
        certificate.devicePublicKey,
    )) {
        return true;
    }
    if (senderYggAddress === undefined) return false;
    const legacyPayload = { ...dataForVerification, senderUpeerId };
    return verifyDeviceSignature(
        Buffer.from(canonicalStringify(legacyPayload)),
        signature,
        certificate.devicePublicKey,
    );
}

export function certificateFromPacket(data: Record<string, unknown>, accountUpeerId: string, now = Date.now()): AccountDeviceCertificate | null {
    const certificate = verifyDeviceCertificate(data.senderDeviceCertificate, accountUpeerId, now);
    if (!certificate) return null;
    if (typeof data.senderDeviceId !== 'string') return null;
    if (certificate.deviceId !== data.senderDeviceId.toLowerCase()) return null;
    if (isDeviceRevoked(accountUpeerId, certificate.deviceId)) return null;
    return certificate;
}

function isDeviceRevoked(accountUpeerId: string, deviceId: string): boolean {
    const registry = getMyAccountRegistry();
    if (!registry || registry.accountUpeerId !== accountUpeerId.toLowerCase()) return false;
    return registry.revoked.some(item => item.deviceId === deviceId);
}
