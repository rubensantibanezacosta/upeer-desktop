import { getMyPublicKeyHex, getMyUPeerId, getMyAlias, getMyAvatar, getMyEphemeralPublicKeyHex, getMySignedPreKeyBundle } from '../../security/identity.js';
import { AdaptivePow } from '../../security/pow.js';
import { getContactByUpeerId } from '../../storage/contacts/operations.js';
import { updateContactPublicKey } from '../../storage/contacts/keys.js';
import { updateContactStatus } from '../../storage/contacts/status.js';
import { sendSecurePacket } from '../server/transport.js';
import { getMainWindow } from '../../core/windowManager.js';
import { VaultManager } from '../vault/manager.js';

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
    sendSecurePacket(targetIp, data);
}

export async function acceptContactRequest(upeerId: string, publicKey: string, replyAddress?: string) {
    const contact = await getContactByUpeerId(upeerId);
    if (!contact) return;

    const targetAddress = replyAddress || contact.address;
    if (!targetAddress) throw new Error('Cannot accept contact request without a destination address');

    updateContactPublicKey(upeerId, publicKey);
    updateContactStatus(upeerId, 'connected');

    const data = {
        type: 'HANDSHAKE_ACCEPT',
        publicKey: getMyPublicKeyHex(),
        ephemeralPublicKey: getMyEphemeralPublicKeyHex(),
        signedPreKey: getMySignedPreKeyBundle(), // ← X3DH / Double Ratchet
        alias: getMyAlias() || undefined,
        avatar: getMyAvatar() || undefined,
        addresses: (await import('../utils.js')).getNetworkAddresses()
    };
    sendSecurePacket(targetAddress, data);
    getMainWindow()?.webContents.send('contact-handshake-finished', { upeerId });

    void VaultManager.queryOwnVaults().catch(() => undefined);
}