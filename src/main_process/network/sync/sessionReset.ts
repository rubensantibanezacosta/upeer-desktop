import { getMyUPeerId } from '../../security/identity.js';
import { warn } from '../../security/secure-logger.js';
import { deleteRatchetSession } from '../../storage/ratchet/operations.js';

export function resetSyncSession(senderDeviceId: string): void {
    deleteRatchetSession(getMyUPeerId(), `sync:${senderDeviceId}`);
    warn('Sync session reset by peer', { deviceId: senderDeviceId }, 'sync');
}
