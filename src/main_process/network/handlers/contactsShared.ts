import { verify, getUPeerIdFromPublicKey } from '../../security/identity.js';
import { canonicalStringify } from '../utils.js';
import { security, warn } from '../../security/secure-logger.js';
import { updateContactSignedPreKey } from '../../storage/contacts/keys.js';
import { IdentityRateLimiter } from '../../security/identity-rate-limiter.js';

export const rateLimiter = new IdentityRateLimiter();

type SignedPreKeyPayload = {
    spkPub?: unknown;
    spkSig?: unknown;
    spkId?: unknown;
};

type HandshakePayload = {
    publicKey: string;
    type?: string;
    signedPreKey?: SignedPreKeyPayload | unknown;
    avatar?: unknown;
    alias?: unknown;
    contactCache?: unknown;
    renewalToken?: unknown;
};

export function verifyHandshakeRequestSignature(data: HandshakePayload, signature: string, senderUpeerId: string, senderYggAddress: string): boolean {
    const fieldsToExclude = ['contactCache', 'renewalToken'];
    const dataForVerification: Record<string, unknown> = { ...data };
    for (const field of fieldsToExclude) {
        if (field in dataForVerification) {
            delete dataForVerification[field];
        }
    }

    const payloadForVerification = { ...dataForVerification, senderUpeerId, senderYggAddress };
    const isValidSignature = verify(
        Buffer.from(canonicalStringify(payloadForVerification)),
        Buffer.from(signature, 'hex'),
        Buffer.from(data.publicKey, 'hex')
    );
    if (isValidSignature) return true;

    const legacyPayload = { ...dataForVerification, senderUpeerId };
    return verify(
        Buffer.from(canonicalStringify(legacyPayload)),
        Buffer.from(signature, 'hex'),
        Buffer.from(data.publicKey, 'hex')
    );
}

export function verifyHandshakeAcceptSignature(data: HandshakePayload, signature: string, senderUpeerId: string, senderYggAddress: string): boolean {
    const acceptPayload: Record<string, unknown> = { ...data, senderUpeerId, senderYggAddress };
    let isValidSignature = verify(
        Buffer.from(canonicalStringify(acceptPayload)),
        Buffer.from(signature, 'hex'),
        Buffer.from(data.publicKey, 'hex')
    );
    if (isValidSignature) return true;

    const legacyAcceptPayload: Record<string, unknown> = { ...data, senderUpeerId };
    isValidSignature = verify(
        Buffer.from(canonicalStringify(legacyAcceptPayload)),
        Buffer.from(signature, 'hex'),
        Buffer.from(data.publicKey, 'hex')
    );
    if (isValidSignature) return true;

    return verify(
        Buffer.from(canonicalStringify(data)),
        Buffer.from(signature, 'hex'),
        Buffer.from(data.publicKey, 'hex')
    );
}

export function hasValidHandshakeIdentity(data: HandshakePayload, senderUpeerId: string, ip: string, type: string): boolean {
    const derivedId = getUPeerIdFromPublicKey(Buffer.from(data.publicKey, 'hex'));
    if (derivedId === senderUpeerId) {
        return true;
    }

    security(`${type} ID mismatch`, { ip, expected: derivedId, received: senderUpeerId }, 'network');
    return false;
}

export function getSafeEphemeralPublicKey(value: unknown): string | undefined {
    return typeof value === 'string' && /^[0-9a-f]{64}$/i.test(value) ? value : undefined;
}

export function maybeUpdateSignedPreKey(upeerId: string, publicKey: string, signedPreKey: unknown, label: string): void {
    if (!signedPreKey || typeof signedPreKey !== 'object') {
        return;
    }

    const { spkPub, spkSig, spkId } = signedPreKey as { spkPub?: unknown; spkSig?: unknown; spkId?: unknown };
    if (typeof spkPub !== 'string' || typeof spkSig !== 'string' || typeof spkId !== 'number') {
        return;
    }

    try {
        const spkValid = verify(
            Buffer.from(spkPub, 'hex'),
            Buffer.from(spkSig, 'hex'),
            Buffer.from(publicKey, 'hex')
        );
        if (spkValid) {
            updateContactSignedPreKey(upeerId, spkPub, spkSig, spkId);
            return;
        }

        security(`${label}: firma SPK inválida`, { upeerId }, 'security');
    } catch (err) {
        warn('Error in SPK verification', err, 'security');
    }
}

export function maybeSendAvatarUpdate(upeerId: string, avatar: unknown, updateContactAvatar: (upeerId: string, avatar: string) => void): void {
    if (typeof avatar === 'string' && avatar.startsWith('data:image/') && avatar.length <= 2_000_000) {
        updateContactAvatar(upeerId, avatar);
    }
}
