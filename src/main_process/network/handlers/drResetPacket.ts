import { randomUUID } from 'node:crypto';
import { getDeviceMessagingIdentity } from '../../security/deviceMessaging.js';
import { getMySignedPreKeyBundle } from '../../security/identity.js';
import type { ChatDrResetPacket } from './chatMessageTypes.js';

export type DrResetPacketOptions = {
    useDeviceIdentity?: boolean;
};

export function createDrResetPacket(
    ratchetContext: ChatDrResetPacket['ratchetContext'] = 'direct',
    options: DrResetPacketOptions = {},
): ChatDrResetPacket {
    const device = options.useDeviceIdentity && ratchetContext === 'direct'
        ? getDeviceMessagingIdentity()
        : null;
    return {
        type: 'DR_RESET',
        resetId: randomUUID(),
        signedPreKey: device?.signedPreKey ?? getMySignedPreKeyBundle(),
        ratchetContext,
        ...(device ? { senderDeviceId: device.identity.deviceId } : {}),
    };
}
