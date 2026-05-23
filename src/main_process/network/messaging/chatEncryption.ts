import {
    getMyIdentitySkBuffer,
    getMyPublicKeyHex,
} from '../../security/identity.js';

type RatchetEncryptHeader = {
    dh: string;
    pn: number;
    n: number;
};

type RatchetEncryptResult = {
    header: RatchetEncryptHeader;
    ciphertext: string;
    nonce: string;
};

export class DoubleRatchetUnavailableError extends Error {
    readonly reason: 'missing-public-key' | 'missing-signed-prekey' | 'missing-signed-prekey-id' | 'no-session';

    constructor(reason: 'missing-public-key' | 'missing-signed-prekey' | 'missing-signed-prekey-id' | 'no-session') {
        super(reason);
        this.name = 'DoubleRatchetUnavailableError';
        this.reason = reason;
    }
}

export type ChatEncryptionContact = {
    publicKey?: string | null;
    signedPreKey?: string | null;
    signedPreKeyId?: number | null;
};

export type EncryptedChatPayload = {
    content: string;
    nonce: string;
    ratchetHeader?: RatchetEncryptHeader;
    ephemeralPublicKey?: string;
    useRecipientEphemeral?: boolean;
    x3dhInit?: {
        ekPub: string;
        spkId: number | null | undefined;
        ikPub: string;
    };
};

export async function encryptChatPayload(
    upeerId: string,
    payload: string,
    contact: ChatEncryptionContact,
): Promise<EncryptedChatPayload> {
    const contactPublicKey = contact.publicKey;
    if (!contactPublicKey) {
        throw new DoubleRatchetUnavailableError('missing-public-key');
    }

    const { getRatchetSession, saveRatchetSession } = await import('../../storage/ratchet/operations.js');
    const { x3dhInitiator, ratchetEncrypt, ratchetInitAlice } = await import('../../security/ratchet.js');
    const sessionResult = getRatchetSession(upeerId);
    let session = sessionResult?.state;
    let usedSpkId = sessionResult?.spkIdUsed;
    let x3dhInit: EncryptedChatPayload['x3dhInit'];

    if (!session) {
        if (!contact.signedPreKey) {
            throw new DoubleRatchetUnavailableError('missing-signed-prekey');
        }
        if (typeof contact.signedPreKeyId !== 'number') {
            throw new DoubleRatchetUnavailableError('missing-signed-prekey-id');
        }

        const myIdentitySecretKey = getMyIdentitySkBuffer();
        const myIdentityPublicKey = Buffer.from(getMyPublicKeyHex(), 'hex');
        const bobIdentityPublicKey = Buffer.from(contactPublicKey, 'hex');
        const bobSignedPreKey = Buffer.from(contact.signedPreKey, 'hex');
        const { ekPub, sharedSecret } = x3dhInitiator(myIdentitySecretKey, myIdentityPublicKey, bobIdentityPublicKey, bobSignedPreKey);
        session = ratchetInitAlice(sharedSecret, bobSignedPreKey);
        sharedSecret.fill(0);
        usedSpkId = contact.signedPreKeyId;
        x3dhInit = {
            ekPub: ekPub.toString('hex'),
            spkId: usedSpkId,
            ikPub: myIdentityPublicKey.toString('hex'),
        };
    }

    if (!session) {
        throw new DoubleRatchetUnavailableError('no-session');
    }

    const encrypted = ratchetEncrypt(session, Buffer.from(payload, 'utf-8')) as RatchetEncryptResult;
    saveRatchetSession(upeerId, session, usedSpkId);

    return {
        content: encrypted.ciphertext,
        nonce: encrypted.nonce,
        ratchetHeader: encrypted.header,
        ...(x3dhInit ? { x3dhInit } : {}),
    };
}