import { BrowserWindow } from 'electron';
import { getGroupById, updateGroupCrypto, updateGroupInfo, updateGroupMembers } from '../../storage/groups/operations.js';
import { security, warn } from '../../security/secure-logger.js';
import { isValidGroupEpoch, isValidGroupSenderKey } from '../groupState.js';
import {
    decryptGroupControlPayload,
    GroupControlPacket,
    normalizeAvatarForCompare,
    sameMembers,
    updateGroupEphemeralKeyIfValid,
} from './groupControlShared.js';

export async function handleGroupUpdate(
    senderUpeerId: string,
    data: GroupControlPacket,
    win: BrowserWindow | null
): Promise<void> {
    const { groupId, adminUpeerId } = data;
    if (!groupId || !data.payload || !data.nonce) return;

    updateGroupEphemeralKeyIfValid(senderUpeerId, data.ephemeralPublicKey);

    const group = getGroupById(groupId);
    if (!group) return;

    const claimedAdmin = adminUpeerId || senderUpeerId;
    if (group.adminUpeerId !== claimedAdmin || senderUpeerId !== claimedAdmin) {
        security('GROUP_UPDATE de no-admin ignorado', { sender: senderUpeerId, groupId }, 'security');
        return;
    }

    const fields: { name?: string; avatar?: string | null } = {};
    let members: string[] | undefined;
    let epoch: number | undefined;
    let senderKey: string | undefined;

    try {
        const inner = await decryptGroupControlPayload(senderUpeerId, data);
        if (!inner) {
            security('GROUP_UPDATE: decryption failed', { senderUpeerId, groupId }, 'security');
            return;
        }

        if (inner.groupName && typeof inner.groupName === 'string' && inner.groupName.length <= 100) {
            fields.name = inner.groupName;
        }
        if (inner.avatar === null) {
            fields.avatar = null;
        } else if (typeof inner.avatar === 'string' && inner.avatar.startsWith('data:image/') && inner.avatar.length <= 2_000_000) {
            fields.avatar = inner.avatar;
        }
        if (Array.isArray(inner.members) && inner.members.length <= 500) {
            members = inner.members;
        }
        if (inner.epoch !== undefined && isValidGroupEpoch(inner.epoch)) {
            epoch = inner.epoch;
        }
        if (inner.senderKey !== undefined && isValidGroupSenderKey(inner.senderKey)) {
            senderKey = inner.senderKey;
        }
    } catch (err) {
        security('GROUP_UPDATE: parse error', { senderUpeerId, err: String(err) }, 'security');
        return;
    }

    if ((epoch !== undefined) !== (senderKey !== undefined)) {
        warn('GROUP_UPDATE ignored partial sender state', { senderUpeerId, groupId }, 'security');
        return;
    }

    if (epoch !== undefined && epoch < group.epoch) {
        warn('Stale GROUP_UPDATE ignored', { senderUpeerId, groupId, epoch, currentEpoch: group.epoch }, 'security');
        return;
    }
    if (epoch !== undefined && epoch === group.epoch && senderKey !== group.senderKey) {
        security('GROUP_UPDATE with conflicting senderKey for same epoch', { senderUpeerId, groupId, epoch }, 'security');
        return;
    }

    const sameName = fields.name === undefined || fields.name === group.name;
    const sameAvatar = fields.avatar === undefined || normalizeAvatarForCompare(fields.avatar) === normalizeAvatarForCompare(group.avatar);
    const sameMemberSet = !members || sameMembers(members, group.members);
    const sameEpochState = epoch === undefined || (epoch === group.epoch && senderKey === group.senderKey);
    if (sameName && sameAvatar && sameMemberSet && sameEpochState) {
        return;
    }

    if (members) {
        updateGroupMembers(groupId, members);
    }
    if (epoch !== undefined && senderKey !== undefined) {
        updateGroupCrypto(groupId, { epoch, senderKey, senderKeyCreatedAt: Date.now() });
    }
    if (Object.keys(fields).length > 0) {
        updateGroupInfo(groupId, fields);
    }

    if (Object.keys(fields).length === 0 && !members && epoch === undefined) return;

    win?.webContents.send('group-updated', {
        groupId,
        ...(fields.name !== undefined ? { name: fields.name } : {}),
        ...(fields.avatar !== undefined ? { avatar: fields.avatar } : {}),
        ...(members ? { members } : {}),
    });
}
