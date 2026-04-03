import {
    getMyIdentitySkBuffer,
    getSpkBySpkId,
} from '../../security/identity.js';
import { ratchetDecrypt, ratchetInitBob, x3dhResponder } from '../../security/ratchet.js';
import type { RatchetHeader, X3DHInitPacket } from '../../security/ratchetShared.js';
import {
    deleteRatchetSession,
    getRatchetSession,
    saveRatchetSession,
} from '../../storage/ratchet/operations.js';

type DoubleRatchetPayload = {
    content?: string;
    nonce?: string;
    ratchetHeader?: RatchetHeader;
    x3dhInit?: X3DHInitPacket;
};

export async function decryptDoubleRatchetPayload(
    upeerId: string,
    data: DoubleRatchetPayload,
    onReset?: () => void | Promise<void>,
): Promise<string | null> {
    if (
        typeof data.content !== 'string'
        || typeof data.nonce !== 'string'
        || !data.ratchetHeader
    ) {
        return null;
    }

    try {
        const sessionResult = getRatchetSession(upeerId);
        let session = sessionResult?.state;
        let usedSpkId = sessionResult?.spkIdUsed;

        if (!session && data.x3dhInit) {
            const { ekPub, ikPub, spkId } = data.x3dhInit;
            const spkEntry = getSpkBySpkId(spkId);
            if (!spkEntry) {
                deleteRatchetSession(upeerId);
                await onReset?.();
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
            await onReset?.();
            return null;
        }

        const plaintext = ratchetDecrypt(session, data.ratchetHeader, data.content, data.nonce);
        if (plaintext) {
            saveRatchetSession(upeerId, session, usedSpkId);
            return plaintext.toString('utf-8');
        }

        if (data.x3dhInit) {
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
                    saveRatchetSession(upeerId, freshSession, spkId);
                    return retry.toString('utf-8');
                }
            }
        }

        deleteRatchetSession(upeerId);
        await onReset?.();
        return null;
    } catch {
        deleteRatchetSession(upeerId);
        await onReset?.();
        return null;
    }
}