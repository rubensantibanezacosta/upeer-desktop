import { encrypt, getMyEphemeralPublicKeyHex, sign } from '../../security/identity.js';
import { updateMessageStatus } from '../../storage/messages/operations.js';
import { warn } from '../../security/secure-logger.js';
import { canonicalStringify } from '../utils.js';

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

export function getFanOutAddresses(contact: ContactAddressRecord): string[] {
    const addresses = new Set<string>();
    if (contact.address) addresses.add(contact.address);
    if (contact.knownAddresses) {
        try {
            const knownAddresses = typeof contact.knownAddresses === 'string'
                ? JSON.parse(contact.knownAddresses)
                : contact.knownAddresses;
            if (Array.isArray(knownAddresses)) {
                knownAddresses.forEach((address: string) => addresses.add(address));
            }
        } catch (err) {
            warn('Failed to parse knownAddresses for chat fan-out', { upeerId: contact?.upeerId, err: String(err) }, 'network');
        }
    }
    return Array.from(addresses);
}

export async function vaultChatForOfflineDelivery(
    recipientUpeerId: string,
    recipientPublicKey: string,
    msgId: string,
    content: string,
    replyTo: string | undefined,
    senderUpeerId: string,
    timestamp: number,
): Promise<number> {
    const senderEphemeralPublicKey = getMyEphemeralPublicKeyHex();
    const vaultEncrypted = encrypt(
        Buffer.from(content, 'utf-8'),
        Buffer.from(recipientPublicKey, 'hex')
    );

    const vaultData = {
        type: 'CHAT',
        id: msgId,
        content: vaultEncrypted.ciphertext,
        nonce: vaultEncrypted.nonce,
        timestamp,
        ephemeralPublicKey: senderEphemeralPublicKey,
        useRecipientEphemeral: false,
        replyTo,
    };

    const vaultSignature = sign(Buffer.from(canonicalStringify(vaultData)));
    const innerPacket = {
        ...vaultData,
        senderUpeerId,
        signature: vaultSignature.toString('hex'),
    };

    const { VaultManager } = await import('../vault/manager.js');
    return VaultManager.replicateToVaults(recipientUpeerId, innerPacket);
}

export async function getSelfAddresses(myId: string): Promise<string[]> {
    const selfAddresses: string[] = [];
    try {
        const { getKademliaInstance } = await import('../dht/handlers.js');
        const kademlia = getKademliaInstance() as KademliaContactLookup | null;
        const myYggAddress = (await import('../../sidecars/yggstack.js')).getYggstackAddress();
        if (kademlia) {
            const selfNodes = kademlia.findClosestContacts(myId, 20)
                .filter((node) => node.upeerId === myId && node.address !== myYggAddress);
            for (const node of selfNodes) selfAddresses.push(node.address);
        }
    } catch (err) {
        warn('Failed to discover self addresses for multi-device sync', { myId, err: String(err) }, 'network');
    }
    return selfAddresses;
}
