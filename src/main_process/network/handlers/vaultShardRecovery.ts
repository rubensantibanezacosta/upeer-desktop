import { getMyUPeerId } from '../../security/identity.js';
import { debug } from '../../security/secure-logger.js';
import { trackDistributedAsset } from '../../storage/vault/asset-operations.js';
import { saveVaultEntry } from '../../storage/vault/operations.js';
import { SHARD_TTL_MS } from '../vault/manager.js';
import type { VaultEntry } from './vaultDeliverySupport.js';

type VaultShardRecoveryArgs = {
    entry: VaultEntry;
    senderSid: string;
    sourceVaultFiles: Map<string, Set<string>>;
    recoveredFileHashes: Set<string>;
};

export async function recoverVaultShardEntry({
    entry,
    senderSid,
    sourceVaultFiles,
    recoveredFileHashes,
}: VaultShardRecoveryArgs): Promise<void> {
    if (typeof entry.payloadHash !== 'string' || !entry.payloadHash.startsWith('shard:')) return;

    debug('Received file shard from vault', { cid: entry.payloadHash }, 'vault');
    const parts = entry.payloadHash.split(':');
    const fileHash = parts[1];
    const segmentIndex = parts.length === 4 ? parseInt(parts[2], 10) : 0;
    const shardIndex = parseInt(parts.length === 4 ? parts[3] : parts[2], 10);
    if (!fileHash || isNaN(shardIndex) || isNaN(segmentIndex)) return;

    const myId = getMyUPeerId();
    if (entry.recipientDeviceId) {
        await saveVaultEntry(
            entry.payloadHash,
            myId,
            entry.senderSid,
            3,
            entry.data,
            Date.now() + SHARD_TTL_MS,
            entry.recipientDeviceId,
        );
    } else {
        await saveVaultEntry(
            entry.payloadHash,
            myId,
            entry.senderSid,
            3,
            entry.data,
            Date.now() + SHARD_TTL_MS
        );
    }
    await trackDistributedAsset(fileHash, entry.payloadHash, shardIndex, 12, myId, segmentIndex);
    const custodians = sourceVaultFiles.get(fileHash) ?? new Set<string>();
    custodians.add(senderSid);
    sourceVaultFiles.set(fileHash, custodians);
    recoveredFileHashes.add(fileHash);
}
