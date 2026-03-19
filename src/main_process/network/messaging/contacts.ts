import { getMyPublicKeyHex, getMyUPeerId, getMyAlias, getMyAvatar, getMyEphemeralPublicKeyHex, getMySignedPreKeyBundle } from '../../security/identity.js';
import { AdaptivePow } from '../../security/pow.js';
import { getContactByUpeerId } from '../../storage/contacts/operations.js';
import { updateContactPublicKey } from '../../storage/contacts/keys.js';
import { sendSecureUDPMessage } from '../server/transport.js';

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
        powProof,
        addresses: (await import('../utils.js')).getNetworkAddresses()
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
        avatar: getMyAvatar() || undefined,
        addresses: (await import('../utils.js')).getNetworkAddresses()
    };
    sendSecureUDPMessage(contact.address, data);
}