import { sign } from '../../security/identity.js';
import { signWithDevice } from '../../security/deviceMessaging.js';
import { saveMessage, updateMessageStatus } from '../../storage/messages/operations.js';
import { error, warn } from '../../security/secure-logger.js';
import { canonicalStringify } from '../utils.js';
import { encryptChatPayload } from './chatEncryption.js';

type ContactAddressRecord = {
    upeerId?: string;
    address?: string | null;
    knownAddresses?: string | string[] | null;
};

type DhtContactNode = {
    upeerId?: string;
    address: string;
};

type KademliaContactLookup = {
    findClosestContacts(targetId: string, count: number): DhtContactNode[];
};

export async function emitMessageStatusUpdated(id: string, status: 'failed' | 'vaulted' | 'read'): Promise<void> {
    const { BrowserWindow } = await import('electron');
    BrowserWindow.getAllWindows()[0]?.webContents.send('message-status-updated', { id, status });
}

export async function markMessageAsFailed(id: string): Promise<void> {
    if (await updateMessageStatus(id, 'failed')) {
        await emitMessageStatusUpdated(id, 'failed');
    }
}

function normalizeAddress(address: unknown): string | null {
    if (typeof address !== 'string') return null;
    const trimmed = address.trim();
    return trimmed.length > 0 ? trimmed : null;
}

export function getFanOutAddresses(contact: ContactAddressRecord): string[] {
    const addresses = new Set<string>();
    const primaryAddress = normalizeAddress(contact.address);
    if (primaryAddress) addresses.add(primaryAddress);
    if (contact.knownAddresses) {
        try {
            const knownAddresses = typeof contact.knownAddresses === 'string'
                ? JSON.parse(contact.knownAddresses)
                : contact.knownAddresses;
            if (Array.isArray(knownAddresses)) {
                knownAddresses.forEach((address: unknown) => {
                    const normalizedAddress = normalizeAddress(address);
                    if (normalizedAddress) addresses.add(normalizedAddress);
                });
            }
        } catch (err) {
            warn('Failed to parse knownAddresses for chat fan-out', { upeerId: contact?.upeerId, err: String(err) }, 'network');
        }
    }
    return Array.from(addresses);
}

export async function vaultChatForOfflineDelivery(
    recipientUpeerId: string,
    recipientContact: {
        publicKey?: string | null;
        signedPreKey?: string | null;
        signedPreKeyId?: number | null;
        deviceId?: string | null;
        devicePublicKey?: string | null;
        deviceSignedPreKey?: string | null;
        deviceSignedPreKeyId?: number | null;
    },
    msgId: string,
    content: string,
    replyTo: string | undefined,
    senderUpeerId: string,
    timestamp: number,
): Promise<number> {
    const encryptedPayload = await encryptChatPayload(
        recipientUpeerId,
        content,
        recipientContact,
        'direct',
        { allowDeviceIdentity: true },
    );

    const vaultData = {
        type: 'CHAT',
        id: msgId,
        content: encryptedPayload.content,
        nonce: encryptedPayload.nonce,
        timestamp,
        replyTo,
        ...(encryptedPayload.ratchetHeader ? { ratchetHeader: encryptedPayload.ratchetHeader } : {}),
        ...(encryptedPayload.x3dhInit ? { x3dhInit: encryptedPayload.x3dhInit } : {}),
        ...(encryptedPayload.ephemeralPublicKey ? { ephemeralPublicKey: encryptedPayload.ephemeralPublicKey } : {}),
        ...(encryptedPayload.useRecipientEphemeral !== undefined ? { useRecipientEphemeral: encryptedPayload.useRecipientEphemeral } : {}),
        ...(encryptedPayload.deviceId ? { senderDeviceId: encryptedPayload.deviceId } : {}),
    };

    const deviceSignature = encryptedPayload.deviceId
        ? signWithDevice(Buffer.from(canonicalStringify(vaultData)))
        : null;
    const vaultSignature = deviceSignature ?? sign(Buffer.from(canonicalStringify(vaultData)));
    const innerPacket = {
        ...vaultData,
        senderUpeerId,
        signature: vaultSignature.toString('hex'),
    };

    const { VaultManager } = await import('../vault/manager.js');
    if (encryptedPayload.deviceId && recipientContact.deviceId) {
        return VaultManager.replicateToVaults(
            recipientUpeerId,
            innerPacket,
            undefined,
            undefined,
            recipientContact.deviceId,
        );
    }
    return VaultManager.replicateToVaults(recipientUpeerId, innerPacket);
}

export async function vaultExistingChatPacket(
    recipientUpeerId: string,
    packet: Record<string, unknown>,
    recipientDeviceId?: string | null,
): Promise<number> {
    const { VaultManager } = await import('../vault/manager.js');
    if (recipientDeviceId) {
        return VaultManager.replicateToVaults(recipientUpeerId, packet, undefined, undefined, recipientDeviceId);
    }
    return VaultManager.replicateToVaults(recipientUpeerId, packet);
}

type OfflineRecipientContact = Parameters<typeof vaultChatForOfflineDelivery>[1];

export type OfflineVaultResult = {
    id: string;
    savedMessage: string;
    timestamp: number;
};

export async function vaultOfflineMessage(
    recipientUpeerId: string,
    contact: OfflineRecipientContact,
    msgId: string,
    payload: string,
    replyTo: string | undefined,
    senderUpeerId: string,
    options: { timestamp?: number; discover?: boolean } = {},
): Promise<OfflineVaultResult> {
    const timestamp = options.timestamp ?? Date.now();
    await saveMessage(msgId, recipientUpeerId, true, payload, replyTo, '', 'sent', senderUpeerId, timestamp);
    let vaulted = false;
    try {
        const nodes = await vaultChatForOfflineDelivery(recipientUpeerId, contact, msgId, payload, replyTo, senderUpeerId, timestamp);
        if (nodes > 0 && await updateMessageStatus(msgId, 'vaulted')) {
            vaulted = true;
            setTimeout(() => { void emitMessageStatusUpdated(msgId, 'vaulted'); }, 0);
        }
    } catch (cause) {
        error('Vault replication failed for a message that could not go direct', cause, 'vault');
    }
    if (!vaulted) await markMessageAsFailed(msgId);
    if (options.discover !== false) {
        try {
            const [{ sendSecurePacket }, { startDhtSearch }] = await Promise.all([
                import('../server/transport.js'),
                import('../dht/core.js'),
            ]);
            startDhtSearch(recipientUpeerId, sendSecurePacket);
        } catch (cause) {
            warn('DHT search could not start after vaulting a message', { upeerId: recipientUpeerId, error: String(cause) }, 'network');
        }
    }
    return { id: msgId, savedMessage: payload, timestamp };
}

export async function getSelfAddresses(myId: string): Promise<string[]> {
    const selfAddresses = new Set<string>();
    try {
        const { getKademliaInstance } = await import('../dht/handlers.js');
        const kademlia = getKademliaInstance() as KademliaContactLookup | null;
        const myYggAddress = (await import('../../sidecars/yggstack.js')).getYggstackAddress();
        if (kademlia) {
            const selfNodes = kademlia.findClosestContacts(myId, 20)
                .filter((node) => node.upeerId === myId && node.address !== myYggAddress);
            for (const node of selfNodes) {
                const normalizedAddress = normalizeAddress(node.address);
                if (normalizedAddress) selfAddresses.add(normalizedAddress);
            }
        }
    } catch (err) {
        warn('Failed to discover self addresses for multi-device sync', { myId, err: String(err) }, 'network');
    }
    return Array.from(selfAddresses);
}
