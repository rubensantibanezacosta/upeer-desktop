import {
    getMyIdentitySkBuffer,
    getSpkBySpkId,
} from '../../security/identity.js';
import { ratchetDecrypt, ratchetInitBob, x3dhResponder } from '../../security/ratchet.js';
import type { RatchetHeader, X3DHInitPacket } from '../../security/ratchetShared.js';
import { getRatchetSession, saveRatchetSession } from '../../storage/ratchet/operations.js';
import { ratchetSessionQueueKey, withRatchetSessionLock } from '../../security/ratchetSessionQueue.js';
import { serializeState } from '../../security/ratchet.js';

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
            const spkEntry = getSpkBySpkId(spkId);
            if (!spkEntry) {
                await onReset?.(createResetPacket(contextId));
                return null;
            }

            const sharedSecret = x3dhResponder(
                getMyIdentitySkBuffer(),
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

        if (!sessionResult && data.x3dhInit) {
            const { ekPub, ikPub, spkId } = data.x3dhInit;
            const spkEntry = getSpkBySpkId(spkId);
            if (spkEntry) {
                const sharedSecret = x3dhResponder(
                    getMyIdentitySkBuffer(),
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
                    return retry.toString('utf-8');
                }
            }
        }

        return null;
    } catch {
        return null;
    }
}