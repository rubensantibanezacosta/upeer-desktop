import { randomUUID } from 'node:crypto';
import { BrowserWindow } from 'electron';
import { getMainWindow } from '../../core/windowManager.js';
import { showDesktopNotification } from '../../utils/desktopNotification.js';
import { focusWindow } from '../../utils/windowFocus.js';
import {
    getGroupById,
    saveGroup,
    updateGroupCrypto,
    updateGroupInfo,
    updateGroupMembers,
} from '../../storage/groups/operations.js';
import { saveMessage } from '../../storage/messages/operations.js';
import { getContactByUpeerId } from '../../storage/contacts/operations.js';
import { updateContactEphemeralPublicKey } from '../../storage/contacts/keys.js';
import { decrypt } from '../../security/identity.js';
import { issueVouch, VouchType } from '../../security/reputation/vouches.js';
import { security, warn } from '../../security/secure-logger.js';
import { isValidGroupEpoch, isValidGroupSenderKey } from '../groupState.js';

type GroupPayload = {
    groupName?: string;
    members?: string[];
    avatar?: string | null;
    epoch?: number;
    senderKey?: string;
};

function sameMembers(left: string[], right: string[]): boolean {
    if (left.length !== right.length) return false;
    const leftSorted = [...left].sort();
    const rightSorted = [...right].sort();
    return leftSorted.every((value, index) => value === rightSorted[index]);
}

function normalizeAvatarForCompare(value: string | undefined | null): string | null {
    return typeof value === 'string' ? value : null;
}

async function decryptGroupControlPayload(upeerId: string, data: any): Promise<GroupPayload | null> {
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

    if (!decrypted) return null;

    return JSON.parse(decrypted.toString('utf-8')) as GroupPayload;
}

export async function handleGroupInvite(
    upeerId: string,
    data: any,
    win: BrowserWindow | null
) {
    const { groupId, adminUpeerId } = data;
    if (!groupId || !data.payload || !data.nonce) return;

    if (typeof data.ephemeralPublicKey === 'string' && /^[0-9a-f]{64}$/i.test(data.ephemeralPublicKey)) {
        updateContactEphemeralPublicKey(upeerId, data.ephemeralPublicKey);
    }

    let groupName: string;
    let members: string[];
    let avatar: string | undefined;
    let epoch: number;
    let senderKey: string;
    let senderDisplayName = upeerId;

    try {
        const contact = await getContactByUpeerId(upeerId);
        senderDisplayName = contact?.name || contact?.alias || upeerId;
        const inner = await decryptGroupControlPayload(upeerId, data);
        if (!inner) {
            security('GROUP_INVITE: decryption failed', { upeerId, groupId }, 'security');
            return;
        }

        groupName = inner.groupName ?? '';
        members = Array.isArray(inner.members) ? inner.members : [];
        epoch = inner.epoch as number;
        senderKey = inner.senderKey ?? '';

        if (
            typeof inner.avatar === 'string' &&
            inner.avatar.startsWith('data:image/') &&
            inner.avatar.length <= 2_000_000
        ) {
            avatar = inner.avatar;
        }
    } catch {
        security('GROUP_INVITE: parse error after decrypt', { upeerId }, 'security');
        return;
    }

    if (
        typeof groupName !== 'string' ||
        groupName.length === 0 ||
        groupName.length > 100 ||
        !Array.isArray(members) ||
        members.length > 500 ||
        !isValidGroupEpoch(epoch) ||
        !isValidGroupSenderKey(senderKey)
    ) {
        security('GROUP_INVITE: invalid payload', { upeerId, groupId }, 'security');
        return;
    }

    const actualAdmin = adminUpeerId || upeerId;
    if (upeerId !== actualAdmin) {
        security('Identity mismatch in group invite!', { sender: upeerId, claimedAdmin: adminUpeerId }, 'security');
        issueVouch(upeerId, VouchType.MALICIOUS).catch(() => undefined);
        return;
    }

    const existing = getGroupById(groupId);
    const isNewGroup = !existing;
    if (!existing) {
        saveGroup(
            groupId,
            groupName,
            actualAdmin,
            members || [upeerId],
            'active',
            avatar,
            { epoch, senderKey, senderKeyCreatedAt: Date.now() }
        );
    } else {
        if (existing.epoch > epoch) {
            warn('Stale GROUP_INVITE ignored', { upeerId, groupId, epoch, currentEpoch: existing.epoch }, 'security');
            return;
        }
        if (existing.adminUpeerId !== actualAdmin) {
            security('Group invite from non-admin!', { sender: upeerId, groupId }, 'security');
            issueVouch(upeerId, VouchType.MALICIOUS).catch(() => undefined);
            return;
        }
        if (!existing.members.includes(upeerId)) {
            security('Group invite from non-member!', { sender: upeerId, groupId }, 'security');
            issueVouch(upeerId, VouchType.MALICIOUS).catch(() => undefined);
            return;
        }

        if (
            existing.epoch === epoch &&
            existing.senderKey === senderKey &&
            existing.name === groupName &&
            sameMembers(existing.members, members || [upeerId]) &&
            normalizeAvatarForCompare(existing.avatar) === normalizeAvatarForCompare(avatar)
        ) {
            return;
        }

        updateGroupMembers(groupId, members || [upeerId]);
        updateGroupCrypto(groupId, { epoch, senderKey, senderKeyCreatedAt: Date.now() });
        if (existing.name !== groupName || avatar !== undefined) {
            updateGroupInfo(groupId, {
                name: groupName,
                ...(avatar !== undefined ? { avatar } : {})
            });
        }
    }

    if (isNewGroup) {
        const systemMessage = `__SYS__|${senderDisplayName} te añadió al grupo`;
        const inviteMessageId = randomUUID();
        const timestamp = Date.now();
        const savedInvite = await saveMessage(
            inviteMessageId,
            groupId,
            false,
            systemMessage,
            undefined,
            undefined,
            'delivered',
            actualAdmin,
            timestamp
        );

        if ((savedInvite as any)?.changes > 0) {
            win?.webContents.send('receive-group-message', {
                id: inviteMessageId,
                groupId,
                senderUpeerId: actualAdmin,
                senderName: senderDisplayName,
                isMine: false,
                message: systemMessage,
                isSystem: true,
                status: 'delivered',
                timestamp
            });
        }

        const notifWin = getMainWindow();
        if (notifWin && !notifWin.isFocused()) {
            showDesktopNotification({
                title: 'Nueva invitación de grupo',
                body: `${senderDisplayName} te añadió a ${groupName}`,
                onClick: () => {
                    const currentWin = getMainWindow();
                    if (!currentWin) return;
                    focusWindow(currentWin);
                    currentWin.webContents.send('focus-conversation', { groupId });
                },
            });
        }
    }

    win?.webContents.send('group-invite-received', {
        groupId,
        groupName,
        adminUpeerId: actualAdmin,
        members: members || [],
        ...(avatar ? { avatar } : {})
    });
}

export async function handleGroupUpdate(
    senderUpeerId: string,
    data: any,
    win: BrowserWindow | null
) {
    const { groupId, adminUpeerId } = data;
    if (!groupId || !data.payload || !data.nonce) return;

    if (typeof data.ephemeralPublicKey === 'string' && /^[0-9a-f]{64}$/i.test(data.ephemeralPublicKey)) {
        updateContactEphemeralPublicKey(senderUpeerId, data.ephemeralPublicKey);
    }

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
        } else if (
            typeof inner.avatar === 'string' &&
            inner.avatar.startsWith('data:image/') &&
            inner.avatar.length <= 2_000_000
        ) {
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
    } catch {
        security('GROUP_UPDATE: parse error', { senderUpeerId }, 'security');
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

export async function handleGroupLeave(
    upeerId: string,
    data: any,
    win: BrowserWindow | null
) {
    const { groupId, signature: leaveSig, ...leaveData } = data;
    if (!groupId) return;

    const contact = await getContactByUpeerId(upeerId);
    if (!contact?.publicKey) {
        warn('GROUP_LEAVE from unknown contact', { upeerId }, 'security');
        return;
    }

    if (leaveSig) {
        const { verify } = await import('../../security/identity.js');
        const { canonicalStringify } = await import('../utils.js');
        const isValid = verify(
            Buffer.from(canonicalStringify(leaveData)),
            Buffer.from(leaveSig, 'hex'),
            Buffer.from(contact.publicKey, 'hex')
        );
        if (!isValid) {
            security('Invalid GROUP_LEAVE signature', { upeerId, groupId }, 'security');
            return;
        }
    }

    const group = getGroupById(groupId);
    if (!group) return;

    const newMembers = group.members.filter((member) => member !== upeerId);
    updateGroupMembers(groupId, newMembers);

    try {
        const { rotateGroupAfterMemberRemoval } = await import('../messaging/groupControl.js');
        await rotateGroupAfterMemberRemoval(groupId, upeerId);
    } catch {
        warn('Failed to rotate group sender key after leave', { groupId, upeerId }, 'security');
    }

    const senderName = contact.name || upeerId;
    const systemMsgId = randomUUID();
    const systemText = `${senderName} dejó el grupo`;
    await saveMessage(systemMsgId, groupId, false, `__SYS__|${systemText}`, undefined, undefined, 'delivered');

    win?.webContents.send('group-updated', { groupId, members: newMembers });
    win?.webContents.send('receive-group-message', {
        id: systemMsgId,
        groupId,
        senderUpeerId: upeerId,
        senderName: null,
        isMine: false,
        message: systemText,
        status: 'delivered',
        isSystem: true,
    });
}