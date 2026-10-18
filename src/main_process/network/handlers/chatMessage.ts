import { BrowserWindow } from 'electron';
import { ratchetSessionQueueKey, withRatchetSessionLock } from '../../security/ratchetSessionQueue.js';
import { receiveChatMessage } from './chatMessageReceive.js';
import type { ChatAckPacket, ChatContactRecord, ChatDrResetPacket, ChatIncomingPayload } from './chatMessageTypes.js';

type SendResponse = (ip: string, data: ChatAckPacket | ChatDrResetPacket) => void;

export async function handleChatMessage(
    upeerId: string,
    contact: ChatContactRecord,
    data: ChatIncomingPayload,
    win: BrowserWindow | null,
    signature: string,
    fromAddress: string,
    sendResponse: SendResponse,
): Promise<void> {
    return withRatchetSessionLock(ratchetSessionQueueKey(upeerId), () => receiveChatMessage(
        upeerId,
        contact,
        data,
        win,
        signature,
        fromAddress,
        sendResponse,
    ));
}