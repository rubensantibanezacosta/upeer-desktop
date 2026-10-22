import { randomUUID } from 'node:crypto';
import { getMySignedPreKeyBundle } from '../../security/identity.js';
import type { ChatDrResetPacket } from './chatMessageTypes.js';

export function createDrResetPacket(
    ratchetContext: ChatDrResetPacket['ratchetContext'] = 'direct',
): ChatDrResetPacket {
    return {
        type: 'DR_RESET',
        resetId: randomUUID(),
        signedPreKey: getMySignedPreKeyBundle(),
        ratchetContext,
    };
}
