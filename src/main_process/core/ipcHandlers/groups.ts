import { ipcMain } from 'electron';
import { getGroups, updateGroupAvatar } from '../../storage/db.js';
import {
  createGroup,
  sendGroupMessage,
  inviteToGroup,
  updateGroup,
  leaveGroup
} from '../../network/server/index.js';

/**
 * Registra los manejadores IPC relacionados con grupos
 */
export function registerGroupHandlers(): void {
  ipcMain.handle('get-groups', () => getGroups());

  ipcMain.handle('create-group', async (event, { name, memberUpeerIds, avatar }) => {
    // BUG DX fix: limitar longitud de nombre y avatar de grupo
    const safeName = typeof name === 'string' ? name.slice(0, 100) : '';
    if (typeof avatar === 'string' && avatar.length > 2_000_000) {
      return { success: false, error: 'Avatar demasiado grande (máx 2 MB)' };
    }
    const groupId = await createGroup(safeName, memberUpeerIds, avatar);
    return { success: true, groupId };
  });

  ipcMain.handle('update-group-avatar', (event, { groupId, avatar }) => {
    // BUG DX fix: limitar avatar de grupo
    if (typeof avatar === 'string' && avatar.length > 2_000_000) return { success: false, error: 'Avatar demasiado grande (máx 2 MB)' };
    return updateGroupAvatar(groupId, avatar);
  });

  ipcMain.handle('send-group-message', async (event, { groupId, message, replyTo }) => {
    const msgId = await sendGroupMessage(groupId, message, replyTo);
    return msgId;
  });

  ipcMain.handle('invite-to-group', async (event, { groupId, upeerId }) => {
    await inviteToGroup(groupId, upeerId);
    return { success: true };
  });

  ipcMain.handle('update-group', async (event, { groupId, name, avatar }) => {
    // BUG DX fix: limitar longitud de campos de grupo
    const safeName = typeof name === 'string' ? name.slice(0, 100) : name;
    if (typeof avatar === 'string' && avatar.length > 2_000_000) {
      return { success: false, error: 'Avatar demasiado grande (máx 2 MB)' };
    }
    await updateGroup(groupId, { name: safeName, avatar });
    return { success: true };
  });

  ipcMain.handle('leave-group', async (event, { groupId }) => {
    await leaveGroup(groupId);
    return { success: true };
  });
}