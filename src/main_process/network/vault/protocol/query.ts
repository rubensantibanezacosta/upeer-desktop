import { VaultQueryData } from '../../types.js';
import { getVaultEntriesPageForRecipient, getVaultEntryByHash, getVaultShardEntriesForFile } from '../../../storage/vault/operations.js';
import { security, network, warn } from '../../../security/secure-logger.js';
import { normalizeVaultDeviceId } from '../deviceMailbox.js';

const VAULT_DELIVERY_PAGE_SIZE = 120;

type VaultResponsePacket = {
    type: string;
    entries?: unknown[];
    hasMore?: boolean;
    nextAfterId?: number;
};

async function deliverSingleEntry(
    data: VaultQueryData,
    requesterDeviceId: string | null,
    fromAddress: string,
    sendResponse: (ip: string, packet: VaultResponsePacket) => void,
): Promise<void> {
    if (!data.payloadHash) return;
    const entry = await getVaultEntryByHash(data.payloadHash);
    const targetsRequester = entry && (entry.recipientSid === data.requesterSid || entry.recipientSid === '*');
    const targetsDevice = entry && (!entry.recipientDeviceId || entry.recipientDeviceId === requesterDeviceId);
    if (targetsRequester && targetsDevice) {
        sendResponse(fromAddress, {
            type: 'VAULT_DELIVERY',
            entries: [entry],
            hasMore: false,
        });
    }
}

async function deliverFileShards(
    data: VaultQueryData,
    requesterDeviceId: string | null,
    fromAddress: string,
    sendResponse: (ip: string, packet: VaultResponsePacket) => void,
): Promise<void> {
    if (!data.fileHash) return;
    const shards = await getVaultShardEntriesForFile(
        data.requesterSid,
        data.fileHash,
        requesterDeviceId,
        data.afterId,
        VAULT_DELIVERY_PAGE_SIZE + 1,
    );
    if (shards.length === 0) return;
    const hasMore = shards.length > VAULT_DELIVERY_PAGE_SIZE;
    const entries = shards.slice(0, VAULT_DELIVERY_PAGE_SIZE);
    sendResponse(fromAddress, {
        type: 'VAULT_DELIVERY',
        entries,
        hasMore,
        nextAfterId: hasMore ? entries[entries.length - 1]?.id : undefined,
    });
}

async function deliverPage(
    data: VaultQueryData,
    requesterDeviceId: string | null,
    fromAddress: string,
    sendResponse: (ip: string, packet: VaultResponsePacket) => void,
): Promise<void> {
    const page = await getVaultEntriesPageForRecipient(
        data.requesterSid,
        data.afterId,
        VAULT_DELIVERY_PAGE_SIZE + 1,
        requesterDeviceId,
    );
    const hasMore = page.length > VAULT_DELIVERY_PAGE_SIZE;
    const entries = page.slice(0, VAULT_DELIVERY_PAGE_SIZE);
    const nextAfterId = hasMore ? entries[entries.length - 1]?.id : undefined;
    network('Delivering vault entries', undefined, {
        recipient: data.requesterSid,
        count: entries.length,
        hasMore,
    }, 'vault');
    sendResponse(fromAddress, {
        type: 'VAULT_DELIVERY',
        entries,
        hasMore,
        nextAfterId,
    });
}

/**
 * Handles VAULT_QUERY requests from users checking for their offline messages.
 * Verifies the requester's identity before delivering entries.
 */
export async function deliverVaultQuery(
    senderSid: string,
    data: VaultQueryData,
    fromAddress: string,
    sendResponse: (ip: string, packet: VaultResponsePacket) => void,
): Promise<void> {
    if (senderSid !== data.requesterSid) {
        security('Unauthorized vault query attempt', {
            sender: senderSid,
            target: data.requesterSid,
            ip: fromAddress,
        }, 'vault');
        return;
    }

    const requesterDeviceId = normalizeVaultDeviceId(data.requesterDeviceId);
    try {
        if (data.payloadHash) {
            await deliverSingleEntry(data, requesterDeviceId, fromAddress, sendResponse);
            return;
        }
        if (data.fileHash) {
            await deliverFileShards(data, requesterDeviceId, fromAddress, sendResponse);
            return;
        }
        await deliverPage(data, requesterDeviceId, fromAddress, sendResponse);
    } catch (err) {
        warn('Vault query processing failed', { error: err }, 'vault');
    }
}
