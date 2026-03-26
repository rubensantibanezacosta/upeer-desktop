import crypto from 'node:crypto';
import {
    getMyUPeerId,
} from '../../security/identity.js';
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
import { buildGroupInvitePayload, buildGroupUpdatePayload } from '../groupPayload.js';
import { rotateGroupSenderState, generateGroupSenderState } from '../groupState.js';
import {
    buildEncryptedGroupPacket,
    buildSignedPacket,
    deliverGroupPacket,
    resolveGroupContact,
} from './groupControlSupport.js';

async function sendGroupInvitePacket(group: GroupRecord, targetUpeerId: string): Promise<void> {
    const myId = getMyUPeerId();
    const contact = await resolveGroupContact(targetUpeerId);
    if (!contact?.publicKey || !group.senderKey) return;

    const sensitivePayload = await buildGroupInvitePayload(
        group.name,
        group.members,
        group.epoch,
        group.senderKey,
        group.avatar ?? undefined
    );
    const packet = await buildEncryptedGroupPacket('GROUP_INVITE', group.groupId, myId, sensitivePayload, contact.publicKey);
    const signedPacket = buildSignedPacket(packet, myId);
    await deliverGroupPacket({
        targetUpeerId,
        packet,
        signedPacket,
        contact,
        vaultSeed: `group-invite:${group.groupId}:${targetUpeerId}:${group.epoch}`,
        warnMessage: 'GROUP_INVITE vaulted for offline member',
        warnContext: { targetUpeerId, groupId: group.groupId },
    });
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
        const contact = await resolveGroupContact(memberUpeerId);
        if (!contact?.publicKey) continue;

        const packet = await buildEncryptedGroupPacket('GROUP_UPDATE', group.groupId, myId, sensitivePayload, contact.publicKey);
        const signedPacket = buildSignedPacket(packet, myId);
        await deliverGroupPacket({
            targetUpeerId: memberUpeerId,
            packet,
            signedPacket,
            contact,
            vaultSeed: `group-update:${group.groupId}:${memberUpeerId}:${signedPacket.signature}`,
            warnMessage: 'GROUP_UPDATE vaulted for offline member',
            warnContext: { memberUpeerId, groupId: group.groupId },
        });
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
    const packet = buildSignedPacket({
        type: 'GROUP_LEAVE',
        groupId,
        timestamp: Date.now(),
    }, myId);

    for (const memberUpeerId of group.members) {
        const isSelf = memberUpeerId === myId;
        const contact = await resolveGroupContact(memberUpeerId);
        if (!contact?.publicKey) continue;

        await deliverGroupPacket({
            targetUpeerId: memberUpeerId,
            packet,
            signedPacket: packet,
            contact,
            vaultSeed: `group-leave:${groupId}:${memberUpeerId}:${packet.signature}`,
            warnMessage: 'GROUP_LEAVE vaulted for offline member',
            warnContext: { memberUpeerId, groupId },
            skipDirectSend: isSelf,
        });
    }

    deleteMessagesByChatId(groupId);
    deleteGroup(groupId);
}