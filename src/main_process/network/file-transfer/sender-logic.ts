import { warn, debug, error } from '../../security/secure-logger.js';
import { getContactByUpeerId, getContacts as _getContacts } from '../../storage/contacts/operations.js';
import { getMyUPeerId, sign, verify } from '../../security/identity.js';
import { canonicalStringify } from '../utils.js';
import { TransferPhase, FileTransfer } from './types.js';
import { generateTransferKey, sealTransferKey, encryptChunk } from './crypto.js';
import { saveTransferToDB, updateTransferMessageStatus } from './db-helper.js';
import { metadataSanitizer } from './metadata-sanitizer.js';
import type { TransferManager } from './transfer-manager.js';

export async function startSend(
    this: TransferManager,
    upeerId: string,
    address: string,
    filePath: string,
    thumbnail?: string,
    caption?: string
): Promise<string> {
    try {
        const preliminaryMime = this.validator.detectMimeType(filePath);
        let effectivePath = filePath;
        let sanitizationResult = null;

        if (metadataSanitizer.canSanitize(preliminaryMime)) {
            sanitizationResult = await metadataSanitizer.sanitizeFile(filePath, preliminaryMime);
            effectivePath = sanitizationResult.sanitizedPath;

            if (sanitizationResult.wasProcessed && sanitizationResult.metadataRemoved.length > 0) {
                debug('Metadata stripped from file', {
                    fileName: filePath,
                    removed: sanitizationResult.metadataRemoved
                }, 'metadata-sanitizer');
            }

            if (sanitizationResult.securityWarning) {
                warn('Security warning during file send', {
                    warning: sanitizationResult.securityWarning,
                    fileName: filePath
                }, 'metadata-sanitizer');
            }
        } else {
            warn('File type cannot be sanitized - potential metadata leak', {
                mimeType: preliminaryMime,
                fileName: filePath
            }, 'metadata-sanitizer');
        }

        const fileInfo = await this.validator.validateAndPrepareFile(effectivePath);
        const totalChunks = this.chunker.calculateChunks(fileInfo.size);

        const originalFileName = filePath.split('/').pop() || fileInfo.name;

        const transfer = this.store.createTransfer({
            upeerId,
            peerAddress: address,
            fileName: originalFileName,
            fileSize: fileInfo.size,
            mimeType: fileInfo.mimeType,
            totalChunks,
            chunkSize: this.config.maxChunkSize,
            fileHash: fileInfo.hash,
            thumbnail,
            caption,
            direction: 'sending' as const,
            filePath: effectivePath,
            sanitizedPath: sanitizationResult?.wasProcessed ? effectivePath : undefined
        });

        this.store.updateTransfer(transfer.fileId, 'sending', { state: 'active', phase: TransferPhase.PROPOSED });

        const contact = await getContactByUpeerId(upeerId);
        const peerKey = contact?.ephemeralPublicKey || contact?.publicKey;
        let encryptedKey: string | undefined;
        let encryptedKeyNonce: string | undefined;

        const aesKey = generateTransferKey();
        this.transferKeys.set(transfer.fileId, aesKey);

        if (peerKey) {
            const sealed = sealTransferKey(aesKey, peerKey);
            encryptedKey = sealed.ciphertext;
            encryptedKeyNonce = sealed.nonce;
        }

        let encThumb: any;
        if (thumbnail && aesKey) {
            try {
                const thumbData = thumbnail.startsWith('data:') ? thumbnail.split(',')[1] : thumbnail;
                encThumb = encryptChunk(Buffer.from(thumbData, 'base64'), aesKey);
            } catch (e) {
                debug('Failed to encrypt thumbnail', e, 'file-transfer');
            }
        }

        const proposal: any = {
            type: 'FILE_PROPOSAL',
            fileId: transfer.fileId,
            fileName: transfer.fileName,
            fileSize: transfer.fileSize,
            mimeType: transfer.mimeType,
            totalChunks: transfer.totalChunks,
            chunkSize: transfer.chunkSize,
            fileHash: transfer.fileHash,
            ...(encryptedKey ? { encryptedKey, encryptedKeyNonce, useRecipientEphemeral: !!contact?.ephemeralPublicKey } : {}),
            ...(encThumb ? { thumbnail: encThumb } : {}),
            caption: transfer.caption,
        };

        const sig = sign(Buffer.from(canonicalStringify(proposal)));
        proposal.signature = sig.toString('hex');

        this.send(address, proposal, contact?.publicKey);
        this.ui.notifyStarted(transfer);
        await saveTransferToDB(transfer);

        let attempts = 0;
        const proposalTimer = setInterval(() => {
            const current = this.store.getTransfer(transfer.fileId, 'sending');
            if (!current || current.state !== 'active' || current.phase !== TransferPhase.PROPOSED) {
                clearInterval(proposalTimer);
                return;
            }

            attempts++;
            if (attempts >= 3) {
                clearInterval(proposalTimer);
                this.startVaultingFailover(transfer.fileId, upeerId, contact?.publicKey, aesKey, encThumb).catch((err: any) => {
                    error('Vaulting failover failed', err, 'vault');
                });
                return;
            }

            debug('Retrying FILE_PROPOSAL', { fileId: transfer.fileId, attempt: attempts + 1 }, 'file-transfer');
            this.send(address, proposal, contact?.publicKey);
        }, 1000);

        return transfer.fileId;
    } catch (err) {
        error('Error starting file transfer', err, 'file-transfer');
        throw err;
    }
}

export async function handleAccept(this: TransferManager, upeerId: string, address: string, data: any) {
    if (!data.signature) {
        warn('File accept missing signature', { fileId: data.fileId, upeerId }, 'security');
        return;
    }

    const contact = await getContactByUpeerId(upeerId);
    if (!contact?.publicKey) return;

    const dataToVerify = { ...data };
    delete dataToVerify.signature;

    if (!verify(Buffer.from(canonicalStringify(dataToVerify)), Buffer.from(data.signature, 'hex'), Buffer.from(contact.publicKey, 'hex'))) {
        warn('Invalid FILE_ACCEPT signature', { fileId: data.fileId }, 'security');
        return;
    }

    const transfer = this.store.getTransfer(data.fileId, 'sending');
    if (!transfer || (
        transfer.phase !== TransferPhase.PROPOSED &&
        transfer.phase !== TransferPhase.REPLICATING &&
        transfer.phase !== TransferPhase.VAULTED
    )) return;

    const updated = this.store.updateTransfer(data.fileId, 'sending', { phase: TransferPhase.TRANSFERRING, state: 'active' });
    if (updated) {
        this.ui.notifyProgress(updated, true);
        if (await updateTransferMessageStatus(data.fileId, 'delivered')) {
            this.ui.safeSend('message-delivered', { id: data.fileId, upeerId });
            this.ui.notifyStatusUpdated(data.fileId, 'delivered');
        }
        this.sendNextChunks(updated, address);
    }
}

export async function handleAck(this: TransferManager, upeerId: string, address: string, data: any) {
    const transfer = this.store.getTransfer(data.fileId, 'sending');
    if (!transfer || (transfer.state !== 'active' && transfer.state !== 'completed')) return;

    this.clearRetryTimer(data.fileId, data.chunkIndex);

    // Update RTT/RTO
    const sentTime = (transfer as any)._chunksSentTimes?.get(data.chunkIndex);
    const updates: any = {
        chunksProcessed: Math.max(transfer.chunksProcessed || 0, data.chunkIndex + 1)
    };

    if (sentTime) {
        const rtt = Date.now() - sentTime;
        const srtt = transfer.srtt || 500;
        const newSrtt = Math.round(0.9 * srtt + 0.1 * rtt);
        const newRto = Math.min(10000, Math.max(1000, newSrtt * 2));
        updates.srtt = newSrtt;
        updates.rto = newRto;

        // Sliding window logic (AIMD-like)
        let windowSize = transfer.windowSize || 64;
        const ssthresh = transfer.ssthresh || 1024;
        const growthFactor = newSrtt < 150 ? 2.0 : 1.0;

        if (windowSize < ssthresh) {
            // Slow start (crecimiento exponencial)
            windowSize = Math.min(ssthresh, windowSize + Math.floor(growthFactor));
        } else {
            // Congestion avoidance (crecimiento lineal)
            windowSize += (1.0 / windowSize) * growthFactor;
        }

        updates.windowSize = Math.floor(windowSize);
        (transfer as any)._chunksSentTimes.delete(data.chunkIndex);
    }

    const updated = this.store.updateTransfer(data.fileId, 'sending', updates);

    if (updated) {
        this.ui.notifyProgress(updated);
        if (updated.chunksProcessed === updated.totalChunks) {
            const contact = await getContactByUpeerId(upeerId);
            this.send(address, { type: 'FILE_DONE', fileId: data.fileId }, contact?.publicKey);
        } else {
            this.sendNextChunks(updated, address);
        }
    }
}

export async function startVaultingFailover(this: TransferManager, fileId: string, upeerId: string, peerPublicKey: string | undefined, aesKey: Buffer | undefined, encThumb: any) {
    const currentTransfer = this.store.getTransfer(fileId, 'sending');
    if (!currentTransfer || (currentTransfer.state !== 'active' && currentTransfer.phase !== TransferPhase.VAULTED)) return;

    if (aesKey) {
        if (currentTransfer.fileSize > 10 * 1024 * 1024) {
            const { computeScore } = await import('../../security/reputation/vouches.js');
            const contactsForScore = await _getContacts();
            // Correctly handle null upeerId and potential type issues
            const directIds = new Set<string>(contactsForScore
                .filter((c: any) => c.status === 'connected' && c.upeerId)
                .map((c: any) => c.upeerId as string));

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
            ...(vaultEncKey ? { encryptedKey: vaultEncKey, encryptedKeyNonce: vaultEncKeyNonce, useRecipientEphemeral: false } : {}),
            ...(encThumb ? { thumbnail: encThumb } : {}),
            caption: currentTransfer.caption,
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
                    if (await updateTransferMessageStatus(fileId, 'vaulted')) {
                        this.ui.notifyStatusUpdated(fileId, 'vaulted');
                    }
                } else {
                    warn('No nodes available for vault replication, marking as failed', { fileId, upeerId }, 'vault');
                    this.store.updateTransfer(fileId, 'sending', { state: 'failed', isVaulting: true });
                    const updated = this.store.getTransfer(fileId, 'sending');
                    if (updated) this.ui.notifyProgress(updated, true);
                }
            }).catch(err => {
                warn('Failed to replicate to vaults', err, 'vault');
                this.store.updateTransfer(fileId, 'sending', { state: 'failed', isVaulting: true });
                const updated = this.store.getTransfer(fileId, 'sending');
                if (updated) this.ui.notifyProgress(updated, true);
            });
        } catch (err) {
            warn('Failed to vault file proposal', err, 'vault');
        }

        if (currentTransfer.filePath) {
            const filePath = currentTransfer.filePath;
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
                        if (updated) this.ui.notifyProgress(updated, true);
                    });
            } catch (err) {
                warn('Failed to initiate background file replication', err, 'vault');
            }
        }
    }
}

export async function sendNextChunks(this: TransferManager, transfer: FileTransfer, address: string) {
    if (transfer.state !== 'active' || transfer.phase !== TransferPhase.TRANSFERRING) return;

    // Obtener el índice del primer chunk no procesado si queremos reintentar
    const processed = transfer.chunksProcessed || 0;
    const nextIdx = transfer.nextChunkIndex || 0;

    // Si estamos reintentando por timeout, empezamos desde el primer chunk que no ha recibido ACK
    const startIdx = Math.min(nextIdx, processed);

    const windowSize = transfer.windowSize || 64;
    const inflight = nextIdx - processed;
    const toSend = Math.max(1, Math.min(windowSize - inflight, transfer.totalChunks - startIdx));

    if (toSend <= 0) return;

    try {
        let handle = this.getFileHandle(transfer.fileId);
        if (!handle && transfer.filePath) {
            const fs = await import('node:fs/promises');
            try {
                const h = await fs.open(transfer.filePath, 'r');
                this.setFileHandle(transfer.fileId, h);
                handle = h;
            } catch (err) {
                error('Failed to open file for sending', err, 'file-transfer');
                return;
            }
        }

        if (!handle) return;
        const aesKey = this.transferKeys.get(transfer.fileId);
        const contact = await getContactByUpeerId(transfer.upeerId);
        const peerPublicKey = contact?.publicKey;

        for (let i = 0; i < toSend; i++) {
            const chunkIndex = (transfer.nextChunkIndex || 0) + i;
            if (chunkIndex >= transfer.totalChunks) break;

            const offset = BigInt(chunkIndex) * BigInt(transfer.chunkSize || 16384);

            const buffer = Buffer.alloc(transfer.chunkSize || 16384);

            const { bytesRead } = await (handle as any).read(buffer, 0, buffer.length, offset);
            const finalBuffer = bytesRead < (transfer.chunkSize || 16384) ? buffer.slice(0, bytesRead) : buffer;

            const chunkMsg: any = {
                type: 'FILE_CHUNK',
                fileId: transfer.fileId,
                chunkIndex
            };

            if (aesKey) {
                const enc = encryptChunk(finalBuffer, aesKey);
                chunkMsg.data = enc.data;
                chunkMsg.iv = enc.iv;
                chunkMsg.tag = enc.tag;
            } else {
                chunkMsg.data = finalBuffer.toString('base64');
            }

            // Save sent time for RTT calculation
            if (!(transfer as any)._chunksSentTimes) (transfer as any)._chunksSentTimes = new Map<number, number>();
            (transfer as any)._chunksSentTimes.set(chunkIndex, Date.now());

            this.send(address, chunkMsg, peerPublicKey);
            this.setRetryTimer(transfer.fileId, chunkIndex, transfer, address);
        }

        this.store.updateTransfer(transfer.fileId, 'sending', {
            nextChunkIndex: (transfer.nextChunkIndex || 0) + toSend
        });
    } catch (err) {
        error('Error in sendNextChunks', err, 'file-transfer');
    }
}
