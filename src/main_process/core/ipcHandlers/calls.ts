import { ipcMain } from 'electron';
import { callManager } from '../../network/call/callManager.js';
import {
    sendCallAccept,
    sendCallEnd,
    sendCallMedia,
    sendCallMediaUpdate,
    sendCallOffer,
    sendCallReject,
} from '../../network/call/callSignaling.js';
import { isValidCallId, isValidMediaKind } from '../../network/call/validationCalls.js';

export function registerCallHandlers(): void {
    ipcMain.handle('start-call', async (event, { upeerId, kind }) => {
        if (typeof upeerId !== 'string' || !upeerId || upeerId.length > 128) {
            return { success: false, error: 'Invalid upeerId' };
        }
        if (!isValidMediaKind(kind)) {
            return { success: false, error: 'Invalid kind' };
        }
        try {
            const callId = await sendCallOffer(upeerId, kind);
            return { success: true, callId };
        } catch (err) {
            return { success: false, error: 'Contact unavailable' };
        }
    });

    ipcMain.handle('start-group-call', async (event, { members, kind }) => {
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
            const callId = await startGroupCall(members, kind);
            return { success: true, callId };
        } catch (err) {
            return { success: false, error: 'Group call unavailable' };
        }
    });

    ipcMain.handle('accept-call', (event, { callId }) => {
        if (!isValidCallId(callId)) {
            return { success: false, error: 'Invalid callId' };
        }
        const session = callManager.get(callId);
        if (!session) {
            return { success: false, error: 'Call not found' };
        }
        callManager.accept(callId);
        sendCallAccept(session.peerUpeerId, callId);
        return { success: true };
    });

    ipcMain.handle('reject-call', (event, { callId }) => {
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

    ipcMain.handle('send-call-media', (event, { callId, data }) => {
        if (!isValidCallId(callId)) {
            return { success: false, error: 'Invalid callId' };
        }
        if (typeof data !== 'string' || data.length === 0) {
            return { success: false, error: 'Invalid data' };
        }
        const session = callManager.get(callId);
        if (!session) {
            return { success: false, error: 'Call not found' };
        }
        sendCallMedia(session.peerUpeerId, callId, data);
        return { success: true };
    });

    ipcMain.handle('get-all-calls', () => {
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
                groupMembers: session.groupMembers,
            })),
        };
    });
}
