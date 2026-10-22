import { verify } from '../../security/identity.js';
import { info, warn } from '../../security/secure-logger.js';
import { isValidResetId } from '../../security/validationShared.js';
import { drResetReplayCache } from '../drResetReplayCache.js';

export type DrResetContact = {
    publicKey?: string;
    signedPreKey?: string | null;
    signedPreKeyId?: number | null;
    deviceId?: string | null;
    devicePublicKey?: string | null;
    deviceSignedPreKey?: string | null;
    deviceSignedPreKeyId?: number | null;
};

export type DrResetData = {
    type: string;
    resetId?: unknown;
    signedPreKey?: unknown;
    ratchetContext?: unknown;
    senderDeviceId?: unknown;
    [key: string]: unknown;
};

type SignedPreKeyPayload = {
    spkPub: string;
    spkSig: string;
    spkId: number;
};

function isSignedPreKeyPayload(value: unknown): value is SignedPreKeyPayload {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const record = value as Record<string, unknown>;
    return typeof record.spkPub === 'string'
        && typeof record.spkSig === 'string'
        && typeof record.spkId === 'number';
}

export async function handleDrResetPacket(
    upeerId: string,
    contact: DrResetContact,
    data: DrResetData,
): Promise<void> {
    const senderDeviceId = typeof data.senderDeviceId === 'string'
        ? data.senderDeviceId.toLowerCase()
        : undefined;
    if (senderDeviceId && contact.deviceId?.toLowerCase() !== senderDeviceId) {
        warn('Rejected DR_RESET for an unknown sender device', { upeerId, senderDeviceId }, 'security');
        return;
    }
    const isDeviceReset = Boolean(senderDeviceId && contact.devicePublicKey);
    if (senderDeviceId && !contact.devicePublicKey) {
        warn('Rejected DR_RESET without a device public key', { upeerId, senderDeviceId }, 'security');
        return;
    }
    const resetPublicKey = isDeviceReset ? contact.devicePublicKey : contact.publicKey;
    if (!resetPublicKey) return;
    if (!isSignedPreKeyPayload(data.signedPreKey)) {
        warn('Rejected DR_RESET without a valid signed prekey payload', { upeerId }, 'security');
        return;
    }
    const { spkPub, spkSig, spkId: newSpkId } = data.signedPreKey;
    const spkValid = verify(
        Buffer.from(spkPub, 'hex'),
        Buffer.from(spkSig, 'hex'),
        Buffer.from(resetPublicKey, 'hex'),
    );
    if (!spkValid) {
        warn('Rejected DR_RESET with an invalid signed prekey signature', { upeerId }, 'security');
        return;
    }
    const resetId = isValidResetId(data.resetId) ? data.resetId : undefined;
    if (data.resetId !== undefined && !resetId) {
        warn('Rejected DR_RESET with an invalid resetId', { upeerId }, 'security');
        return;
    }
    if (resetId && !drResetReplayCache.consume(upeerId, resetId)) {
        warn('Ignored replayed DR_RESET', { upeerId, resetId }, 'security');
        return;
    }
    const ratchetContext = typeof data.ratchetContext === 'string' ? data.ratchetContext : 'direct';
    if (ratchetContext !== 'direct' && !/^group:[^:]+$/.test(ratchetContext)) return;
    const currentSpkId = isDeviceReset
        ? contact.deviceSignedPreKeyId ?? 0
        : contact.signedPreKeyId ?? 0;
    if (currentSpkId > 0 && newSpkId < currentSpkId) {
        warn('Ignored stale DR_RESET', { upeerId, currentSpkId, receivedSpkId: newSpkId }, 'security');
        return;
    }
    const currentSpk = isDeviceReset ? contact.deviceSignedPreKey : contact.signedPreKey;
    if (currentSpkId > 0 && newSpkId === currentSpkId && currentSpk
        && currentSpk.toLowerCase() !== spkPub.toLowerCase()) {
        warn('Rejected DR_RESET with a different signed prekey for the same spkId', {
            upeerId,
            spkId: newSpkId,
            device: isDeviceReset,
        }, 'security');
        return;
    }
    const { deleteRatchetSession } = await import('../../storage/ratchet/operations.js');
    const groupId = ratchetContext.startsWith('group:') ? ratchetContext.slice('group:'.length) : undefined;
    const { ratchetSessionQueueKey, withRatchetSessionLock } = await import('../../security/ratchetSessionQueue.js');
    await withRatchetSessionLock(ratchetSessionQueueKey(upeerId, ratchetContext), async () => {
        deleteRatchetSession(upeerId, ratchetContext);
        if (!currentSpkId || newSpkId > currentSpkId) {
            const { updateContactDeviceSignedPreKey, updateContactSignedPreKey } =
                await import('../../storage/contacts/keys.js');
            if (isDeviceReset) {
                updateContactDeviceSignedPreKey(upeerId, spkPub, spkSig, newSpkId);
            } else {
                updateContactSignedPreKey(upeerId, spkPub, spkSig, newSpkId);
            }
        }
        const { retryPendingDirectMessages } = await import('../messaging/chatRetry.js');
        const { retryPendingEncryptedOperations, retryPendingGroupEncryptedOperations } =
            await import('../messaging/encryptedOperationRetry.js');
        const retried = ratchetContext === 'direct' ? await retryPendingDirectMessages(upeerId) : 0;
        const retriedEncrypted = ratchetContext === 'direct'
            ? await retryPendingEncryptedOperations(upeerId)
            : groupId ? await retryPendingGroupEncryptedOperations(upeerId, groupId) : 0;
        info('DR session reset by peer', { upeerId, ratchetContext, device: isDeviceReset }, 'security');
        if (retried > 0) {
            info('Retried pending direct messages after DR_RESET', { upeerId, retried }, 'security');
        }
        if (retriedEncrypted > 0) {
            info('Retried pending encrypted operations after DR_RESET', { upeerId, ratchetContext, retriedEncrypted }, 'security');
        }
    });
}
