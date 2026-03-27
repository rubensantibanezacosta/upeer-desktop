import { randomUUID } from 'node:crypto';
import { BrowserWindow } from 'electron';
import { deleteGroup, getGroupById, updateGroupMembers } from '../../storage/groups/operations.js';
import { deleteMessagesByChatId, saveMessage } from '../../storage/messages/operations.js';
import { getContactByUpeerId } from '../../storage/contacts/operations.js';
import { getMyPublicKeyHex, getMyUPeerId, verify } from '../../security/identity.js';
import { GroupControlPacket } from './groupControlShared.js';
import { security, warn } from '../../security/secure-logger.js';
import { canonicalStringify } from '../utils.js';

export async function handleGroupLeave(
    upeerId: string,
    data: GroupControlPacket,
    win: BrowserWindow | null
): Promise<void> {
    const { groupId, signature: leaveSig, ...leaveData } = data;
    if (!groupId) return;

    const myId = getMyUPeerId();
    const isInternalSync = Boolean(data.isInternalSync && upeerId === myId);
    const contact = await getContactByUpeerId(upeerId) || (upeerId === myId
        ? { upeerId: myId, publicKey: getMyPublicKeyHex(), name: 'Tú' }
        : null);
    if (!contact?.publicKey) {
        warn('GROUP_LEAVE from unknown contact', { upeerId }, 'security');
        return;
    }

    if (leaveSig) {
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

    if (isInternalSync) {
        deleteMessagesByChatId(groupId);
        deleteGroup(groupId);
        win?.webContents.send('group-updated', { groupId, members: [] });
        return;
    }

    if (!group.members.includes(upeerId)) return;

    const newMembers = group.members.filter((member) => member !== upeerId);
    updateGroupMembers(groupId, newMembers);

    try {
        const { rotateGroupAfterMemberRemoval } = await import('../messaging/groupControl.js');
        await rotateGroupAfterMemberRemoval(groupId, upeerId);
    } catch (err) {
        warn('Failed to rotate group sender key after leave', { groupId, upeerId, err: String(err) }, 'security');
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
