import { getContactByUpeerId } from '../../storage/contacts/operations.js';
import { updateContactEphemeralPublicKey } from '../../storage/contacts/keys.js';
import { decrypt, decryptWithIdentityKey } from '../../security/identity.js';

export type GroupPayload = {
    groupName?: string;
    members?: string[];
    avatar?: string | null;
    epoch?: number;
    senderKey?: string;
};

export function sameMembers(left: string[], right: string[]): boolean {
    if (left.length !== right.length) return false;
    const leftSorted = [...left].sort();
    const rightSorted = [...right].sort();
    return leftSorted.every((value, index) => value === rightSorted[index]);
}

export function normalizeAvatarForCompare(value: string | undefined | null): string | null {
    return typeof value === 'string' ? value : null;
}

export function updateGroupEphemeralKeyIfValid(upeerId: string, ephemeralPublicKey: unknown): string | null {
    if (typeof ephemeralPublicKey !== 'string' || !/^[0-9a-f]{64}$/i.test(ephemeralPublicKey)) {
        return null;
    }

    updateContactEphemeralPublicKey(upeerId, ephemeralPublicKey);
    return ephemeralPublicKey;
}

export async function decryptGroupControlPayload(upeerId: string, data: any): Promise<GroupPayload | null> {
    const contact = await getContactByUpeerId(upeerId);
    const senderKey = typeof data.ephemeralPublicKey === 'string' && /^[0-9a-f]{64}$/i.test(data.ephemeralPublicKey)
        ? data.ephemeralPublicKey
        : contact?.publicKey;

    if (!senderKey) return null;

    const decrypted = decrypt(
        Buffer.from(data.nonce, 'hex'),
        Buffer.from(data.payload, 'hex'),
        Buffer.from(senderKey, 'hex')
    );

    const staticDecrypted = !decrypted && data.useRecipientEphemeral === false
        ? decryptWithIdentityKey(
            Buffer.from(data.nonce, 'hex'),
            Buffer.from(data.payload, 'hex'),
            Buffer.from(senderKey, 'hex')
        )
        : null;

    const resolved = decrypted ?? staticDecrypted;
    if (!resolved) return null;

    return JSON.parse(resolved.toString('utf-8')) as GroupPayload;
}
