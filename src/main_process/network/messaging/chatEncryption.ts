import {
    getMyIdentitySkBuffer,
    getMyPublicKeyHex,
} from '../../security/identity.js';
import { getDeviceMessagingIdentity } from '../../security/deviceMessaging.js';
import { getRatchetSession, saveRatchetSession } from '../../storage/ratchet/operations.js';
import { x3dhInitiator, ratchetEncrypt, ratchetInitAlice } from '../../security/ratchet.js';
import { ratchetSessionQueueKey, withRatchetSessionLock } from '../../security/ratchetSessionQueue.js';
import { directRatchetContext } from '../../security/directRatchetContext.js';

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
    deviceId?: string | null;
    devicePublicKey?: string | null;
    deviceSignedPreKey?: string | null;
    deviceSignedPreKeyId?: number | null;
};

export type EncryptedChatPayload = {
    content: string;
    nonce: string;
    ratchetHeader?: RatchetEncryptHeader;
    ephemeralPublicKey?: string;
    useRecipientEphemeral?: boolean;
    deviceId?: string;
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
    contextId = 'direct',
    options: { allowDeviceIdentity?: boolean } = {},
): Promise<EncryptedChatPayload> {
    // El chat directo se cifra contra el dispositivo concreto del contacto, no contra su
    // cuenta: la cuenta puede tener varios dispositivos hablando con nosotros y una única
    // sesión DR compartida se desincroniza en cuanto dos escriben. Los demás contextos
    // (grupos, sync) ya llevan su propio identificador y no se tocan.
    const deviceAwareContext = contextId === 'direct' && options.allowDeviceIdentity
        ? directRatchetContext(contact.deviceId)
        : contextId;
    return withRatchetSessionLock(ratchetSessionQueueKey(upeerId, deviceAwareContext), async () => {
        const contactPublicKey = contact.publicKey;
        if (!contactPublicKey) {
            throw new DoubleRatchetUnavailableError('missing-public-key');
        }

        const device = options.allowDeviceIdentity
            && contact.devicePublicKey
            && contact.deviceSignedPreKey
            && typeof contact.deviceSignedPreKeyId === 'number'
            ? getDeviceMessagingIdentity()
            : null;
        const recipientIdentityKey = device ? contact.devicePublicKey : contactPublicKey;
        const recipientSignedPreKey = device ? contact.deviceSignedPreKey : contact.signedPreKey;
        const recipientSignedPreKeyId = device ? contact.deviceSignedPreKeyId : contact.signedPreKeyId;

        const sessionResult = getRatchetSession(upeerId, deviceAwareContext);
        let session = sessionResult?.state;
        let usedSpkId = sessionResult?.spkIdUsed;
        let x3dhInit: EncryptedChatPayload['x3dhInit'];

        if (!session) {
            if (!recipientSignedPreKey) {
                throw new DoubleRatchetUnavailableError('missing-signed-prekey');
            }
            if (typeof recipientSignedPreKeyId !== 'number') {
                throw new DoubleRatchetUnavailableError('missing-signed-prekey-id');
            }

            const myIdentitySecretKey = device ? device.identity.secretKey : getMyIdentitySkBuffer();
            const myIdentityPublicKey = device
                ? Buffer.from(device.identity.publicKey, 'hex')
                : Buffer.from(getMyPublicKeyHex(), 'hex');
            const bobIdentityPublicKey = Buffer.from(recipientIdentityKey as string, 'hex');
            const bobSignedPreKey = Buffer.from(recipientSignedPreKey, 'hex');
            const { ekPub, sharedSecret } = x3dhInitiator(myIdentitySecretKey, myIdentityPublicKey, bobIdentityPublicKey, bobSignedPreKey);
            session = ratchetInitAlice(sharedSecret, bobSignedPreKey);
            sharedSecret.fill(0);
            usedSpkId = recipientSignedPreKeyId;
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
        saveRatchetSession(upeerId, session, usedSpkId, deviceAwareContext);

        return {
            content: encrypted.ciphertext,
            nonce: encrypted.nonce,
            ratchetHeader: encrypted.header,
            ...(device ? { deviceId: device.identity.deviceId } : {}),
            ...(x3dhInit ? { x3dhInit } : {}),
        };
    });
}