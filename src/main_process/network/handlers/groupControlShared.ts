import { getUPeerIdFromPublicKey } from '../../security/identity.js';
import { updateContactEphemeralPublicKey } from '../../storage/contacts/keys.js';
import type { RatchetHeader, X3DHInitPacket } from '../../security/ratchetShared.js';
import { decryptDoubleRatchetPayload, type RatchetContext } from './doubleRatchetDecrypt.js';

export type GroupPayload = {
    groupName?: string;
    members?: string[];
    memberPublicKeys?: Record<string, string>;
    avatar?: string | null;
    epoch?: number;
    senderKey?: string;
    adminUpeerId?: string;
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

export function validMemberPublicKeys(value: unknown): Record<string, string> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return Object.fromEntries(Object.entries(value).filter(([upeerId, publicKey]) =>
        typeof publicKey === 'string'
        && /^[0-9a-f]{64}$/i.test(publicKey)
        && getUPeerIdFromPublicKey(Buffer.from(publicKey, 'hex')) === upeerId,
    ).map(([upeerId, publicKey]) => [upeerId, (publicKey as string).toLowerCase()]));
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
    onReset?: (reset: { type: 'DR_RESET'; ratchetContext: RatchetContext }) => void | Promise<void>,
): Promise<GroupPayload | null> {
    if (data.ratchetHeader) {
        const reset = onReset
            ? async (packet: { type: 'DR_RESET'; ratchetContext: RatchetContext }) => onReset({
                ...packet,
                ratchetContext: `group:${data.groupId}`,
            })
            : undefined;
        const doubleRatchetContent = await decryptDoubleRatchetPayload(upeerId, {
            content: data.payload,
            nonce: data.nonce,
            ratchetHeader: data.ratchetHeader,
            x3dhInit: data.x3dhInit,
        }, reset, `group:${data.groupId}`);
        return doubleRatchetContent
            ? JSON.parse(doubleRatchetContent) as GroupPayload
            : null;
    }
    return null;
}
