import { canonicalStringify } from '../cryptoUtils.js';
import { signWithDevice, verifyDeviceSignature } from '../../security/deviceMessaging.js';
import { verifyDeviceCertificate } from '../../security/deviceIdentity.js';
import { parseCertificate } from '../../security/deviceCertificate.js';
import { getMySyncIdentity } from './auth.js';
import type { SyncPlainEvent } from './types.js';

const SIGNATURE_HEX_LENGTH = 128;

export function originSignaturePayload(event: SyncPlainEvent): Buffer {
    return Buffer.from(canonicalStringify({
        eventId: event.eventId,
        kind: event.kind,
        occurredAt: event.occurredAt,
        sequence: event.sequence,
        originDeviceId: event.originDeviceId ?? null,
        payload: event.payload,
    }));
}

export function signSyncEventOrigin(event: SyncPlainEvent, now = Date.now()): SyncPlainEvent {
    const identity = getMySyncIdentity(now);
    if (!identity) return event;
    const signed = { ...event, originDeviceId: identity.deviceId };
    const signature = signWithDevice(originSignaturePayload(signed), now);
    if (!signature) return event;
    return {
        ...signed,
        originSignature: signature.toString('hex'),
        originCertificate: identity.certificate,
    };
}

export function verifySyncEventOrigin(
    event: SyncPlainEvent,
    accountUpeerId: string,
    now = Date.now(),
): boolean {
    if (!event.originDeviceId || !event.originSignature || !event.originCertificate) return false;
    if (!new RegExp(`^[0-9a-f]{${SIGNATURE_HEX_LENGTH}}$`, 'i').test(event.originSignature)) return false;
    const certificate = parseCertificate(event.originCertificate);
    if (!certificate || certificate.deviceId !== event.originDeviceId) return false;
    const reference = Math.min(Math.max(event.occurredAt, certificate.issuedAt), now);
    if (!verifyDeviceCertificate(certificate, accountUpeerId, reference)) return false;
    return verifyDeviceSignature(originSignaturePayload(event), event.originSignature, certificate.devicePublicKey);
}
