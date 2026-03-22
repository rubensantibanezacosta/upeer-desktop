import { randomUUID } from 'node:crypto';
import { BrowserWindow } from 'electron';
import { getMainWindow } from '../../core/windowManager.js';
import { showDesktopNotification } from '../../utils/desktopNotification.js';
import { focusWindow } from '../../utils/windowFocus.js';
import {
    getGroupById,
    saveGroup,
    updateGroupInfo,
    updateGroupMembers,
} from '../../storage/groups/operations.js';
import {
    saveMessage,
    updateMessageStatus,
} from '../../storage/messages/operations.js';
import { getContactByUpeerId } from '../../storage/contacts/operations.js';
import { decrypt } from '../../security/identity.js';
import { issueVouch, VouchType } from '../../security/reputation/vouches.js';
import { security, warn, info } from '../../security/secure-logger.js';

// Patrón UUID reutilizado en varios handlers para validar msgId/fileId de red.
const _UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function handleGroupMessage(
    upeerId: string,
    contact: any,
    data: any,
    win: BrowserWindow | null,
    senderAddress?: string
) {
    const { id, groupId, content, nonce, ephemeralPublicKey, useRecipientEphemeral, replyTo } = data;
    if (!groupId || !content) return;

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
        issueVouch(upeerId, VouchType.MALICIOUS).catch(() => { });
        return;
    }

    // BUG FN fix: data.id (campo opcional) se usaba directamente como msgId de BD
    // sin validar el formato UUID. Un peer puede enviar id=\"<SQL injection attempt>\"\n    // o un string con el UUID exacto de un mensaje existente para intentar colisionar\n    // (saveMessage usa onConflictDoNothing, pero el ID malformado queda en la DB).
    const msgId = (id && _UUID_RE.test(String(id))) ? id : randomUUID();

    let displayContent = content;
    if (nonce) {
        try {
            const senderKeyHex = useRecipientEphemeral ? ephemeralPublicKey : contact.publicKey;
            if (senderKeyHex) {
                const decrypted = decrypt(
                    Buffer.from(content, 'hex'),
                    Buffer.from(nonce, 'hex'),
                    Buffer.from(senderKeyHex, 'hex')
                );
                if (decrypted) displayContent = decrypted.toString('utf-8');
                else displayContent = '🔒 [Error de descifrado]';
            }
        } catch (err) {
            displayContent = '🔒 [Error crítico de seguridad]';
        }
    }

    // BUG AB fix: igual que BUG P (ya corregido para CHAT), los mensajes de grupo\n    // entregados por múltiples custodios simultáneamente llegaban aquí dos veces\n    // con el mismo msgId. saveMessage usa onConflictDoNothing → changes=0 en la segunda\n    // llamada, pero la emit 'receive-group-message' se hacía igualmente → duplicados en UI.
    const savedGroup = await saveMessage(msgId, groupId, false, displayContent, replyTo, undefined, 'delivered', upeerId);
    const isNewGroupMsg = (savedGroup as any)?.changes > 0;

    // Notify sender that we received the message
    const ackAddress = senderAddress || contact?.address;
    if (ackAddress) {
        const { sendSecureUDPMessage } = await import('../server/transport.js');
        sendSecureUDPMessage(ackAddress, { type: 'GROUP_ACK', id: msgId, groupId });
    }

    if (isNewGroupMsg) {
        win?.webContents.send('receive-group-message', {
            id: msgId,
            groupId,
            senderUpeerId: upeerId,
            senderName: contact.name,
            isMine: false,
            message: displayContent,
            replyTo,
            status: 'delivered'
        });

        const notifWin = getMainWindow();
        if (notifWin && !notifWin.isFocused()) {
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

export async function handleGroupInvite(
    upeerId: string,
    data: any,
    win: BrowserWindow | null
) {
    const { groupId, adminUpeerId } = data;
    if (!groupId || !data.payload || !data.nonce) return;

    // --- Decrypt E2E payload ---
    let groupName: string;
    let members: string[];
    let avatar: string | undefined;

    try {
        const senderKey = (await getContactByUpeerId(upeerId))?.publicKey;
        if (!senderKey) {
            security('GROUP_INVITE: no sender key to decrypt', { upeerId }, 'security');
            return;
        }
        const decrypted = decrypt(
            Buffer.from(data.payload, 'hex'),
            Buffer.from(data.nonce, 'hex'),
            Buffer.from(senderKey, 'hex')
        );
        if (!decrypted) {
            security('GROUP_INVITE: decryption failed', { upeerId, groupId }, 'security');
            return;
        }
        const inner = JSON.parse(decrypted.toString('utf-8'));
        groupName = inner.groupName;
        members = inner.members;
        // Bug FG fix: validar avatar igual que en HANDSHAKE/PING: data URI válida y ≤ 2 MB.
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

    if (!groupName) return;

    // BUG DE fix: groupName del payload descifrado no tenía cap de longitud.
    // Un admin puede enviar hasta ~250KB de groupName (dentro del límite de 500KB
    // del outer payload) → almacenado en la tabla groups sin restricción.
    if (typeof groupName !== 'string' || groupName.length > 100) {
        security('GROUP_INVITE: groupName inválido o demasiado largo', { upeerId }, 'security');
        return;
    }
    // BUG DF fix: members sin tope de tamaño. Con payload 500KB se pueden embeber
    // hasta ~7800 upeerIds (32 chars c/u) → todos serializados en groups.members.
    if (!Array.isArray(members) || members.length > 500) {
        security('GROUP_INVITE: lista de members inválida o demasiado grande', { upeerId }, 'security');
        return;
    }

    // Security check: sender must be the claimed admin
    const actualAdmin = adminUpeerId || upeerId;
    if (upeerId !== actualAdmin) {
        security('Identity mismatch in group invite!', { sender: upeerId, claimedAdmin: adminUpeerId }, 'security');
        issueVouch(upeerId, VouchType.MALICIOUS).catch(() => { });
        return;
    }

    const existing = getGroupById(groupId);
    if (!existing) {
        saveGroup(groupId, groupName, actualAdmin, members || [upeerId], 'active', avatar);
    } else {
        if (!existing.members.includes(upeerId)) {
            security('Group invite from non-member!', { sender: upeerId, groupId }, 'security');
            issueVouch(upeerId, VouchType.MALICIOUS).catch(() => { });
            return;
        }
    }

    win?.webContents.send('group-invite-received', {
        groupId,
        groupName,
        adminUpeerId: actualAdmin,
        members: members || []
    });
}

export async function handleGroupUpdate(
    senderUpeerId: string,
    data: any,
    win: BrowserWindow | null
) {
    const { groupId, adminUpeerId } = data;
    if (!groupId) return;

    const group = getGroupById(groupId);
    if (!group) return;

    // Solo el admin puede emitir cambios
    const claimedAdmin = adminUpeerId || senderUpeerId;
    if (group.adminUpeerId !== claimedAdmin || senderUpeerId !== claimedAdmin) {
        security('GROUP_UPDATE de no-admin ignorado', { sender: senderUpeerId, groupId }, 'security');
        return;
    }

    // --- Decrypt E2E payload ---
    if (!data.payload || !data.nonce) return;
    const fields: { name?: string; avatar?: string | null } = {};

    try {
        const senderKey = (await getContactByUpeerId(senderUpeerId))?.publicKey;
        if (!senderKey) return;
        const decrypted = decrypt(
            Buffer.from(data.payload, 'hex'),
            Buffer.from(data.nonce, 'hex'),
            Buffer.from(senderKey, 'hex')
        );
        if (!decrypted) {
            security('GROUP_UPDATE: decryption failed', { senderUpeerId, groupId }, 'security');
            return;
        }
        const inner = JSON.parse(decrypted.toString('utf-8'));
        // BUG DG fix: groupName sin cap de longitud → hasta 250KB almacenado en groups.name.
        if (inner.groupName && typeof inner.groupName === 'string' && inner.groupName.length <= 100) fields.name = inner.groupName;
        // Bug FH fix: avatar del payload descifrado sin validación de tipo/tamaño.
        // null = quitar avatar; string con data URI válida ≤ 2MB = actualizar.
        if (inner.avatar === null) {
            fields.avatar = null;
        } else if (
            typeof inner.avatar === 'string' &&
            inner.avatar.startsWith('data:image/') &&
            inner.avatar.length <= 2_000_000
        ) {
            fields.avatar = inner.avatar;
        }
    } catch {
        security('GROUP_UPDATE: parse error', { senderUpeerId }, 'security');
        return;
    }

    if (Object.keys(fields).length === 0) return;

    updateGroupInfo(groupId, fields);

    win?.webContents.send('group-updated', {
        groupId,
        ...(fields.name !== undefined ? { name: fields.name } : {}),
        ...(fields.avatar !== undefined ? { avatar: fields.avatar } : {}),
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

    // BUG BZ fix: la firma exterior de handlePacket ya autenticó al remitente.
    // `leaveSig` solo está presente en el flujo de vault delivery.
    // Para entrega directa, confiar en la verificación exterior.
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

    // Remove the leaving member from the roster
    const newMembers = group.members.filter(m => m !== upeerId);
    updateGroupMembers(groupId, newMembers);

    // Save a system message \"X dejó el grupo\" (prefixed so it can be detected when loading from DB)
    const senderName = contact.name || upeerId;
    const systemMsgId = randomUUID();
    const systemText = `${senderName} dejó el grupo`;
    await saveMessage(systemMsgId, groupId, false, `__SYS__|${systemText}`, undefined, undefined, 'delivered');

    // Notify renderer: refresh members + show system message in chat
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