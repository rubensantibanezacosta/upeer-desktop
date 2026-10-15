import { decodeMediaFrame } from '../../../features/call/mediaChunker.js';
import { callManager } from '../../network/call/callManager.js';
import { callFanoutPolicy } from '../../network/call/callFanoutPolicy.js';
import { getMyUPeerId } from '../../security/identity.js';

export function shouldSendCallMedia(callId: string, data: Uint8Array): boolean {
    const session = callManager.get(callId);
    if (!session?.isGroup || !session.relayUpeerId || session.relayUpeerId !== getMyUPeerId()) return true;
    const frame = decodeMediaFrame(data);
    if (!frame || frame.kind !== 'video') return true;
    return callFanoutPolicy.shouldForwardVideo(callId, getMyUPeerId(), data);
}