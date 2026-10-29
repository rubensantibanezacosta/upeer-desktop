import { deleteVaultEntry, getVaultEntriesPageForRecipient } from '../../storage/vault/operations.js';
import { getMyUPeerId } from '../../security/identity.js';
import { debug, warn } from '../../security/secure-logger.js';
import { getMyMailboxDeviceId } from './deviceMailbox.js';

const PAGE_SIZE = 120;
const MAX_PAGES = 40;
const LOCAL_SOURCE = 'local-mailbox';

type LocalDeliveryRow = {
    id?: number;
    payloadHash?: unknown;
    data?: unknown;
};

function ackHashesOf(packet: Record<string, unknown>): string[] {
    if (packet.type !== 'VAULT_ACK' || !Array.isArray(packet.payloadHashes)) return [];
    return packet.payloadHashes.filter((hash): hash is string => typeof hash === 'string' && hash.length > 0);
}

export async function drainLocalMailbox(): Promise<number> {
    const myId = getMyUPeerId();
    const deviceId = await getMyMailboxDeviceId();
    const { handleVaultDelivery } = await import('../handlers/vault.js');
    let delivered = 0;
    let afterId: number | undefined;

    for (let page = 0; page < MAX_PAGES; page += 1) {
        const rows = await getVaultEntriesPageForRecipient(myId, afterId, PAGE_SIZE, deviceId) as LocalDeliveryRow[];
        if (rows.length === 0) break;

        const pending = new Set<string>();
        const acknowledge = (_address: string, packet: Record<string, unknown>) => {
            for (const hash of ackHashesOf(packet)) pending.add(hash);
        };

        try {
            await handleVaultDelivery(myId, { entries: rows, hasMore: false }, null, acknowledge, LOCAL_SOURCE);
        } catch (cause) {
            warn('Local vault drain failed for a page', { error: String(cause), afterId }, 'vault');
            break;
        }

        for (const hash of pending) {
            if (await deleteVaultEntry(hash)) delivered += 1;
        }

        const lastId = rows[rows.length - 1]?.id;
        if (typeof lastId !== 'number') break;
        afterId = lastId;
    }

    if (delivered > 0) {
        debug('Local vault drained entries addressed to this device', { delivered }, 'vault');
    }
    return delivered;
}
