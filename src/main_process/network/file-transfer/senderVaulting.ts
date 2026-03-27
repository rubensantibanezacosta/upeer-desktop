import { warn, error } from '../../security/secure-logger.js';
import { getMyUPeerId, sign } from '../../security/identity.js';
import { getContacts as _getContacts } from '../../storage/contacts/operations.js';
import { canonicalStringify } from '../utils.js';
import { TransferPhase } from './types.js';
import { sealTransferKey } from './crypto.js';
import { updateTransferMessageStatus } from './db-helper.js';
import type { TransferManager } from './transfer-manager.js';

type VaultingContact = {
    upeerId?: string;
    status: string;
};

export async function startVaultingFailover(this: TransferManager, fileId: string, upeerId: string, peerPublicKey: string | undefined, aesKey: Buffer | undefined, encThumb: string | undefined) {
    const currentTransfer = this.store.getTransfer(fileId, 'sending');
    if (!currentTransfer || currentTransfer.state !== 'active') return;
    if (currentTransfer.phase === TransferPhase.TRANSFERRING || currentTransfer.state === 'completed') return;

    if (aesKey) {
        if (currentTransfer.fileSize > 10 * 1024 * 1024) {
            const { computeScore } = await import('../../security/reputation/vouches.js');
            const contactsForScore = await _getContacts();
            const directIds = new Set<string>(contactsForScore
                .filter((contact: VaultingContact) => contact.status === 'connected' && typeof contact.upeerId === 'string')
                .map((contact: VaultingContact) => contact.upeerId as string));

            const score = computeScore(upeerId, directIds);
            if (score < 30) {
                warn('Skipping vaulting for large file to low-reputation recipient', { upeerId, score, fileId }, 'vault');
                return;
            }
        }

        warn('File proposal not accepted directly, starting vault replication', { fileId, upeerId }, 'vault');
        const staticPeerKey = peerPublicKey;
        let vaultEncKey: string | undefined;
        let vaultEncKeyNonce: string | undefined;

        if (staticPeerKey) {
            const vaultSealed = sealTransferKey(aesKey, staticPeerKey);
            vaultEncKey = vaultSealed.ciphertext;
            vaultEncKeyNonce = vaultSealed.nonce;
        }

        const proposalData = {
            type: 'FILE_PROPOSAL',
            fileId,
            fileName: currentTransfer.fileName,
            fileSize: currentTransfer.fileSize,
            mimeType: currentTransfer.mimeType,
            totalChunks: currentTransfer.totalChunks,
            chunkSize: currentTransfer.chunkSize,
            fileHash: currentTransfer.fileHash,
            ...(vaultEncKey ? { encryptedKey: vaultEncKey, ...(vaultEncKeyNonce ? { encryptedKeyNonce: vaultEncKeyNonce } : {}), useRecipientEphemeral: false } : {}),
            ...(encThumb ? { thumbnail: encThumb } : {}),
            caption: currentTransfer.caption,
            ...(currentTransfer.messageId && currentTransfer.messageId !== currentTransfer.fileId ? { messageId: currentTransfer.messageId } : {}),
            ...(currentTransfer.chatUpeerId?.startsWith('grp-') ? { chatUpeerId: currentTransfer.chatUpeerId } : {}),
        };

        const sig = sign(Buffer.from(canonicalStringify(proposalData)));

        try {
            const { VaultManager } = await import('../vault/manager.js');
            VaultManager.replicateToVaults(upeerId, {
                ...proposalData,
                senderUpeerId: getMyUPeerId(),
                signature: sig.toString('hex')
            }).then(async (nodes: number) => {
                if (nodes > 0) {
                    const statusMessageId = currentTransfer.messageId || fileId;
                    if (await updateTransferMessageStatus(statusMessageId, 'vaulted')) {
                        this.ui.notifyStatusUpdated(statusMessageId, 'vaulted');
                    }
                } else {
                    warn('No nodes available for vault replication, marking as failed', { fileId, upeerId }, 'vault');
                    this.store.updateTransfer(fileId, 'sending', { state: 'failed', isVaulting: true });
                    const updated = this.store.getTransfer(fileId, 'sending');
                    if (updated) {
                        this.ui.notifyProgress(updated, true);
                        this.ui.notifyFailed(updated, 'vault_unavailable');
                    }
                }
            }).catch(err => {
                warn('Failed to replicate to vaults', err, 'vault');
                this.store.updateTransfer(fileId, 'sending', { state: 'failed', isVaulting: true });
                const updated = this.store.getTransfer(fileId, 'sending');
                if (updated) {
                    this.ui.notifyProgress(updated, true);
                    this.ui.notifyFailed(updated, 'vault_replication_failed');
                }
            });
        } catch (err) {
            warn('Failed to vault file proposal', err, 'vault');
        }

        const replicationPath = currentTransfer.sanitizedPath || currentTransfer.filePath;
        if (replicationPath) {
            const filePath = replicationPath;
            this.store.updateTransfer(fileId, 'sending', {
                phase: TransferPhase.REPLICATING,
                state: 'active'
            });
            const updated = this.store.getTransfer(fileId, 'sending');
            if (updated) this.ui.notifyProgress(updated, true);

            try {
                const { ChunkVault } = await import('../vault/chunk-vault.js');
                ChunkVault.replicateFile(currentTransfer.fileHash, filePath, aesKey, upeerId, fileId)
                    .catch(err => {
                        error('Vault file replication failed async', err, 'vault');
                        this.store.updateTransfer(fileId, 'sending', { state: 'failed', isVaulting: true });
                        const updated = this.store.getTransfer(fileId, 'sending');
                        if (updated) {
                            this.ui.notifyProgress(updated, true);
                            this.ui.notifyFailed(updated, 'vault_file_replication_failed');
                        }
                    });
            } catch (err) {
                warn('Failed to initiate background file replication', err, 'vault');
            }
        }
    }
}