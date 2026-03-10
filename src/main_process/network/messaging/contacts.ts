import { getMyPublicKeyHex, getMyUPeerId, getMyAlias, getMyAvatar, getMyEphemeralPublicKeyHex, getMySignedPreKeyBundle, sign } from '../../security/identity.js';
import { AdaptivePow } from '../../security/pow.js';
import { getContactByUpeerId, updateContactPublicKey } from '../../storage/db.js';
import { sendSecureUDPMessage } from '../server/transport.js';
import { canonicalStringify } from '../utils.js';

export async function sendContactRequest(targetIp: string) {
    // Generate PoW proof for Sybil resistance (light proof for mobile compatibility)
    const powProof = AdaptivePow.generateLightProof(getMyUPeerId());

    const data = {
        type: 'HANDSHAKE_REQ',
        publicKey: getMyPublicKeyHex(),
        ephemeralPublicKey: getMyEphemeralPublicKeyHex(),
        signedPreKey: getMySignedPreKeyBundle(), // ← X3DH / Double Ratchet
        alias: getMyAlias() || undefined,
        avatar: getMyAvatar() || undefined,
        powProof
    };
    sendSecureUDPMessage(targetIp, data);
}

export async function acceptContactRequest(upeerId: string, publicKey: string) {
    const contact = await getContactByUpeerId(upeerId);
    if (!contact) return;

    updateContactPublicKey(upeerId, publicKey);

    const data = {
        type: 'HANDSHAKE_ACCEPT',
        publicKey: getMyPublicKeyHex(),
        ephemeralPublicKey: getMyEphemeralPublicKeyHex(),
        signedPreKey: getMySignedPreKeyBundle(), // ← X3DH / Double Ratchet
        alias: getMyAlias() || undefined,
        avatar: getMyAvatar() || undefined
    };
    sendSecureUDPMessage(contact.address, data);
}