import crypto from 'node:crypto';
import {
    getMyPublicKeyHex,
    getMySignedPreKey,
    getMyUPeerId,
    sign,
} from '../../security/identity.js';
import { getContactByUpeerId } from '../../storage/contacts/operations.js';
import { signWithDevice } from '../../security/deviceMessaging.js';
import { warn } from '../../security/secure-logger.js';
import { sendSecurePacket } from '../server/transport.js';
import { canonicalStringify } from '../utils.js';
import { requireContactAdmission } from '../contactAdmission.js';
import { encryptChatPayload } from './chatEncryption.js';
import { VaultManager } from '../vault/manager.js';

export interface GroupDeliveryContact {
    upeerId: string;
    publicKey?: string;
    status: string;
    address?: string | null;
    knownAddresses?: string | string[] | null;
    signedPreKey?: string | null;
    signedPreKeyId?: number | null;
    deviceId?: string | null;
    devicePublicKey?: string | null;
    deviceSignedPreKey?: string | null;
    deviceSignedPreKeyId?: number | null;
}

export const hasDeviceDeliveryBinding = (contact: GroupDeliveryContact): boolean => {
    const { deviceId, devicePublicKey } = contact;
    return typeof deviceId === 'string'
        && /^[0-9a-f]{64}$/i.test(deviceId)
        && typeof devicePublicKey === 'string'
        && /^[0-9a-f]{64}$/i.test(devicePublicKey);
};

export const buildDeviceAwareGroupPacket = (
    packet: Record<string, unknown>,
    contact: GroupDeliveryContact,
): Record<string, unknown> => (
    hasDeviceDeliveryBinding(contact)
        ? { ...packet, senderDeviceId: contact.deviceId }
        : packet
);

export const getGroupRecipientPublicKey = (contact: GroupDeliveryContact): string | undefined => (
    hasDeviceDeliveryBinding(contact)
        ? contact.devicePublicKey as string
        : contact.publicKey
);

export const sendPacketToKnownAddresses = async (contact: GroupDeliveryContact, packet: Record<string, unknown>): Promise<void> => {
    const addresses: string[] = [];
    if (contact.address) {
        addresses.push(contact.address);
    }

    try {
        const knownValue = typeof contact.knownAddresses === 'string'
            ? JSON.parse(contact.knownAddresses)
            : contact.knownAddresses;
        const known = Array.isArray(knownValue) ? knownValue : [];
        for (const addr of known) {
            if (typeof addr === 'string' && !addresses.includes(addr)) {
                addresses.push(addr);
            }
        }
    } catch (error) {
        warn('No se pudieron parsear las direcciones conocidas del contacto', { upeerId: contact.upeerId, error: String(error) }, 'network');
    }

    const recipientPublicKey = contact.devicePublicKey ?? contact.publicKey;
    for (const addr of addresses) {
        sendSecurePacket(addr, packet, recipientPublicKey);
    }
};

export const vaultPacket = async (
    targetUpeerId: string,
    packet: Record<string, unknown>,
    seed: string,
    recipientDeviceId?: string,
): Promise<void> => {
    const payloadHashOverride = crypto.createHash('sha256').update(seed).digest('hex');
    if (recipientDeviceId) {
        await VaultManager.replicateToVaults(targetUpeerId, packet, undefined, payloadHashOverride, recipientDeviceId);
    } else {
        await VaultManager.replicateToVaults(targetUpeerId, packet, undefined, payloadHashOverride);
    }
};

export const buildSignedPacket = (packet: Record<string, unknown>, senderUpeerId: string): Record<string, unknown> => {
    const senderDeviceId = typeof packet.senderDeviceId === 'string' ? packet.senderDeviceId : '';
    const deviceSignature = senderDeviceId ? signWithDevice(Buffer.from(canonicalStringify(packet))) : null;
    if (deviceSignature) {
        return {
            ...packet,
            senderUpeerId,
            signature: deviceSignature.toString('hex'),
        };
    }
    const legacyPacket = senderDeviceId ? { ...packet } : packet;
    if (senderDeviceId) delete legacyPacket.senderDeviceId;
    return {
        ...legacyPacket,
        senderUpeerId,
        signature: sign(Buffer.from(canonicalStringify(legacyPacket))).toString('hex'),
    };
};

export const buildGroupMessageVaultPacket = (
    packet: Record<string, unknown>,
    contact: GroupDeliveryContact | null,
    senderUpeerId: string,
): Record<string, unknown> => {
    const deliveryPacket = contact ? buildDeviceAwareGroupPacket(packet, contact) : packet;
    return buildSignedPacket({ ...deliveryPacket, senderUpeerId }, senderUpeerId);
};

export const resolveGroupContact = async (targetUpeerId: string): Promise<GroupDeliveryContact | null> => {
    const myId = getMyUPeerId();
    if (targetUpeerId === myId) {
        const mySignedPreKey = getMySignedPreKey();
        return {
            upeerId: myId,
            publicKey: getMyPublicKeyHex(),
            status: 'disconnected',
            signedPreKey: mySignedPreKey.spkPub,
            signedPreKeyId: mySignedPreKey.spkId,
        };
    }
    const contact = await getContactByUpeerId(targetUpeerId);
    if (!contact) return null;
    return {
        upeerId: contact.upeerId,
        publicKey: contact.publicKey || '',
        status: contact.status || 'offline',
        address: contact.address || undefined,
        knownAddresses: contact.knownAddresses ?? undefined,
        signedPreKey: contact.signedPreKey ?? undefined,
        signedPreKeyId: contact.signedPreKeyId ?? undefined,
        deviceId: contact.deviceId ?? undefined,
        devicePublicKey: contact.devicePublicKey ?? undefined,
        deviceSignedPreKey: contact.deviceSignedPreKey ?? undefined,
        deviceSignedPreKeyId: contact.deviceSignedPreKeyId ?? undefined,
    };
};

export const buildEncryptedGroupPacket = async (
    type: 'GROUP_INVITE' | 'GROUP_UPDATE',
    groupId: string,
    adminUpeerId: string,
    sensitivePayload: string,
    targetUpeerId: string,
    contact: GroupDeliveryContact,
) => {
    if (targetUpeerId !== getMyUPeerId()) {
        await requireContactAdmission(targetUpeerId, contact.publicKey);
    }
    const encrypted = await encryptChatPayload(
        targetUpeerId,
        sensitivePayload,
        contact,
        `group:${groupId}`,
        { allowDeviceIdentity: true },
    );

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
        ...(encrypted.deviceId ? { senderDeviceId: encrypted.deviceId } : {}),
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
        if (contact.deviceId) {
            await vaultPacket(targetUpeerId, signedPacket, vaultSeed, contact.deviceId);
        } else {
            await vaultPacket(targetUpeerId, signedPacket, vaultSeed);
        }
    }

    if (!skipDirectSend && contact.status !== 'connected') {
        warn(warnMessage, warnContext, 'vault');
    }
};