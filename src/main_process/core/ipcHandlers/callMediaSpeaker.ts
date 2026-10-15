import type { IpcMainEvent } from 'electron';
import { callManager } from '../../network/call/callManager.js';
import { callFanoutPolicy } from '../../network/call/callFanoutPolicy.js';
import { getMyUPeerId } from '../../security/identity.js';
import { isValidCallId } from '../../network/call/validationCalls.js';
import { sendCallMeta } from '../../network/call/callSignaling.js';

export function handleCallMediaSpeakerState(event: IpcMainEvent, payload: { callId: string; active: boolean }, captureRenderer: (event: IpcMainEvent) => void): void {
    captureRenderer(event);
    const { callId, active } = payload;
    if (!isValidCallId(callId) || typeof active !== 'boolean') return;
    const session = callManager.get(callId);
    if (!session?.isGroup) return;
    const ownId = getMyUPeerId();
    if (session.relayUpeerId === ownId) {
        callFanoutPolicy.setSpeakerActive(callId, ownId, active);
        return;
    }
    if (session.relayUpeerId) sendCallMeta(session.relayUpeerId, callId, { type: 'speaker', active });
}