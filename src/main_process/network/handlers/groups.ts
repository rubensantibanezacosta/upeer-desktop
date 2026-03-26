import { randomUUID } from 'node:crypto';
import { BrowserWindow } from 'electron';
import { getMainWindow } from '../../core/windowManager.js';
import { showDesktopNotification } from '../../utils/desktopNotification.js';
import { focusWindow } from '../../utils/windowFocus.js';
import {
    getGroupById,
} from '../../storage/groups/operations.js';
import {
    getMessageById,
    saveMessage,
    updateMessageStatus,
} from '../../storage/messages/operations.js';
import { decryptGroupMessage } from '../groupState.js';
import { issueVouch, VouchType } from '../../security/reputation/vouches.js';
import { security, warn, info } from '../../security/secure-logger.js';
import { getMyUPeerId } from '../../security/identity.js';
export { handleGroupInvite, handleGroupLeave, handleGroupUpdate } from './groupControl.js';

// Patrón UUID reutilizado en varios handlers para validar msgId/fileId de red.
const _UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function handleGroupMessage(
    upeerId: string,
    contact: any,
    data: any,
    win: BrowserWindow | null,
    senderAddress?: string
) {
    const { id, groupId, content, nonce, replyTo, timestamp, epoch } = data;
    if (!groupId || !content || !nonce || typeof epoch !== 'number') return;
    const myId = getMyUPeerId();
    const isInternalSync = Boolean(data.isInternalSync && upeerId === myId);

    if (isInternalSync && id && _UUID_RE.test(String(id))) {
        const existing = await getMessageById(id);
        if (existing) return;
    }

    // BUG CA fix: si el grupo no existe localmente, rechazar el mensaje en lugar
    // de crear un grupo fantasma. Un peer arbitrario podía enviar GROUP_MSG con
    // un groupId desconocido y auto-crearse miembro, pasando el check de membresía
    // (que justo después añade al sender como único miembro). Sólo aceptar mensajes
    // de grupos en los que ya estamos — la invitación llega siempre via GROUP_INVITE.
    const existingGroup = getGroupById(groupId);
    if (!existingGroup) {
        security('GROUP_MSG para grupo desconocido — rechazado', { sender: upeerId, groupId }, 'security');
        return;
    }

    // Security check: Is the sender a member of the group?
    if (!existingGroup.members.includes(upeerId)) {
        security('Unauthorized group message!', { sender: upeerId, groupId }, 'security');
        issueVouch(upeerId, VouchType.MALICIOUS).catch((err) => {
            warn('Failed to issue malicious group message vouch', { upeerId, err: String(err) }, 'reputation');
        });
        return;
    }

    // BUG FN fix: data.id (campo opcional) se usaba directamente como msgId de BD
    // sin validar el formato UUID. Un peer puede enviar id=\"<SQL injection attempt>\"\n    // o un string con el UUID exacto de un mensaje existente para intentar colisionar\n    // (saveMessage usa onConflictDoNothing, pero el ID malformado queda en la DB).
    const msgId = (id && _UUID_RE.test(String(id))) ? id : randomUUID();

    if (existingGroup.epoch !== epoch || !existingGroup.senderKey) {
        security('GROUP_MSG con epoch desconocido', { sender: upeerId, groupId, epoch }, 'security');
        return;
    }

    const displayContent = decryptGroupMessage(nonce, content, existingGroup.senderKey);
    if (displayContent === null) {
        security('GROUP_MSG: decryption failed', { sender: upeerId, groupId, epoch }, 'security');
        return;
    }

    // BUG AB fix: igual que BUG P (ya corregido para CHAT), los mensajes de grupo\n    // entregados por múltiples custodios simultáneamente llegaban aquí dos veces\n    // con el mismo msgId. saveMessage usa onConflictDoNothing → changes=0 en la segunda\n    // llamada, pero la emit 'receive-group-message' se hacía igualmente → duplicados en UI.
    const savedGroup = await saveMessage(
        msgId,
        groupId,
        isInternalSync,
        displayContent,
        replyTo,
        undefined,
        isInternalSync ? 'read' : 'delivered',
        isInternalSync ? myId : upeerId,
        timestamp
    );
    const isNewGroupMsg = (savedGroup as any)?.changes > 0;

    // Notify sender that we received the message
    const ackAddress = senderAddress || contact?.address;
    if (!isInternalSync && ackAddress) {
        const { sendSecureUDPMessage } = await import('../server/transport.js');
        sendSecureUDPMessage(ackAddress, { type: 'GROUP_ACK', id: msgId, groupId });
    }

    if (isNewGroupMsg) {
        win?.webContents.send('receive-group-message', {
            id: msgId,
            groupId,
            senderUpeerId: isInternalSync ? myId : upeerId,
            senderName: contact.name,
            isMine: isInternalSync,
            message: displayContent,
            replyTo,
            status: isInternalSync ? 'read' : 'delivered',
            timestamp: typeof timestamp === 'number' ? timestamp : Date.now()
        });

        const notifWin = getMainWindow();
        if (!isInternalSync && notifWin && !notifWin.isFocused()) {
            const senderName = contact?.name || contact?.alias || upeerId.slice(0, 8);
            const groupName = existingGroup?.name || groupId.slice(0, 8);
            const body = displayContent.startsWith('\uD83D\uDD12')
                ? 'Nuevo mensaje cifrado'
                : displayContent.length > 80 ? displayContent.slice(0, 77) + '...' : displayContent;
            showDesktopNotification({
                title: `${senderName} → ${groupName}`,
                body,
                onClick: () => {
                    info('[Notif] Click en notificación de grupo', { groupId }, 'notifications');
                    const currentWin = getMainWindow();
                    if (!currentWin) return;
                    focusWindow(currentWin);
                    currentWin.webContents.send('focus-conversation', { groupId });
                },
            });
        }
    }
}

export async function handleGroupAck(upeerId: string, data: any, win: BrowserWindow | null) {
    const { id: msgId, groupId } = data;
    // Bug FE fix: misma protección UUID aplicada a los ACKs de grupo.
    if (!msgId || !_UUID_RE.test(String(msgId))) return;
    if (await updateMessageStatus(msgId, 'delivered')) {
        win?.webContents.send('group-message-delivered', { id: msgId, groupId, upeerId });
        win?.webContents.send('message-status-updated', { id: msgId, status: 'delivered' });
    }
}