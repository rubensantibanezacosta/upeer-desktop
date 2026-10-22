import { error, info, warn } from '../../security/secure-logger.js';
import type { RatchetState } from '../../security/ratchetShared.js';
import { ratchetSessionQueueKey, withRatchetSessionLock } from '../../security/ratchetSessionQueue.js';
import { resolveInboundDeviceSpk } from '../../security/deviceMessaging.js';
import type { ChatAckPacket, ChatDrResetPacket, ChatIncomingPayload } from './chatMessageTypes.js';
import { createDrResetPacket } from './drResetPacket.js';

function createReset(data: ChatIncomingPayload): ChatDrResetPacket {
    return createDrResetPacket('direct', { useDeviceIdentity: Boolean(data.senderDeviceId) });
}

export type DecryptedChatPayload = {
    plaintext: string;
    session: RatchetState;
    spkIdUsed: number | null;
};

export type ChatDecryptResult = DecryptedChatPayload | { alreadyConsumed: true };

export async function decryptDoubleRatchetContent(
    upeerId: string,
    data: ChatIncomingPayload,
    sendResponse: (ip: string, data: ChatAckPacket | ChatDrResetPacket) => void,
    fromAddress: string,
    isDuplicate = false,
): Promise<ChatDecryptResult | null> {
    return withRatchetSessionLock(ratchetSessionQueueKey(upeerId), () => decryptDoubleRatchetContentUnlocked(
        upeerId,
        data,
        sendResponse,
        fromAddress,
        isDuplicate,
    ));
}

async function decryptDoubleRatchetContentUnlocked(
    upeerId: string,
    data: ChatIncomingPayload,
    sendResponse: (ip: string, data: ChatAckPacket | ChatDrResetPacket) => void,
    fromAddress: string,
    isDuplicate: boolean,
): Promise<ChatDecryptResult | null> {
    try {
        const { getRatchetSession } = await import('../../storage/ratchet/operations.js');
        const { x3dhResponder, ratchetInitBob, ratchetDecrypt } = await import('../../security/ratchet.js');
        const { getMyIdentitySkBuffer, getSpkBySpkId } = await import('../../security/identity.js');
        const sessionResult = getRatchetSession(upeerId, 'direct');
        let session = sessionResult?.state;
        let usedSpkId = sessionResult?.spkIdUsed;

        const retryStartsNewRatchet = Boolean(
            isDuplicate
            && data.x3dhInit
            && data.ratchetHeader?.n === 0
            && data.ratchetHeader.dh !== session?.dhr?.toString('hex'),
        );
        const canUseFreshX3dh = !session || retryStartsNewRatchet;
        if (canUseFreshX3dh && data.x3dhInit) {
            const { ekPub, ikPub, spkId } = data.x3dhInit;
            const deviceSpkEntry = resolveInboundDeviceSpk(ikPub, spkId);
            const spkEntry = deviceSpkEntry ?? getSpkBySpkId(spkId);
            if (!spkEntry) {
                error('X3DH: SPK no encontrado por ID', { spkId, upeerId }, 'security');
                sendResponse(fromAddress, createReset(data));
                return null;
            }
            const sharedSecret = x3dhResponder(
                deviceSpkEntry?.secretKey ?? getMyIdentitySkBuffer(),
                spkEntry.spkSk,
                Buffer.from(ikPub, 'hex'),
                Buffer.from(ekPub, 'hex'),
            );
            session = ratchetInitBob(sharedSecret, spkEntry.spkPk, spkEntry.spkSk);
            usedSpkId = spkId;
            sharedSecret.fill(0);
        }

        if (!session) {
            sendResponse(fromAddress, createReset(data));
            warn('No DR session and no x3dhInit, sent DR_RESET', { upeerId }, 'security');
            return null;
        }

        if (!data.ratchetHeader || !data.nonce) throw new Error('ratchet-header-or-nonce-missing');
        const headerDh = Buffer.from(data.ratchetHeader.dh, 'hex');
        if (
            isDuplicate
            && data.x3dhInit?.spkId === sessionResult?.spkIdUsed
            && session.dhr?.equals(headerDh)
            && data.ratchetHeader.n < session.nr
        ) return { alreadyConsumed: true };

        const plaintext = ratchetDecrypt(session, data.ratchetHeader, data.content, data.nonce);
        if (plaintext) return { plaintext: plaintext.toString('utf-8'), session, spkIdUsed: usedSpkId ?? null };

        if (sessionResult && data.x3dhInit && !isDuplicate) {
            const { ekPub, ikPub, spkId } = data.x3dhInit;
            const deviceSpkEntry = resolveInboundDeviceSpk(ikPub, spkId);
            const spkEntry = deviceSpkEntry ?? getSpkBySpkId(spkId);
            if (spkEntry) {
                const sharedSecret = x3dhResponder(
                    deviceSpkEntry?.secretKey ?? getMyIdentitySkBuffer(),
                    spkEntry.spkSk,
                    Buffer.from(ikPub, 'hex'),
                    Buffer.from(ekPub, 'hex'),
                );
                const freshSession = ratchetInitBob(sharedSecret, spkEntry.spkPk, spkEntry.spkSk);
                sharedSecret.fill(0);
                const retry = ratchetDecrypt(freshSession, data.ratchetHeader, data.content, data.nonce);
                if (retry) {
                    info('DR race resolved: replaced stale Alice session with Bob session', { upeerId }, 'security');
                    return { plaintext: retry.toString('utf-8'), session: freshSession, spkIdUsed: spkId };
                }
            }
            sendResponse(fromAddress, createReset(data));
            error('Double Ratchet decrypt returned null after x3dh retry', { upeerId }, 'security');
            return null;
        }

        error('Double Ratchet decrypt returned null; preserving the existing session', { upeerId }, 'security');
        return null;
    } catch (err) {
        error('Double Ratchet decrypt failed; preserving the existing session', err, 'security');
        return null;
    }
}