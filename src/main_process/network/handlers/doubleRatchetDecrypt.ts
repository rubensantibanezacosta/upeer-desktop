import { getMyIdentitySkBuffer, getSpkBySpkId } from '../../security/identity.js';
import { ratchetDecrypt, ratchetInitBob, x3dhResponder } from '../../security/ratchet.js';
import type { RatchetHeader, X3DHInitPacket } from '../../security/ratchetShared.js';
import { getRatchetSession, saveRatchetSession } from '../../storage/ratchet/operations.js';
import { ratchetSessionQueueKey, withRatchetSessionLock } from '../../security/ratchetSessionQueue.js';
import { resolveInboundDeviceSpk } from '../../security/deviceMessaging.js';
import { serializeState } from '../../security/ratchet.js';
import { warn } from '../../security/secure-logger.js';

type DoubleRatchetPayload = {
    content?: string;
    nonce?: string;
    ratchetHeader?: RatchetHeader;
    x3dhInit?: X3DHInitPacket;
};

export type RatchetContext = 'direct' | `group:${string}`;

const createResetPacket = (contextId: RatchetContext) => ({
    type: 'DR_RESET',
    ratchetContext: contextId,
} as const);

export async function decryptDoubleRatchetPayload(
    upeerId: string,
    data: DoubleRatchetPayload,
    onReset?: (reset: { type: 'DR_RESET'; ratchetContext: RatchetContext }) => void | Promise<void>,
    contextId: RatchetContext = 'direct',
): Promise<string | null> {
    return withRatchetSessionLock(ratchetSessionQueueKey(upeerId, contextId), () => decryptDoubleRatchetPayloadUnlocked(
        upeerId,
        data,
        onReset,
        contextId,
    ));
}

async function decryptDoubleRatchetPayloadUnlocked(
    upeerId: string,
    data: DoubleRatchetPayload,
    onReset?: (reset: { type: 'DR_RESET'; ratchetContext: RatchetContext }) => void | Promise<void>,
    contextId: RatchetContext = 'direct',
): Promise<string | null> {
    if (
        typeof data.content !== 'string'
        || typeof data.nonce !== 'string'
        || !data.ratchetHeader
    ) {
        return null;
    }

    try {
        const sessionResult = getRatchetSession(upeerId, contextId);
        const initialState = sessionResult ? JSON.stringify(serializeState(sessionResult.state, sessionResult.spkIdUsed)) : null;
        let session = sessionResult?.state;
        let usedSpkId = sessionResult?.spkIdUsed;

        if (!session && data.x3dhInit) {
            const { ekPub, ikPub, spkId } = data.x3dhInit;
            const deviceSpkEntry = resolveInboundDeviceSpk(ikPub, spkId);
            const spkEntry = deviceSpkEntry ?? getSpkBySpkId(spkId);
            if (!spkEntry) {
                await onReset?.(createResetPacket(contextId));
                return null;
            }

            const sharedSecret = x3dhResponder(
                deviceSpkEntry?.secretKey ?? getMyIdentitySkBuffer(),
                spkEntry.spkSk,
                Buffer.from(ikPub, 'hex'),
                Buffer.from(ekPub, 'hex')
            );
            session = ratchetInitBob(sharedSecret, spkEntry.spkPk, spkEntry.spkSk);
            usedSpkId = spkId;
            sharedSecret.fill(0);
        }

        if (!session) {
            await onReset?.(createResetPacket(contextId));
            return null;
        }

        const plaintext = ratchetDecrypt(session, data.ratchetHeader, data.content, data.nonce);
        if (plaintext) {
            saveRatchetSession(upeerId, session, usedSpkId, contextId);
            return plaintext.toString('utf-8');
        }

        const canRecoverFromFreshX3dh = Boolean(
            data.x3dhInit
            && data.ratchetHeader.n === 0
            && data.ratchetHeader.dh !== session?.dhr?.toString('hex'),
        );
        if (canRecoverFromFreshX3dh && data.x3dhInit) {
            const { ekPub, ikPub, spkId } = data.x3dhInit;
            const deviceSpkEntry = resolveInboundDeviceSpk(ikPub, spkId);
            const spkEntry = deviceSpkEntry ?? getSpkBySpkId(spkId);
            if (spkEntry) {
                const sharedSecret = x3dhResponder(
                    deviceSpkEntry?.secretKey ?? getMyIdentitySkBuffer(),
                    spkEntry.spkSk,
                    Buffer.from(ikPub, 'hex'),
                    Buffer.from(ekPub, 'hex')
                );
                const freshSession = ratchetInitBob(sharedSecret, spkEntry.spkPk, spkEntry.spkSk);
                sharedSecret.fill(0);
                const retry = ratchetDecrypt(freshSession, data.ratchetHeader, data.content, data.nonce);
                if (retry) {
                    const currentSession = getRatchetSession(upeerId, contextId);
                    const currentState = currentSession ? JSON.stringify(serializeState(currentSession.state, currentSession.spkIdUsed)) : null;
                    if (currentState !== initialState) return null;
                    saveRatchetSession(upeerId, freshSession, spkId, contextId);
                    warn('Recovered stale Double Ratchet session from authenticated X3DH restart', {
                        upeerId,
                        contextId,
                        previousSessionPresent: Boolean(sessionResult),
                    }, 'security');
                    return retry.toString('utf-8');
                }
            }
        }

        warn('Double Ratchet authentication failed; persisted session was preserved', {
            upeerId,
            contextId,
            sessionPresent: Boolean(sessionResult),
            x3dhInitPresent: Boolean(data.x3dhInit),
            headerN: data.ratchetHeader.n,
        }, 'security');
        return null;
    } catch (cause) {
        warn('Double Ratchet decrypt operation failed; persisted session was preserved', {
            upeerId,
            contextId,
            reason: cause instanceof Error ? cause.message : String(cause),
        }, 'security');
        return null;
    }
}