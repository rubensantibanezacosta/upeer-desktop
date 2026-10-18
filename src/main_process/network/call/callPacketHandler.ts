import type { BrowserWindow } from 'electron';
import { warn } from '../../security/secure-logger.js';
import { getMyUPeerId } from '../../security/identity.js';
import { callManager } from './callManager.js';
import {
    sendCallBusy,
    sendCallMediaTo,
    sendCallMeta,
    sendCallRing,
    recomputeRelay,
} from './callSignaling.js';
import type { CallMediaKind } from './callTypes.js';
import { validateCallPacket } from './validationCalls.js';
import { getGroupById } from '../../storage/groups/operations.js';
import { callFanoutPolicy } from './callFanoutPolicy.js';
import { sendCallRendererEvent } from './callRendererEvents.js';

export function handleCallPacket(
    upeerId: string,
    data: Record<string, unknown>,
    win: BrowserWindow | null,
): void {
    const type = typeof data.type === 'string' ? data.type : '';
    const validation = validateCallPacket(type, data);
    if (!validation.valid) {
        warn('Invalid CALL packet dropped', { upeerId, type, reason: validation.reason }, 'call');
        return;
    }

    const callId = data.callId as string;
    const kind = (data.kind ?? 'audio') as CallMediaKind;

    switch (type) {
        case 'CALL_OFFER': {
            if (callManager.hasActiveWith(upeerId)) {
                sendCallBusy(upeerId, callId);
                break;
            }
            const rawMembers = Array.isArray(data.groupMembers)
                ? data.groupMembers.filter((value): value is string => typeof value === 'string' && value.length > 0)
                : [];
            const groupMembers = rawMembers.filter((member) => member !== upeerId);
            const isGroupOffer = groupMembers.length > 0;
            if (isGroupOffer) {
                const session = callManager.createGroupIncoming(upeerId, kind, callId, groupMembers);
                const offeredGroupId = typeof data.groupId === 'string' && data.groupId.startsWith('grp-') ? data.groupId : undefined;
                const group = offeredGroupId ? getGroupById(offeredGroupId) : undefined;
                session.groupId = group?.members.includes(upeerId) ? offeredGroupId : undefined;
                win?.webContents.send('call-incoming', {
                    callId: session.callId,
                    peerUpeerId: upeerId,
                    kind: session.kind,
                    isGroup: true,
                    groupMembers: session.groupMembers,
                    groupId: session.groupId,
                });
            } else {
                const session = callManager.create(upeerId, kind, 'incoming', callId);
                sendCallRing(upeerId, session.callId);
                win?.webContents.send('call-incoming', {
                    callId: session.callId,
                    peerUpeerId: upeerId,
                    kind: session.kind,
                    isGroup: false,
                });
            }
            break;
        }
        case 'CALL_RING':
            win?.webContents.send('call-ring', { callId, peerUpeerId: upeerId });
            break;
        case 'CALL_ACCEPT': {
            callManager.accept(callId);
            callManager.connect(callId);
            sendCallRendererEvent('call-accepted', { callId, peerUpeerId: upeerId, connectedAt: callManager.get(callId)?.connectedAt });
            break;
        }
        case 'CALL_REJECT':
            callManager.end(callId, 'rejected');
            win?.webContents.send('call-ended', { callId, peerUpeerId: upeerId, reason: 'rejected' });
            break;
        case 'CALL_BUSY':
            callManager.end(callId, 'busy');
            win?.webContents.send('call-ended', { callId, peerUpeerId: upeerId, reason: 'busy' });
            break;
        case 'CALL_CANCEL':
            callManager.end(callId, 'canceled');
            win?.webContents.send('call-ended', { callId, peerUpeerId: upeerId, reason: 'canceled' });
            break;
        case 'CALL_END':
            callFanoutPolicy.clearSpeaker(callId, upeerId);
            callManager.end(callId, 'remote-end');
            win?.webContents.send('call-ended', { callId, peerUpeerId: upeerId, reason: 'remote-end' });
            break;
        case 'CALL_MEDIA': {
            win?.webContents.send('call-media', {
                callId,
                peerUpeerId: typeof data.senderUpeerId === 'string' ? data.senderUpeerId : upeerId,
                senderUpeerId: typeof data.senderUpeerId === 'string' ? data.senderUpeerId : undefined,
                data: new Uint8Array(data.data as Uint8Array),
                timestamp: data.timestamp,
            });
            // Si este nodo es el relay, reenvía la media al resto de miembros.
            const session = callManager.get(callId);
            const myId = getMyUPeerId();
            if (session?.isGroup && session.relayUpeerId === myId && callFanoutPolicy.shouldForwardVideo(callId, upeerId, data.data as Uint8Array)) {
                for (const member of session.groupMembers) {
                    if (member !== upeerId && member !== myId) {
                        sendCallMediaTo(member, callId, data.data as Uint8Array, upeerId);
                    }
                }
            }
            break;
        }
        case 'CALL_MEDIA_UPDATE':
            win?.webContents.send('call-media-update', {
                callId,
                peerUpeerId: upeerId,
                muted: data.muted === true,
                cameraEnabled: data.cameraEnabled === true,
            });
            break;
        case 'CALL_SDP':
            win?.webContents.send('call-sdp', {
                callId,
                peerUpeerId: upeerId,
                sdp: data.sdp,
            });
            break;
        case 'CALL_ICE':
            win?.webContents.send('call-ice', {
                callId,
                peerUpeerId: upeerId,
                candidate: data.candidate,
            });
            break;
        case 'CALL_META': {
            const meta = data.meta as Record<string, unknown> | undefined;
            if (meta && meta.type === 'relay' && typeof meta.relay === 'string') {
                callManager.setRelayUpeer(callId, meta.relay);
            }
            if (meta?.type === 'speaker') {
                handleSpeakerMeta(callId, upeerId, meta);
                break;
            }
            if (meta?.type === 'quality-probe' || meta?.type === 'quality-probe-ack') {
                const session = callManager.get(callId);
                const target = typeof meta.target === 'string' ? meta.target : '';
                const sentAt = meta.sentAt;
                const origin = typeof meta.origin === 'string' ? meta.origin : upeerId;
                if (!session || !target || typeof sentAt !== 'number' || !Number.isSafeInteger(sentAt) || sentAt > Date.now() || Date.now() - sentAt > 15_000) break;
                const myId = getMyUPeerId();
                if (session.isGroup && target !== myId && target !== session.relayUpeerId && !session.groupMembers.includes(target)) break;
                if (!session.isGroup && target !== myId && target !== session.peerUpeerId) break;
                if (meta.type === 'quality-probe') {
                    if (target === myId) {
                        win?.webContents.send('call-meta', { callId, peerUpeerId: upeerId, meta: { type: 'quality-probe', target: myId, origin, sentAt } });
                    } else if (session.isGroup && session.relayUpeerId === myId && session.groupMembers.includes(target)) {
                        sendCallMeta(target, callId, meta);
                    }
                } else {
                    if (target === myId) win?.webContents.send('call-meta', { callId, peerUpeerId: upeerId, meta });
                    else if (session.isGroup && session.relayUpeerId === myId && session.groupMembers.includes(target)) sendCallMeta(target, callId, meta);
                }
                break;
            }
            if (meta?.type === 'quality-feedback') {
                const session = callManager.get(callId);
                const target = typeof meta.target === 'string' ? meta.target : '';
                const source = typeof meta.source === 'string' ? meta.source : upeerId;
                if (!session || !target || (!session.groupMembers.includes(upeerId) && upeerId !== session.peerUpeerId)) break;
                if (session?.isGroup && session.relayUpeerId === getMyUPeerId()) {
                    if (target === getMyUPeerId()) win?.webContents.send('call-meta', { callId, peerUpeerId: source, meta });
                    else if (session.groupMembers.includes(target)) sendCallMeta(target, callId, meta);
                } else if (!session.isGroup && target === getMyUPeerId()) {
                    win?.webContents.send('call-meta', { callId, peerUpeerId: source, meta });
                }
                break;
            }
            win?.webContents.send('call-meta', { callId, peerUpeerId: upeerId, meta: data.meta });
            break;
        }
        case 'CALL_JOIN': {
            const rawMembers = Array.isArray(data.groupMembers)
                ? data.groupMembers.filter((value): value is string => typeof value === 'string' && value.length > 0)
                : [];
            callManager.joinGroup(callId, upeerId);
            const session = callManager.get(callId);
            const members = session?.groupMembers ?? rawMembers;
            // Notificar a los participantes de la llamada la incorporación del nuevo miembro.
            for (const member of members) {
                if (member !== upeerId) {
                    sendCallMeta(member, callId, { type: 'member-joined', member: upeerId, connected: callManager.getConnectedMembers(callId) });
                }
            }
            win?.webContents.send('call-member-joined', { callId, peerUpeerId: upeerId, connected: callManager.getConnectedMembers(callId) });
            // Recalcular el relay (elección/failover) y notificarlo al resto.
            void recomputeRelay(callId).then((relay) => {
                if (!relay) {
                    return;
                }
                const my = getMyUPeerId();
                for (const member of (callManager.get(callId)?.groupMembers ?? [])) {
                    if (member !== my) {
                        sendCallMeta(member, callId, { type: 'relay', relay });
                    }
                }
            });
            break;
        }
        case 'CALL_LEAVE': {
            callFanoutPolicy.clearSpeaker(callId, upeerId);
            callManager.leaveGroup(callId, upeerId);
            const session = callManager.get(callId);
            const members = session?.groupMembers ?? [];
            for (const member of members) {
                if (member !== upeerId) {
                    sendCallMeta(member, callId, { type: 'member-left', member: upeerId, connected: callManager.getConnectedMembers(callId) });
                }
            }
            win?.webContents.send('call-member-left', { callId, peerUpeerId: upeerId, connected: callManager.getConnectedMembers(callId) });
            // Recalcular el relay tras la salida (failover si era el relay).
            void recomputeRelay(callId).then((relay) => {
                if (!relay) {
                    return;
                }
                const my = getMyUPeerId();
                for (const member of (callManager.get(callId)?.groupMembers ?? [])) {
                    if (member !== my) {
                        sendCallMeta(member, callId, { type: 'relay', relay });
                    }
                }
            });
            break;
        }
    }
}

function handleSpeakerMeta(callId: string, speakerId: string, meta: Record<string, unknown>): void {
    if (typeof meta.active !== 'boolean' || callManager.get(callId)?.relayUpeerId !== getMyUPeerId()) return;
    callFanoutPolicy.setSpeakerActive(callId, speakerId, meta.active);
}
