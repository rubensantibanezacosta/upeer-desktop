import { updateContactEphemeralPublicKey } from '../../storage/contacts/keys.js';
import type { RatchetHeader, X3DHInitPacket } from '../../security/ratchetShared.js';
import { decryptDoubleRatchetPayload } from './doubleRatchetDecrypt.js';

export type GroupPayload = {
    groupName?: string;
    members?: string[];
    avatar?: string | null;
    epoch?: number;
    senderKey?: string;
};

export interface GroupControlPacket extends GroupPayload {
    groupId: string;
    payload?: string;
    nonce?: string;
    adminUpeerId?: string;
    x3dhInit?: X3DHInitPacket;
    ratchetHeader?: RatchetHeader;
    ephemeralPublicKey?: string;
    useRecipientEphemeral?: boolean;
    signature?: string;
    isInternalSync?: boolean;
}

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

export async function decryptGroupControlPayload(
    upeerId: string,
    data: GroupControlPacket,
    onReset?: () => void | Promise<void>,
): Promise<GroupPayload | null> {
    if (data.ratchetHeader) {
        const doubleRatchetContent = await decryptDoubleRatchetPayload(upeerId, {
            content: data.payload,
            nonce: data.nonce,
            ratchetHeader: data.ratchetHeader,
            x3dhInit: data.x3dhInit,
        }, onReset);
        if (doubleRatchetContent) {
            return JSON.parse(doubleRatchetContent) as GroupPayload;
        }
    }
    if (typeof data.nonce === 'string' || typeof data.payload === 'string') {
        await onReset?.();
    }
    return null;
}
