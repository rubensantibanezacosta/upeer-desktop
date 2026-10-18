import crypto from 'node:crypto';
import {
    getUPeerIdFromPublicKey,
    getMyPublicKeyHex,
    getMyUPeerId,
} from '../../security/identity.js';
import { deleteMessagesByChatId } from '../../storage/messages/operations.js';
import {
    getContactByUpeerId,
} from '../../storage/contacts/operations.js';
import {
    deleteGroup,
    getGroupById,
    updateGroupMemberPublicKeys,
    saveGroup,
    updateGroupCrypto,
    updateGroupInfo,
    updateGroupMembers,
    type GroupRecord,
} from '../../storage/groups/operations.js';
import { buildGroupInvitePayload, buildGroupUpdatePayload } from '../groupPayload.js';
import { rotateGroupSenderState, generateGroupSenderState } from '../groupState.js';
import { warn } from '../../security/secure-logger.js';
import {
    buildEncryptedGroupPacket,
    buildSignedPacket,
    deliverGroupPacket,
    resolveGroupContact,
} from './groupControlSupport.js';
import { registerEncryptedOperationRetry } from './encryptedOperationRetry.js';
import { runWithConcurrencyMap } from '../concurrency.js';
import { ratchetSessionQueueKey, withRatchetSessionLock } from '../../security/ratchetSessionQueue.js';

function getGroupMemberPublicKeys(memberIds: string[], knownKeys: Record<string, string> = {}): Record<string, string> {
    const memberPublicKeys: Record<string, string> = Object.fromEntries(
        Object.entries(knownKeys).filter(([memberId, publicKey]) =>
            memberIds.includes(memberId)
            && /^[0-9a-f]{64}$/i.test(publicKey)
            && getUPeerIdFromPublicKey(Buffer.from(publicKey, 'hex')) === memberId,
        ),
    );
    const myId = getMyUPeerId();
    const myPublicKey = getMyPublicKeyHex();
    if (memberIds.includes(myId) && /^[0-9a-f]{64}$/i.test(myPublicKey)) {
        memberPublicKeys[myId] = myPublicKey.toLowerCase();
    }
    for (const memberId of memberIds) {
        const contact = getContactByUpeerId(memberId);
        if (contact?.publicKey
            && /^[0-9a-f]{64}$/i.test(contact.publicKey)
            && getUPeerIdFromPublicKey(Buffer.from(contact.publicKey, 'hex')) === memberId) {
            memberPublicKeys[memberId] = contact.publicKey.toLowerCase();
        }
    }
    return memberPublicKeys;
}

const GROUP_FANOUT_CONCURRENCY = 8;

async function sendGroupInvitePacket(
    group: GroupRecord,
    targetUpeerId: string,
    options?: { skipVault?: boolean; registerRetry?: boolean }
): Promise<void> {
    const myId = getMyUPeerId();
    const contact = await resolveGroupContact(targetUpeerId);
    if (!contact?.publicKey || !group.senderKey) return;

    const sensitivePayload = await buildGroupInvitePayload(
        group.name,
        group.members,
        group.epoch,
        group.senderKey,
        group.avatar ?? undefined,
        getGroupMemberPublicKeys(group.members, group.memberPublicKeys ?? {}),
    );
    const retryKey = `group:${group.groupId}:invite:${group.epoch}`;
    const packet = await withRatchetSessionLock(ratchetSessionQueueKey(targetUpeerId, `group:${group.groupId}`), () =>
        buildEncryptedGroupPacket('GROUP_INVITE', group.groupId, myId, sensitivePayload, targetUpeerId, contact));
    const signedPacket = buildSignedPacket(packet, myId);
    await deliverGroupPacket({
        targetUpeerId,
        packet,
        signedPacket,
        contact,
        vaultSeed: `group-invite:${group.groupId}:${targetUpeerId}:${group.epoch}`,
        warnMessage: 'GROUP_INVITE vaulted for offline member',
        skipVault: options?.skipVault,
        warnContext: { targetUpeerId, groupId: group.groupId },
    });

    if (contact.status === 'connected' && options?.registerRetry !== false) {
        registerEncryptedOperationRetry(targetUpeerId, retryKey, () =>
            sendGroupInvitePacket(group, targetUpeerId, { skipVault: true, registerRetry: false }));
    }

}

async function broadcastGroupUpdatePacket(
    group: GroupRecord,
    fields: { name?: string; avatar?: string | null; members?: string[]; memberPublicKeys?: Record<string, string>; epoch?: number; senderKey?: string },
    targetMembers: string[],
    options?: { skipVault?: boolean; registerRetry?: boolean }
): Promise<void> {
    const myId = getMyUPeerId();
    const sensitivePayload = await buildGroupUpdatePayload({
        ...(fields.name !== undefined ? { groupName: fields.name } : {}),
        ...(fields.avatar !== undefined ? { avatar: fields.avatar } : {}),
        ...(fields.members !== undefined ? { members: fields.members } : {}),
        memberPublicKeys: getGroupMemberPublicKeys(fields.members ?? group.members, {
            ...(group.memberPublicKeys ?? {}),
            ...(fields.memberPublicKeys ?? {}),
        }),
        ...(fields.epoch !== undefined ? { epoch: fields.epoch } : {}),
        ...(fields.senderKey !== undefined ? { senderKey: fields.senderKey } : {}),
    });

    await runWithConcurrencyMap(targetMembers, GROUP_FANOUT_CONCURRENCY, async (memberUpeerId) => {
        try {
            const contact = await resolveGroupContact(memberUpeerId);
            if (!contact?.publicKey) return;

            const retryKey = `group:${group.groupId}:update:${group.epoch}:${memberUpeerId}`;
            const packet = await withRatchetSessionLock(ratchetSessionQueueKey(memberUpeerId, `group:${group.groupId}`), () =>
                buildEncryptedGroupPacket('GROUP_UPDATE', group.groupId, myId, sensitivePayload, memberUpeerId, contact));
            const signedPacket = buildSignedPacket(packet, myId);
            await deliverGroupPacket({
                targetUpeerId: memberUpeerId,
                packet,
                signedPacket,
                contact,
                vaultSeed: `group-update:${group.groupId}:${memberUpeerId}:${signedPacket.signature}`,
                warnMessage: 'GROUP_UPDATE vaulted for offline member',
                skipVault: options?.skipVault,
                warnContext: { memberUpeerId, groupId: group.groupId },
            });

            if (contact.status === 'connected' && options?.registerRetry !== false) {
                registerEncryptedOperationRetry(memberUpeerId, retryKey, () =>
                    broadcastGroupUpdatePacket(group, fields, [memberUpeerId], { skipVault: true, registerRetry: false }));
            }

        } catch (err) {
            warn('Failed to deliver GROUP_UPDATE to member', { groupId: group.groupId, memberUpeerId, err: String(err) }, 'network');
        }
    });
}

export async function rotateGroupAfterMemberRemoval(groupId: string, removedUpeerId: string): Promise<void> {
    const group = getGroupById(groupId);
    if (!group) return;

    const myId = getMyUPeerId();
    if (group.adminUpeerId !== myId) return;
    if (removedUpeerId === group.adminUpeerId) return;

    const nextSenderState = rotateGroupSenderState(group.epoch);
    updateGroupCrypto(groupId, nextSenderState);

    const { clearPendingGroupEncryptedOperations } = await import('./encryptedOperationRetry.js');
    for (const memberId of group.members) {
        clearPendingGroupEncryptedOperations(memberId, groupId);
    }
    clearPendingGroupEncryptedOperations(removedUpeerId, groupId);

    const updatedGroup = ensureGroupState(getGroupById(groupId) as GroupRecord);
    if (!updatedGroup) return;

    await broadcastGroupUpdatePacket(
        updatedGroup,
        {
            members: updatedGroup.members,
            epoch: updatedGroup.epoch,
            senderKey: updatedGroup.senderKey ?? undefined,
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
    const memberPublicKeys = getGroupMemberPublicKeys(newMembers, group.memberPublicKeys ?? {});
    updateGroupMemberPublicKeys(groupId, memberPublicKeys);
    updateGroupCrypto(groupId, nextSenderState);

    const updatedGroup = ensureGroupState(getGroupById(groupId) as GroupRecord);
    if (!updatedGroup) return;

    await sendGroupInvitePacket(updatedGroup, upeerId);
    await broadcastGroupUpdatePacket(
        updatedGroup,
        {
            members: updatedGroup.members,
            epoch: updatedGroup.epoch,
            senderKey: updatedGroup.senderKey ?? undefined,
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

    await runWithConcurrencyMap(group.members, GROUP_FANOUT_CONCURRENCY, async (memberUpeerId) => {
        try {
            const isSelf = memberUpeerId === myId;
            const contact = await resolveGroupContact(memberUpeerId);
            if (!contact?.publicKey) return;

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
        } catch (err) {
            warn('Failed to deliver GROUP_LEAVE to member', { groupId, memberUpeerId, err: String(err) }, 'network');
        }
    });

    deleteMessagesByChatId(groupId);
    deleteGroup(groupId);
}