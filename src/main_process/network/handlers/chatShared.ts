import { updateContactEphemeralPublicKey } from '../../storage/contacts/keys.js';

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidMessageId(value: unknown): boolean {
    return typeof value === 'string' && UUID_RE.test(value);
}

export function updateEphemeralKeyIfValid(upeerId: string, ephemeralPublicKey: unknown): string | null {
    if (typeof ephemeralPublicKey !== 'string' || !/^[0-9a-f]{64}$/i.test(ephemeralPublicKey)) {
        return null;
    }

    updateContactEphemeralPublicKey(upeerId, ephemeralPublicKey);
    return ephemeralPublicKey;
}
