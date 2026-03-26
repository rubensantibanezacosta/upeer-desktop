import crypto from 'node:crypto';
import {
    encrypt,
    getMyEphemeralPublicKeyHex,
    getMyPublicKeyHex,
    getMyUPeerId,
    sign,
} from '../../security/identity.js';
import { getContactByUpeerId } from '../../storage/contacts/operations.js';
import { warn } from '../../security/secure-logger.js';
import { sendSecureUDPMessage } from '../server/transport.js';
import { canonicalStringify } from '../utils.js';

export interface GroupDeliveryContact {
    upeerId: string;
    publicKey: string;
    status: string;
    address?: string;
    knownAddresses?: string;
}

export const sendPacketToKnownAddresses = async (contact: GroupDeliveryContact, packet: Record<string, unknown>): Promise<void> => {
    const addresses: string[] = [];
    if (contact.address) {
        addresses.push(contact.address);
    }

    try {
        const known = JSON.parse(contact.knownAddresses ?? '[]');
        for (const addr of known) {
            if (!addresses.includes(addr)) {
                addresses.push(addr);
            }
        }
    } catch (error) {
        warn('No se pudieron parsear las direcciones conocidas del contacto', { upeerId: contact.upeerId, error: String(error) }, 'network');
    }

    for (const addr of addresses) {
        sendSecureUDPMessage(addr, packet, contact.publicKey);
    }
};

export const vaultPacket = async (targetUpeerId: string, packet: Record<string, unknown>, seed: string): Promise<void> => {
    const { VaultManager } = await import('../vault/manager.js');
    const payloadHashOverride = crypto.createHash('sha256').update(seed).digest('hex');
    await VaultManager.replicateToVaults(targetUpeerId, packet, undefined, payloadHashOverride);
};

export const buildSignedPacket = (packet: Record<string, unknown>, senderUpeerId: string): Record<string, unknown> => ({
    ...packet,
    senderUpeerId,
    signature: sign(Buffer.from(canonicalStringify(packet))).toString('hex')
});

export const resolveGroupContact = async (targetUpeerId: string) => {
    const myId = getMyUPeerId();
    return await getContactByUpeerId(targetUpeerId) || (targetUpeerId === myId
        ? { upeerId: myId, publicKey: getMyPublicKeyHex(), status: 'disconnected' }
        : null);
};

export const buildEncryptedGroupPacket = async (
    type: 'GROUP_INVITE' | 'GROUP_UPDATE',
    groupId: string,
    adminUpeerId: string,
    sensitivePayload: string,
    targetKeyHex: string,
) => {
    const ephPubKey = getMyEphemeralPublicKeyHex();
    const { ciphertext, nonce } = encrypt(
        Buffer.from(sensitivePayload, 'utf-8'),
        Buffer.from(targetKeyHex, 'hex')
    );

    return {
        type,
        groupId,
        adminUpeerId,
        payload: ciphertext,
        nonce,
        ephemeralPublicKey: ephPubKey,
        useRecipientEphemeral: false,
    };
};

export const deliverGroupPacket = async ({
    targetUpeerId,
    packet,
    signedPacket,
    contact,
    vaultSeed,
    warnMessage,
    skipDirectSend,
    warnContext,
}: {
    targetUpeerId: string;
    packet: Record<string, unknown>;
    signedPacket: Record<string, unknown>;
    contact: GroupDeliveryContact;
    vaultSeed: string;
    warnMessage: string;
    skipDirectSend?: boolean;
    warnContext: Record<string, unknown>;
}) => {
    if (!skipDirectSend && contact.status === 'connected') {
        await sendPacketToKnownAddresses(contact, packet);
    }

    await vaultPacket(targetUpeerId, signedPacket, vaultSeed);

    if (!skipDirectSend && contact.status !== 'connected') {
        warn(warnMessage, warnContext, 'vault');
    }
};