import crypto from 'node:crypto';
import {
    getMyUPeerId,
    sign,
    encrypt,
    getMyPublicKeyHex,
    getMyEphemeralPublicKeyHex,
    incrementEphemeralMessageCounter,
} from '../../security/identity.js';
import { getContactByUpeerId } from '../../storage/contacts/operations.js';
import { deleteMessagesByChatId } from '../../storage/messages/operations.js';
import {
    deleteGroup,
    getGroupById,
    saveGroup,
    updateGroupCrypto,
    updateGroupInfo,
    updateGroupMembers,
    type GroupRecord,
} from '../../storage/groups/operations.js';
import { warn } from '../../security/secure-logger.js';
import { buildGroupInvitePayload, buildGroupUpdatePayload } from '../groupPayload.js';
import { rotateGroupSenderState, generateGroupSenderState, type GroupSenderState } from '../groupState.js';
import { canonicalStringify } from '../utils.js';
import { sendSecureUDPMessage } from '../server/transport.js';
import { EPH_FRESHNESS_MS } from '../server/constants.js';

function shouldUseEphemeral(contact: any): boolean {
    if (!contact?.ephemeralPublicKey) return false;
    const updatedAt = contact.ephemeralPublicKeyUpdatedAt
        ? new Date(contact.ephemeralPublicKeyUpdatedAt).getTime()
        : 0;
    return updatedAt > 0 && (Date.now() - updatedAt) < EPH_FRESHNESS_MS;
}

async function sendPacketToKnownAddresses(contact: any, packet: Record<string, unknown>): Promise<void> {
    const addresses: string[] = [];
    if (contact.address) addresses.push(contact.address);

    try {
        const known = JSON.parse((contact as any).knownAddresses ?? '[]');
        for (const addr of known) {
            if (!addresses.includes(addr)) addresses.push(addr);
        }
    } catch {
        // conservar al menos la dirección primaria si el JSON está corrupto
    }

    for (const addr of addresses) {
        sendSecureUDPMessage(addr, packet, contact.publicKey);
    }
}

async function vaultPacket(targetUpeerId: string, packet: Record<string, unknown>, seed: string): Promise<void> {
    const { VaultManager } = await import('../vault/manager.js');
    const payloadHashOverride = crypto.createHash('sha256').update(seed).digest('hex');
    await VaultManager.replicateToVaults(targetUpeerId, packet, undefined, payloadHashOverride);
}

function buildSignedPacket(packet: Record<string, unknown>, senderUpeerId: string): Record<string, unknown> {
    return {
        ...packet,
        senderUpeerId,
        signature: sign(Buffer.from(canonicalStringify(packet))).toString('hex')
    };
}

async function sendGroupInvitePacket(group: GroupRecord, targetUpeerId: string): Promise<void> {
    const myId = getMyUPeerId();
    const contact = await getContactByUpeerId(targetUpeerId) || (targetUpeerId === myId
        ? { upeerId: myId, publicKey: getMyPublicKeyHex(), status: 'disconnected' }
        : null);
    if (!contact?.publicKey || !group.senderKey) return;

    const useEphemeral = contact.status === 'connected' ? shouldUseEphemeral(contact) : false;
    const targetKeyHex = useEphemeral ? contact.ephemeralPublicKey : contact.publicKey;
    const sensitivePayload = await buildGroupInvitePayload(
        group.name,
        group.members,
        group.epoch,
        group.senderKey,
        group.avatar ?? undefined
    );
    const ephPubKey = getMyEphemeralPublicKeyHex();
    const { ciphertext, nonce } = encrypt(
        Buffer.from(sensitivePayload, 'utf-8'),
        Buffer.from(targetKeyHex, 'hex')
    );

    if (useEphemeral) incrementEphemeralMessageCounter();

    const packet = {
        type: 'GROUP_INVITE',
        groupId: group.groupId,
        adminUpeerId: myId,
        payload: ciphertext,
        nonce,
        ephemeralPublicKey: ephPubKey,
        useRecipientEphemeral: useEphemeral,
    };
    const signedPacket = buildSignedPacket(packet, myId);

    if (contact.status === 'connected') {
        await sendPacketToKnownAddresses(contact, packet);
    }

    await vaultPacket(targetUpeerId, signedPacket, `group-invite:${group.groupId}:${targetUpeerId}:${group.epoch}`);
    if (contact.status !== 'connected') {
        warn('GROUP_INVITE vaulted for offline member', { targetUpeerId, groupId: group.groupId }, 'vault');
    }
}

async function broadcastGroupUpdatePacket(
    group: GroupRecord,
    fields: { name?: string; avatar?: string | null; members?: string[]; epoch?: number; senderKey?: string },
    targetMembers: string[]
): Promise<void> {
    const myId = getMyUPeerId();
    const sensitivePayload = await buildGroupUpdatePayload({
        ...(fields.name !== undefined ? { groupName: fields.name } : {}),
        ...(fields.avatar !== undefined ? { avatar: fields.avatar } : {}),
        ...(fields.members !== undefined ? { members: fields.members } : {}),
        ...(fields.epoch !== undefined ? { epoch: fields.epoch } : {}),
        ...(fields.senderKey !== undefined ? { senderKey: fields.senderKey } : {}),
    });

    for (const memberUpeerId of targetMembers) {
        const contact = await getContactByUpeerId(memberUpeerId) || (memberUpeerId === myId
            ? { upeerId: myId, publicKey: getMyPublicKeyHex(), status: 'disconnected' }
            : null);
        if (!contact?.publicKey) continue;

        const useEphemeral = contact.status === 'connected' ? shouldUseEphemeral(contact) : false;
        const targetKeyHex = useEphemeral ? contact.ephemeralPublicKey : contact.publicKey;
        const ephPubKey = getMyEphemeralPublicKeyHex();
        const { ciphertext, nonce } = encrypt(
            Buffer.from(sensitivePayload, 'utf-8'),
            Buffer.from(targetKeyHex, 'hex')
        );

        if (useEphemeral) incrementEphemeralMessageCounter();

        const packet = {
            type: 'GROUP_UPDATE',
            groupId: group.groupId,
            adminUpeerId: myId,
            payload: ciphertext,
            nonce,
            ephemeralPublicKey: ephPubKey,
            useRecipientEphemeral: useEphemeral,
        };
        const signedPacket = buildSignedPacket(packet, myId);

        if (contact.status === 'connected') {
            await sendPacketToKnownAddresses(contact, packet);
        }

        await vaultPacket(
            memberUpeerId,
            signedPacket,
            `group-update:${group.groupId}:${memberUpeerId}:${signedPacket.signature}`
        );

        if (contact.status !== 'connected') {
            warn('GROUP_UPDATE vaulted for offline member', { memberUpeerId, groupId: group.groupId }, 'vault');
        }
    }
}

export async function rotateGroupAfterMemberRemoval(groupId: string, removedUpeerId: string): Promise<void> {
    const group = getGroupById(groupId);
    if (!group) return;

    const myId = getMyUPeerId();
    if (group.adminUpeerId !== myId) return;
    if (removedUpeerId === group.adminUpeerId) return;

    const nextSenderState = rotateGroupSenderState(group.epoch);
    updateGroupCrypto(groupId, nextSenderState);

    const updatedGroup = ensureGroupState(getGroupById(groupId) as GroupRecord);
    if (!updatedGroup) return;

    await broadcastGroupUpdatePacket(
        updatedGroup,
        {
            members: updatedGroup.members,
            epoch: updatedGroup.epoch,
            senderKey: updatedGroup.senderKey,
        },
        updatedGroup.members
    );
}

function ensureGroupState(group: GroupRecord): GroupRecord | null {
    if (!group.senderKey) return null;
    return group;
}

export async function createGroup(name: string, memberUpeerIds: string[], avatar?: string): Promise<string> {
    const myId = getMyUPeerId();
    const groupId = `grp-${crypto.randomUUID()}`;
    const allMembers = Array.from(new Set([myId, ...memberUpeerIds]));
    const senderState = generateGroupSenderState();

    saveGroup(groupId, name, myId, allMembers, 'active', avatar, senderState);

    const group = getGroupById(groupId);
    if (!group) return groupId;

    await sendGroupInvitePacket(group, myId);

    for (const memberUpeerId of memberUpeerIds) {
        if (memberUpeerId === myId) continue;
        await sendGroupInvitePacket(group, memberUpeerId);
    }

    return groupId;
}

export async function inviteToGroup(groupId: string, upeerId: string): Promise<void> {
    const group = getGroupById(groupId);
    if (!group) return;

    const newMembers = Array.from(new Set([...group.members, upeerId]));
    const nextSenderState = rotateGroupSenderState(group.epoch);

    updateGroupMembers(groupId, newMembers);
    updateGroupCrypto(groupId, nextSenderState);

    const updatedGroup = ensureGroupState(getGroupById(groupId) as GroupRecord);
    if (!updatedGroup) return;

    await sendGroupInvitePacket(updatedGroup, upeerId);
    await broadcastGroupUpdatePacket(
        updatedGroup,
        {
            members: updatedGroup.members,
            epoch: updatedGroup.epoch,
            senderKey: updatedGroup.senderKey,
        },
        updatedGroup.members.filter((member) => member !== upeerId)
    );
}

export async function updateGroup(
    groupId: string,
    fields: { name?: string; avatar?: string | null }
): Promise<void> {
    const group = ensureGroupState(getGroupById(groupId) as GroupRecord);
    if (!group) return;

    updateGroupInfo(groupId, fields);

    const updatedGroup = getGroupById(groupId);
    if (!updatedGroup) return;

    await broadcastGroupUpdatePacket(updatedGroup, fields, updatedGroup.members);
}

export async function leaveGroup(groupId: string): Promise<void> {
    const group = getGroupById(groupId);
    if (!group) return;

    const myId = getMyUPeerId();
    const packet = {
        type: 'GROUP_LEAVE',
        groupId,
        senderUpeerId: myId,
        timestamp: Date.now(),
    };

    for (const memberUpeerId of group.members) {
        if (memberUpeerId === myId) continue;
        const contact = await getContactByUpeerId(memberUpeerId);
        if (contact?.status === 'connected') {
            await sendPacketToKnownAddresses(contact, packet);
        }
    }

    deleteMessagesByChatId(groupId);
    deleteGroup(groupId);
}