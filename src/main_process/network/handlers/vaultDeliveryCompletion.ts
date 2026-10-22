import { fileTransferManager } from '../file-transfer/transfer-manager.js';
import { issueVouch, VouchType } from '../../security/reputation/vouches.js';
import { warn } from '../../security/secure-logger.js';
import type { VaultSendResponse } from './vaultDeliverySupport.js';

type FinalizeVaultDeliveryArgs = {
    senderSid: string;
    recoverySourceKey: string;
    sourceVaultFiles: Map<string, Set<string>>;
    pendingVaultFileCustodians: Map<string, Map<string, Set<string>>>;
    vouchedVaultFiles: Set<string>;
    recoveredFileHashes: Set<string>;
    processedEntries: number;
};

export function sendVaultDeliveryAck(
    fromAddress: string,
    myDeviceId: string | null,
    processedAckHashes: Set<string>,
    sendResponse: VaultSendResponse,
): void {
    if (processedAckHashes.size === 0) return;
    sendResponse(fromAddress, {
        type: 'VAULT_ACK',
        payloadHashes: Array.from(processedAckHashes),
        ...(myDeviceId ? { deviceId: myDeviceId } : {}),
    });
}

export async function finalizeVaultDelivery({
    senderSid,
    recoverySourceKey,
    sourceVaultFiles,
    pendingVaultFileCustodians,
    vouchedVaultFiles,
    recoveredFileHashes,
    processedEntries,
}: FinalizeVaultDeliveryArgs): Promise<void> {
    for (const fileHash of recoveredFileHashes) {
        try {
            await fileTransferManager.tryRecoverVaultTransferByFileHash(fileHash);
        } catch (err) {
            warn('Vault transfer recovery failed', { fileHash, err: String(err) }, 'vault');
        }
    }

    if (processedEntries > 0) {
        issueVouch(senderSid, VouchType.VAULT_RETRIEVED).catch((err) => {
            warn('Failed to issue vault retrieved vouch', { senderSid, err: String(err) }, 'reputation');
        });
    }

    for (const [fileHash, custodians] of sourceVaultFiles) {
        const completedTransfer = fileTransferManager.getAllTransfers().some((transfer) =>
            transfer.direction === 'receiving'
            && transfer.fileHash === fileHash
            && transfer.state === 'completed'
        );
        if (!completedTransfer) continue;
        for (const custodianId of custodians) {
            const vouchKey = `${custodianId}:${fileHash}`;
            if (vouchedVaultFiles.has(vouchKey)) continue;
            vouchedVaultFiles.add(vouchKey);
            issueVouch(custodianId, VouchType.VAULT_CHUNK).catch((err) => {
                vouchedVaultFiles.delete(vouchKey);
                warn('Failed to issue completed vault file vouch', { custodianId, fileHash, err: String(err) }, 'reputation');
            });
        }
    }

    pendingVaultFileCustodians.delete(recoverySourceKey);
}
