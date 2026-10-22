import { ipcMain, type WebContents } from 'electron';
import { callManager } from '../../network/call/callManager.js';
import { callFanoutPolicy } from '../../network/call/callFanoutPolicy.js';
import { getMyUPeerId } from '../../security/identity.js';
import {
    sendCallAccept,
    sendCallEnd,
    sendCallIce,
    sendCallJoin,
    sendCallLeave,
    sendCallMedia,
    sendCallMediaUpdate,
    sendCallMeta,
    sendCallOffer,
    sendCallReject,
    sendCallSdp,
    recomputeRelay,
} from '../../network/call/callSignaling.js';
import { isValidCallId, isValidMediaKind } from '../../network/call/validationCalls.js';
import { saveMessage } from '../../storage/messages/operations.js';
import { sendGroupCallEvent } from '../../network/messaging/groups.js';
import { getContactByUpeerId, isContactBlocked } from '../../storage/contacts/operations.js';
import { sendChatMessage } from '../../network/messaging/chatSend.js';
import { shouldSendCallMedia } from './callMediaFanout.js';
import { handleCallMediaSpeakerState } from './callMediaSpeaker.js';
import { sendCallRendererEvent } from '../../network/call/callRendererEvents.js';

let rendererSender: WebContents | null = null;

function captureRenderer(event?: { sender?: WebContents } | null): void {
    if (event?.sender) {
        rendererSender = event.sender;
    }
}

export function registerCallHandlers(): void {
    callManager.onStateChange((change) => {
        if (change.phase === 'ended') {
            callFanoutPolicy.removeCall(change.callId);
            const session = callManager.get(change.callId);
            const isMissedCall = change.direction === 'outgoing'
                && change.connectedAt === undefined
                && ['no-answer', 'error', 'rejected', 'busy'].includes(change.endReason ?? '');
            const isIncomingRejectedCall = change.direction === 'incoming' && change.endReason === 'rejected';
            if (session && !session.eventWritten && (change.connectedAt !== undefined || isMissedCall || isIncomingRejectedCall)) {
                session.eventWritten = true;
                const label = change.kind === 'video' ? 'Videollamada' : 'Llamada de voz';
                const displayOutcome = isIncomingRejectedCall ? `${label} rechazada` : `${label} perdida`;
                const duration = change.connectedAt === undefined
                    ? null
                    : formatCallDuration(Math.max(0, Math.floor(((change.endedAt ?? Date.now()) - change.connectedAt) / 1000)));
                const displayMessage = duration === null
                    ? displayOutcome
                    : `${label} · ${duration} · ${change.connectedAt}`;
                const message = `__SYS__|${displayMessage}`;
                const eventId = callEventMessageId(change.callId);
                if (change.isGroup) {
                    const groupId = change.groupId;
                    if (groupId) {
                        void sendGroupCallEvent(groupId, message, change.endedAt ?? Date.now(), eventId).catch((cause: unknown) => {
                            console.error(`Failed to save call event in group ${groupId}`, cause);
                        });
                    }
                } else {
                    const timestamp = change.endedAt ?? Date.now();
                    void saveMessage(eventId, change.peerUpeerId, true, message, undefined, undefined, 'sent', getMyUPeerId(), timestamp)
                        .then((result) => {
                            if ((result?.changes ?? 0) === 0) return;
                            rendererSender?.send('receive-p2p-message', {
                                id: eventId,
                                upeerId: change.peerUpeerId,
                                isMine: true,
                                message: displayMessage,
                                status: 'sent',
                                timestamp,
                                isSystem: true,
                            });
                            const shouldNotifyPeer = (change.direction === 'outgoing' && change.endReason !== 'rejected')
                                || (change.direction === 'incoming' && change.connectedAt !== undefined);
                            const peer = shouldNotifyPeer ? getContactByUpeerId(change.peerUpeerId) : undefined;
                            if (peer) void sendChatMessage(change.peerUpeerId, message, undefined, eventId);
                        })
                        .catch((cause: unknown) => console.error(`Failed to save call event with ${change.peerUpeerId}`, cause));
                }
            }
        }
        if (change.phase === 'ended' && (change.endReason === 'no-answer' || change.endReason === 'error')) {
            rendererSender?.send('call-ended', {
                callId: change.callId,
                peerUpeerId: change.peerUpeerId,
                reason: change.endReason,
            });
        }
    });

    ipcMain.handle('start-call', async (event, { upeerId, kind }) => {
        captureRenderer(event);
        if (typeof upeerId !== 'string' || !upeerId || upeerId.length > 128) {
            return { success: false, error: 'Invalid upeerId' };
        }
        if (!isValidMediaKind(kind)) {
            return { success: false, error: 'Invalid kind' };
        }
        if (isContactBlocked(upeerId)) {
            return { success: false, error: 'Contact unavailable' };
        }
        try {
            const callId = await sendCallOffer(upeerId, kind);
            return { success: true, callId };
        } catch (err) {
            return { success: false, error: 'Contact unavailable' };
        }
    });

    ipcMain.handle('start-group-call', async (event, { members, kind, groupId }) => {
        captureRenderer(event);
        if (!Array.isArray(members) || members.some((m) => typeof m !== 'string' || !m || m.length > 128)) {
            return { success: false, error: 'Invalid members' };
        }
        if (members.length < 1 || members.length > 50) {
            return { success: false, error: 'Invalid member count' };
        }
        if (!isValidMediaKind(kind)) {
            return { success: false, error: 'Invalid kind' };
        }
        try {
            const { startGroupCall } = await import('../../network/call/callSignaling.js');
            const safeGroupId = typeof groupId === 'string' && groupId.startsWith('grp-') ? groupId : undefined;
            const callId = await startGroupCall(members, kind, safeGroupId);
            // Elegir el relay inicial (por reputación) y notificarlo a los miembros.
            void recomputeRelay(callId).then((relay) => {
                if (!relay) {
                    return;
                }
                const myId = getMyUPeerId();
                for (const member of members) {
                    if (member !== myId) {
                        sendCallMeta(member, callId, { type: 'relay', relay });
                    }
                }
            });
            return { success: true, callId };
        } catch (err) {
            return { success: false, error: 'Group call unavailable' };
        }
    });

    ipcMain.handle('accept-call', (event, { callId }) => {
        captureRenderer(event);
        if (!isValidCallId(callId)) {
            return { success: false, error: 'Invalid callId' };
        }
        const session = callManager.get(callId);
        if (!session) {
            return { success: false, error: 'Call not found' };
        }
        callManager.accept(callId);
        callManager.connect(callId);
        sendCallAccept(session.peerUpeerId, callId);
        sendCallRendererEvent('call-accepted', { callId, peerUpeerId: session.peerUpeerId, connectedAt: session.connectedAt });
        return { success: true };
    });

    ipcMain.handle('reject-call', (event, { callId }) => {
        captureRenderer(event);
        if (!isValidCallId(callId)) {
            return { success: false, error: 'Invalid callId' };
        }
        const session = callManager.get(callId);
        if (session) {
            callManager.end(callId, 'rejected');
            sendCallReject(session.peerUpeerId, callId);
        }
        return { success: true };
    });

    ipcMain.handle('end-call', (event, { callId }) => {
        captureRenderer(event);
        if (!isValidCallId(callId)) {
            return { success: false, error: 'Invalid callId' };
        }
        const session = callManager.get(callId);
        if (session) {
            callManager.end(callId, 'local-hangup');
            sendCallEnd(session.peerUpeerId, callId);
        }
        return { success: true };
    });

    ipcMain.handle('call-toggle-media', (event, { callId, type }) => {
        captureRenderer(event);
        if (!isValidCallId(callId)) {
            return { success: false, error: 'Invalid callId' };
        }
        const session = callManager.get(callId);
        if (!session) {
            return { success: false, error: 'Call not found' };
        }
        if (type === 'mute') {
            callManager.toggleMute(callId);
        } else if (type === 'camera') {
            callManager.toggleCamera(callId);
        } else {
            return { success: false, error: 'Invalid media type' };
        }
        sendCallMediaUpdate(session.peerUpeerId, callId, {
            muted: session.muted,
            cameraEnabled: session.cameraEnabled,
        });
        return { success: true };
    });

    ipcMain.handle('call-devices', () => ({ success: true, devices: [] }));

    ipcMain.handle('call-params', (event, { callId }) => {
        if (!isValidCallId(callId)) {
            return { success: false, error: 'Invalid callId' };
        }
        const session = callManager.get(callId);
        if (!session) {
            return { success: false, error: 'Call not found' };
        }
        return {
            success: true,
            kind: session.kind,
            codecs: session.kind === 'video' ? ['opus', 'vp8'] : ['opus'],
        };
    });

    ipcMain.on('send-call-media', (event, { callId, data }) => {
        captureRenderer(event);
        if (!isValidCallId(callId)) {
            return;
        }
        if (!(data instanceof Uint8Array) || data.byteLength === 0) {
            return;
        }
        const session = callManager.get(callId);
        if (!session) {
            return;
        }
        if (!shouldSendCallMedia(callId, data)) return;
        sendCallMedia(session.peerUpeerId, callId, data);
    });

    ipcMain.on('send-call-meta', (event, payload: { callId: string; meta: Record<string, unknown> }) => {
        captureRenderer(event);
        if (!isValidCallId(payload?.callId) || !payload.meta || typeof payload.meta !== 'object') return;
        const session = callManager.get(payload.callId);
        if (!session) return;
        if (payload.meta.type === 'quality-feedback') {
            const { mediaKind, lossRatio, jitterMs, sendBitrate, target } = payload.meta;
            if (
                typeof target !== 'string' || target.length === 0 || target.length > 128
                || (session.isGroup && target !== getMyUPeerId() && target !== session.relayUpeerId && !session.groupMembers.includes(target) && target !== session.peerUpeerId)
                || !session.isGroup && target !== session.peerUpeerId
                || (mediaKind !== 'audio' && mediaKind !== 'video' && mediaKind !== 'screen')
                || typeof lossRatio !== 'number' || !Number.isFinite(lossRatio) || lossRatio < 0 || lossRatio > 1
                || typeof jitterMs !== 'number' || !Number.isFinite(jitterMs) || jitterMs < 0 || jitterMs > 60_000
                || typeof sendBitrate !== 'number' || !Number.isFinite(sendBitrate) || sendBitrate < 0 || sendBitrate > 100_000_000
            ) return;
            const senderId = getMyUPeerId();
            if (payload.meta.type === 'quality-feedback') {
                const routedMeta = { ...payload.meta, source: senderId };
                if (session.isGroup && session.relayUpeerId) {
                    if (session.relayUpeerId === senderId) {
                        if (target === senderId) event.sender.send('call-meta', { callId: payload.callId, peerUpeerId: senderId, meta: routedMeta });
                        else sendCallMeta(target, payload.callId, routedMeta);
                    } else sendCallMeta(session.relayUpeerId, payload.callId, routedMeta);
                } else sendCallMeta(target, payload.callId, routedMeta);
            } else sendCallMeta(target, payload.callId, payload.meta);
            return;
        }
        if (payload.meta.type === 'quality-probe' || payload.meta.type === 'quality-probe-ack') {
            const { target, sentAt } = payload.meta;
            if (typeof target !== 'string' || target.length === 0 || target.length > 128 || typeof sentAt !== 'number' || !Number.isSafeInteger(sentAt) || sentAt > Date.now() || Date.now() - sentAt > 15_000) return;
            const myId = getMyUPeerId();
            if (session.isGroup && target !== myId && target !== session.relayUpeerId && !session.groupMembers.includes(target)) return;
            if (!session.isGroup && target !== myId && target !== session.peerUpeerId) return;
            if (payload.meta.type === 'quality-probe') {
                const routedMeta = { ...payload.meta, origin: myId };
                const nextHop = session.isGroup && session.relayUpeerId && session.relayUpeerId !== myId ? session.relayUpeerId : target;
                if (session.isGroup && session.relayUpeerId === myId) {
                    if (target === myId) event.sender.send('call-meta', { callId: payload.callId, peerUpeerId: myId, meta: routedMeta });
                    else if (session.groupMembers.includes(target)) sendCallMeta(target, payload.callId, routedMeta);
                } else if (nextHop === myId) {
                    event.sender.send('call-meta', { callId: payload.callId, peerUpeerId: myId, meta: routedMeta });
                } else sendCallMeta(nextHop, payload.callId, routedMeta);
            } else {
                const routedMeta = { ...payload.meta, origin: target };
                if (session.relayUpeerId === myId) {
                    if (target === myId) event.sender.send('call-meta', { callId: payload.callId, peerUpeerId: myId, meta: routedMeta });
                    else if (session.groupMembers.includes(target)) sendCallMeta(target, payload.callId, routedMeta);
                } else if (session.isGroup && session.relayUpeerId && session.relayUpeerId !== myId) sendCallMeta(session.relayUpeerId, payload.callId, routedMeta);
                else if (target === session.peerUpeerId) sendCallMeta(target, payload.callId, routedMeta);
            }
            return;
        }
        if (payload.meta.type !== 'screen-share' || typeof payload.meta.active !== 'boolean') return;
        const members = session.isGroup ? session.groupMembers : [session.peerUpeerId];
        const myId = getMyUPeerId();
        for (const member of members) {
            if (member !== myId) sendCallMeta(member, payload.callId, { type: 'screen-share', active: payload.meta.active });
        }
    });

    ipcMain.on('send-call-speaker-state', (event, payload) => handleCallMediaSpeakerState(event, payload, captureRenderer));

    ipcMain.handle('send-call-sdp', (event, { callId, peerUpeerId, sdp }) => {
        captureRenderer(event);
        if (!isValidCallId(callId)) {
            return { success: false, error: 'Invalid callId' };
        }
        if (!sdp || typeof sdp !== 'object') {
            return { success: false, error: 'Invalid sdp' };
        }
        const session = callManager.get(callId);
        if (!session) {
            return { success: false, error: 'Call not found' };
        }
        const target = (typeof peerUpeerId === 'string' && peerUpeerId) ? peerUpeerId : session.peerUpeerId;
        sendCallSdp(target, callId, sdp);
        return { success: true };
    });

    ipcMain.handle('send-call-ice', (event, { callId, peerUpeerId, candidate }) => {
        captureRenderer(event);
        if (!isValidCallId(callId)) {
            return { success: false, error: 'Invalid callId' };
        }
        if (!candidate || typeof candidate !== 'object') {
            return { success: false, error: 'Invalid candidate' };
        }
        const session = callManager.get(callId);
        if (!session) {
            return { success: false, error: 'Call not found' };
        }
        const target = (typeof peerUpeerId === 'string' && peerUpeerId) ? peerUpeerId : session.peerUpeerId;
        sendCallIce(target, callId, candidate);
        return { success: true };
    });

    ipcMain.handle('get-all-calls', (event) => {
        captureRenderer(event);
        const sessions = callManager.getAll();
        return {
            success: true,
            calls: sessions.map((session) => ({
                callId: session.callId,
                peerUpeerId: session.peerUpeerId,
                phase: session.phase,
                kind: session.kind,
                muted: session.muted,
                cameraEnabled: session.cameraEnabled,
                isGroup: session.isGroup,
                groupId: session.groupId,
                groupMembers: session.groupMembers,
                connectedAt: session.connectedAt,
                relayUpeerId: session.relayUpeerId,
            })),
        };
    });

    ipcMain.handle('join-group-call', (event, { callId }) => {
        if (!isValidCallId(callId)) {
            return { success: false, error: 'Invalid callId' };
        }
        const session = callManager.get(callId);
        if (!session) {
            return { success: false, error: 'Call not found' };
        }
        const myId = getMyUPeerId();
        callManager.joinGroup(callId, myId);
        sendCallJoin(callId, session.peerUpeerId, session.kind, session.groupMembers);
        return { success: true, connected: callManager.getConnectedMembers(callId) };
    });

    ipcMain.handle('leave-group-call', (event, { callId }) => {
        if (!isValidCallId(callId)) {
            return { success: false, error: 'Invalid callId' };
        }
        const session = callManager.get(callId);
        if (session) {
            const myId = getMyUPeerId();
            callManager.leaveGroup(callId, myId);
            sendCallLeave(callId, session.peerUpeerId);
        }
        return { success: true };
    });

    ipcMain.handle('call-group-members', (event, { callId }) => {
        if (!isValidCallId(callId)) {
            return { success: false, error: 'Invalid callId' };
        }
        return {
            success: true,
            connected: callManager.getConnectedMembers(callId),
            members: callManager.get(callId)?.groupMembers ?? [],
        };
    });
}

function formatCallDuration(durationSeconds: number): string {
    return `${String(Math.floor(durationSeconds / 60)).padStart(2, '0')}:${String(durationSeconds % 60).padStart(2, '0')}`;
}

function callEventMessageId(callId: string): string {
    const normalized = callId.replace(/[^a-f0-9]/gi, '').padEnd(32, '0').slice(0, 32);
    return `${normalized.slice(0, 8)}-${normalized.slice(8, 12)}-4${normalized.slice(13, 16)}-a${normalized.slice(17, 20)}-${normalized.slice(20, 32)}`;
}
