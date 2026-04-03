import crypto from 'node:crypto';
import {
    getMyPublicKeyHex,
    getMySignedPreKey,
    getMyUPeerId,
    sign,
} from '../../security/identity.js';
import { getContactByUpeerId } from '../../storage/contacts/operations.js';
import { warn } from '../../security/secure-logger.js';
import { sendSecureUDPMessage } from '../server/transport.js';
import { canonicalStringify } from '../utils.js';
import { encryptChatPayload } from './chatEncryption.js';

export interface GroupDeliveryContact {
    upeerId: string;
    publicKey: string;
    status: string;
    address?: string;
    knownAddresses?: string;
    signedPreKey?: string | null;
    signedPreKeyId?: number | null;
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
    const mySignedPreKey = getMySignedPreKey();
    return await getContactByUpeerId(targetUpeerId) || (targetUpeerId === myId
        ? {
            upeerId: myId,
            publicKey: getMyPublicKeyHex(),
            status: 'disconnected',
            signedPreKey: mySignedPreKey.spkPub,
            signedPreKeyId: mySignedPreKey.spkId,
        }
        : null);
};

export const buildEncryptedGroupPacket = async (
    type: 'GROUP_INVITE' | 'GROUP_UPDATE',
    groupId: string,
    adminUpeerId: string,
    sensitivePayload: string,
    targetUpeerId: string,
    contact: GroupDeliveryContact,
) => {
    const encrypted = await encryptChatPayload(targetUpeerId, sensitivePayload, contact);

    return {
        type,
        groupId,
        adminUpeerId,
        payload: encrypted.content,
        nonce: encrypted.nonce,
        ...(encrypted.ratchetHeader ? { ratchetHeader: encrypted.ratchetHeader } : {}),
        ...(encrypted.x3dhInit ? { x3dhInit: encrypted.x3dhInit } : {}),
        ...(encrypted.ephemeralPublicKey ? { ephemeralPublicKey: encrypted.ephemeralPublicKey } : {}),
        ...(encrypted.useRecipientEphemeral !== undefined ? { useRecipientEphemeral: encrypted.useRecipientEphemeral } : {}),
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
    skipVault,
    warnContext,
}: {
    targetUpeerId: string;
    packet: Record<string, unknown>;
    signedPacket: Record<string, unknown>;
    contact: GroupDeliveryContact;
    vaultSeed: string;
    warnMessage: string;
    skipDirectSend?: boolean;
    skipVault?: boolean;
    warnContext: Record<string, unknown>;
}) => {
    if (!skipDirectSend && contact.status === 'connected') {
        await sendPacketToKnownAddresses(contact, packet);
    }

    if (!skipVault) {
        await vaultPacket(targetUpeerId, signedPacket, vaultSeed);
    }

    if (!skipDirectSend && contact.status !== 'connected') {
        warn(warnMessage, warnContext, 'vault');
    }
};