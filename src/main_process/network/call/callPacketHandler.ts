import type { BrowserWindow } from 'electron';
import { warn } from '../../security/secure-logger.js';
import { callManager } from './callManager.js';
import {
    sendCallBusy,
    sendCallRing,
} from './callSignaling.js';
import type { CallMediaKind } from './callTypes.js';
import { validateCallPacket } from './validationCalls.js';

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
                sendCallRing(upeerId, session.callId);
                win?.webContents.send('call-incoming', {
                    callId: session.callId,
                    peerUpeerId: upeerId,
                    kind: session.kind,
                    isGroup: true,
                    groupMembers: session.groupMembers,
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
            win?.webContents.send('call-accepted', { callId, peerUpeerId: upeerId });
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
            callManager.end(callId, 'remote-end');
            win?.webContents.send('call-ended', { callId, peerUpeerId: upeerId, reason: 'remote-end' });
            break;
        case 'CALL_MEDIA':
            win?.webContents.send('call-media', {
                callId,
                peerUpeerId: upeerId,
                data: data.data,
                timestamp: data.timestamp,
            });
            break;
        case 'CALL_MEDIA_UPDATE':
            win?.webContents.send('call-media-update', {
                callId,
                peerUpeerId: upeerId,
                muted: data.muted === true,
                cameraEnabled: data.cameraEnabled === true,
            });
            break;
        case 'CALL_META':
            win?.webContents.send('call-meta', { callId, peerUpeerId: upeerId, meta: data.meta });
            break;
    }
}
