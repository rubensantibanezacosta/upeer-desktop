import path from 'node:path';
import crypto from 'node:crypto';
import { warn, debug, error } from '../../security/secure-logger.js';
import { getContactByUpeerId, getContacts as _getContacts } from '../../storage/contacts/operations.js';
import { getMyUPeerId, sign } from '../../security/identity.js';
import { canonicalStringify } from '../utils.js';
import { TransferPhase, FileTransfer } from './types.js';
import { generateTransferKey, sealTransferKey, encryptChunk } from './crypto.js';
import { saveTransferToDB, updateTransferMessageStatus } from './db-helper.js';
import { metadataSanitizer } from './metadata-sanitizer.js';
import { verifyFileTransferPacketSignature } from './signature.js';
import type { TransferManager } from './transfer-manager.js';

const CHUNK_PREPARE_CONCURRENCY = 4;

async function calculateHashFromChunks(handle: any, fileSize: number, chunkSize: number): Promise<string> {
    const { createHash } = await import('node:crypto');
    const hash = createHash('sha256');
    let position = 0;

    while (position < fileSize) {
        const length = Math.min(chunkSize, fileSize - position);
        const buffer = await readChunkFully(handle, length, position);
        hash.update(buffer);
        position += buffer.length;
    }

    return hash.digest('hex');
}

async function readChunkFully(handle: any, length: number, position: number): Promise<Buffer> {
    const buffer = Buffer.alloc(length);
    let offset = 0;

    while (offset < length) {
        const { bytesRead } = await handle.read(buffer, offset, length - offset, position + offset);
        if (bytesRead <= 0) break;
        offset += bytesRead;
    }

    if (offset <= 0) {
        throw new Error('Invalid chunk range or end of file reached');
    }

    return offset < length ? buffer.slice(0, offset) : buffer;
}

async function prepareChunkPayload(handle: any, transfer: FileTransfer, chunkIndex: number, aesKey?: Buffer) {
    const chunkSize = transfer.chunkSize || 16384;
    const offset = chunkIndex * chunkSize;
    const finalBuffer = await readChunkFully(handle, chunkSize, offset);

    const chunkMsg: any = {
        type: 'FILE_CHUNK',
        fileId: transfer.fileId,
        chunkIndex,
        chunkHash: crypto.createHash('sha256').update(finalBuffer).digest('hex')
    };

    if (aesKey) {
        const enc = encryptChunk(finalBuffer, aesKey);
        chunkMsg.data = enc.data;
        chunkMsg.iv = enc.iv;
        chunkMsg.tag = enc.tag;
    } else {
        chunkMsg.data = finalBuffer.toString('base64');
    }

    return {
        chunkIndex,
        chunkLength: finalBuffer.length,
        chunkMsg
    };
}

export async function startSend(
    this: TransferManager,
    upeerId: string,
    address: string,
    filePath: string,
    thumbnail?: string,
    caption?: string,
    isVoiceNote?: boolean,
    fileName?: string,
    options?: { chatUpeerId?: string; persistMessage?: boolean; messageId?: string }
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
        const totalChunks = this.chunker.calculateChunks(fileInfo.size, this.config.maxChunkSize);
        let sendHandle: any;
        let snapshotHash = fileInfo.hash;

        try {
            const fs = await import('node:fs/promises');
            sendHandle = await fs.open(effectivePath, 'r');
            snapshotHash = await calculateHashFromChunks(sendHandle, fileInfo.size, this.config.maxChunkSize);

            if (snapshotHash !== fileInfo.hash) {
                warn('Hash mismatch between validator stream and chunk reader', {
                    filePath: effectivePath,
                    validatorHash: fileInfo.hash,
                    chunkReaderHash: snapshotHash,
                    fileSize: fileInfo.size,
                    chunkSize: this.config.maxChunkSize
                }, 'file-transfer');
            }
        } catch (err) {
            warn('Failed to prepare sender snapshot handle, falling back to validator hash', {
                filePath: effectivePath,
                err: String(err)
            }, 'file-transfer');
        }

        const originalFileName = fileName || path.basename(filePath) || fileInfo.name;

        const transfer = this.store.createTransfer({
            messageId: options?.messageId,
            upeerId,
            chatUpeerId: options?.chatUpeerId,
            persistMessage: options?.persistMessage,
            peerAddress: address,
            fileName: originalFileName,
            fileSize: fileInfo.size,
            mimeType: fileInfo.mimeType,
            totalChunks,
            chunkSize: this.config.maxChunkSize,
            fileHash: snapshotHash,
            thumbnail,
            caption,
            isVoiceNote,
            direction: 'sending' as const,
            filePath,
            sanitizedPath: sanitizationResult?.wasProcessed ? effectivePath : undefined
        });

        if (sendHandle) {
            this.setFileHandle(transfer.fileId, sendHandle);
        }

        this.store.updateTransfer(transfer.fileId, 'sending', { state: 'active', phase: TransferPhase.PROPOSED });

        const contact = await getContactByUpeerId(upeerId);
        const peerKey = contact?.publicKey;
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
            ...(encryptedKey ? { encryptedKey, ...(encryptedKeyNonce ? { encryptedKeyNonce } : {}), useRecipientEphemeral: false } : {}),
            ...(encThumb ? { thumbnail: encThumb } : {}),
            caption: transfer.caption,
            isVoiceNote: transfer.isVoiceNote,
            ...(transfer.messageId && transfer.messageId !== transfer.fileId ? { messageId: transfer.messageId } : {}),
            ...(transfer.chatUpeerId?.startsWith('grp-') ? { chatUpeerId: transfer.chatUpeerId } : {}),
        };

        const sig = sign(Buffer.from(canonicalStringify(proposal)));
        proposal.signature = sig.toString('hex');

        debug('FILE_PROPOSAL prepared', {
            fileId: transfer.fileId,
            filePath: effectivePath,
            fileSize: transfer.fileSize,
            totalChunks: transfer.totalChunks,
            chunkSize: transfer.chunkSize,
            fileHash: transfer.fileHash,
            hasThumbnail: !!encThumb
        }, 'file-transfer');

        if (address) {
            this.send(address, proposal, contact?.publicKey);
        }
        this.ui.notifyStarted(transfer);
        if (options?.persistMessage !== false) {
            await saveTransferToDB(transfer);
        }

        let attempts = 0;
        const proposalTimer = setInterval(() => {
            const current = this.store.getTransfer(transfer.fileId, 'sending');
            if (!current || current.state !== 'active' || current.phase !== TransferPhase.PROPOSED) {
                clearInterval(proposalTimer);
                return;
            }

            attempts++;
            if (attempts >= 3) {
                if (contact?.status === 'connected') {
                    debug('Contact still connected, extending FILE_PROPOSAL timeout', { fileId: transfer.fileId, attempt: attempts + 1 }, 'file-transfer');
                    if (attempts >= 7) {
                        clearInterval(proposalTimer);
                        this.startVaultingFailover(transfer.fileId, upeerId, contact?.publicKey, aesKey, encThumb).catch((err: any) => {
                            error('Vaulting failover failed', err, 'vault');
                        });
                        return;
                    }
                } else {
                    clearInterval(proposalTimer);
                    this.startVaultingFailover(transfer.fileId, upeerId, contact?.publicKey, aesKey, encThumb).catch((err: any) => {
                        error('Vaulting failover failed', err, 'vault');
                    });
                    return;
                }
            }

            if (address) {
                debug('Retrying FILE_PROPOSAL', { fileId: transfer.fileId, attempt: attempts + 1 }, 'file-transfer');
                this.send(address, proposal, contact?.publicKey);
            }
        }, 1000);

        return transfer.fileId;
    } catch (err) {
        error('Error starting file transfer', err, 'file-transfer');
        throw err;
    }
}

export async function handleAccept(this: TransferManager, upeerId: string, address: string, data: any) {
    const contact = await getContactByUpeerId(upeerId);
    if (!contact?.publicKey) return;

    if (data.signature && !verifyFileTransferPacketSignature(data, contact.publicKey)) {
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
        const messageId = updated.messageId || data.fileId;
        if (await updateTransferMessageStatus(messageId, 'delivered')) {
            this.ui.safeSend('message-delivered', { id: messageId, upeerId });
            this.ui.notifyStatusUpdated(messageId, 'delivered');
        }
        this.sendNextChunks(updated);
    }
}

export async function handleAck(this: TransferManager, upeerId: string, address: string, data: any) {
    const transfer = this.store.getTransfer(data.fileId, 'sending');
    if (!transfer || (transfer.state !== 'active' && transfer.state !== 'completed')) return;

    debug('FILE_ACK received', {
        fileId: data.fileId,
        chunkIndex: data.chunkIndex,
        upeerId,
        address
    }, 'file-transfer');

    this.clearRetryTimer(data.fileId, data.chunkIndex);

    if (!(transfer as any)._ackedChunks) (transfer as any)._ackedChunks = new Set<number>();
    const ackedChunks = (transfer as any)._ackedChunks as Set<number>;
    ackedChunks.add(data.chunkIndex);

    const sentTime = (transfer as any)._chunksSentTimes?.get(data.chunkIndex);
    const updates: any = {
        chunksProcessed: ackedChunks.size
    };

    if (sentTime) {
        const rtt = Date.now() - sentTime;
        const srtt = transfer.srtt || 500;
        const newSrtt = Math.round(0.9 * srtt + 0.1 * rtt);
        const newRto = Math.min(10000, Math.max(1000, newSrtt * 2));
        updates.srtt = newSrtt;
        updates.rto = newRto;

        let windowSize = transfer.windowSize || this.config.initialWindowSize || 64;
        const ssthresh = transfer.ssthresh || 1024;
        const growthFactor = newSrtt < 150 ? 2.0 : 1.0;

        if (windowSize < ssthresh) {
            windowSize = Math.min(ssthresh, windowSize + Math.floor(growthFactor));
        } else {
            windowSize += (1.0 / windowSize) * growthFactor;
        }

        updates.windowSize = Math.min(this.config.maxWindowSize, Math.floor(windowSize));
        (transfer as any)._chunksSentTimes.delete(data.chunkIndex);
    }

    const updated = this.store.updateTransfer(data.fileId, 'sending', updates);

    if (updated) {
        this.ui.notifyProgress(updated);
        if (ackedChunks.size === updated.totalChunks) {
            const contact = await getContactByUpeerId(upeerId);
            const freshAddress = contact?.address || address;
            const doneMsg = { type: 'FILE_DONE', fileId: data.fileId };
            this.send(freshAddress, doneMsg, contact?.publicKey);
            this.startDoneRetry(data.fileId, upeerId, doneMsg);
        } else if ((updated.nextChunkIndex || 0) < updated.totalChunks) {
            await this.sendNextChunks(updated);
        }
    }
}

export async function startVaultingFailover(this: TransferManager, fileId: string, upeerId: string, peerPublicKey: string | undefined, aesKey: Buffer | undefined, encThumb: any) {
    const currentTransfer = this.store.getTransfer(fileId, 'sending');
    if (!currentTransfer || currentTransfer.state !== 'active') return;
    if (currentTransfer.phase === TransferPhase.TRANSFERRING || currentTransfer.state === 'completed') return;

    if (aesKey) {
        if (currentTransfer.fileSize > 10 * 1024 * 1024) {
            const { computeScore } = await import('../../security/reputation/vouches.js');
            const contactsForScore = await _getContacts();
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
                        if (updated) this.ui.notifyProgress(updated, true);
                    });
            } catch (err) {
                warn('Failed to initiate background file replication', err, 'vault');
            }
        }
    }
}

export async function sendNextChunks(this: TransferManager, transfer: FileTransfer) {
    if (!this.tryStartSendBatch(transfer.fileId)) return;
    let didSendChunks = false;

    try {
        const current = this.store.getTransfer(transfer.fileId, 'sending');
        if (!current || current.state !== 'active' || current.phase !== TransferPhase.TRANSFERRING) return;

        const processed = current.chunksProcessed || 0;
        const nextIdx = current.nextChunkIndex || 0;
        const windowSize = current.windowSize || this.config.initialWindowSize || 64;
        const inflight = Math.max(0, nextIdx - processed);
        const remaining = current.totalChunks - nextIdx;
        const availableWindow = Math.min(windowSize - inflight, remaining);

        if (availableWindow <= 0) return;

        let handle = this.getFileHandle(transfer.fileId);
        const sourcePath = current.sanitizedPath || current.filePath;
        if (!handle && sourcePath) {
            const fs = await import('node:fs/promises');
            try {
                const h = await fs.open(sourcePath, 'r');
                this.setFileHandle(current.fileId, h);
                handle = h;
            } catch (err) {
                error('Failed to open file for sending', err, 'file-transfer');
                return;
            }
        }

        if (!handle) return;
        const aesKey = this.transferKeys.get(current.fileId);
        const contact = await getContactByUpeerId(current.upeerId);
        const peerPublicKey = contact?.publicKey;
        const freshAddress = contact?.address || current.peerAddress;
        const chunkIndexes = Array.from({ length: availableWindow }, (_, index) => nextIdx + index)
            .filter(chunkIndex => chunkIndex < current.totalChunks);

        if (chunkIndexes.length === 0) return;

        const reserved = this.store.updateTransfer(current.fileId, 'sending', {
            nextChunkIndex: nextIdx + chunkIndexes.length
        }) || current;

        const preparedChunks: Array<{ chunkIndex: number; chunkLength: number; chunkMsg: any }> = [];
        for (let batchStart = 0; batchStart < chunkIndexes.length; batchStart += CHUNK_PREPARE_CONCURRENCY) {
            const batchIndexes = chunkIndexes.slice(batchStart, batchStart + CHUNK_PREPARE_CONCURRENCY);
            const preparedBatch = await Promise.all(
                batchIndexes.map(chunkIndex => prepareChunkPayload(handle, reserved, chunkIndex, aesKey))
            );
            preparedChunks.push(...preparedBatch);
        }

        if (!(reserved as any)._chunksSentTimes) (reserved as any)._chunksSentTimes = new Map<number, number>();
        const chunksSentTimes = (reserved as any)._chunksSentTimes as Map<number, number>;

        for (const prepared of preparedChunks) {
            chunksSentTimes.set(prepared.chunkIndex, Date.now());
            didSendChunks = true;

            debug('FILE_CHUNK sent', {
                fileId: current.fileId,
                chunkIndex: prepared.chunkIndex,
                chunkLength: prepared.chunkLength,
                chunkHash: prepared.chunkMsg.chunkHash,
                encrypted: !!aesKey
            }, 'file-transfer');

            this.send(freshAddress, prepared.chunkMsg, peerPublicKey);
            this.setRetryTimer(current.fileId, prepared.chunkIndex, reserved);
        }
    } catch (err) {
        error('Error in sendNextChunks', err, 'file-transfer');
    } finally {
        this.finishSendBatch(transfer.fileId);
        if (!didSendChunks) return;
        const latest = this.store.getTransfer(transfer.fileId, 'sending');
        if (!latest || latest.state !== 'active' || latest.phase !== TransferPhase.TRANSFERRING) return;

        const windowSize = latest.windowSize || this.config.initialWindowSize || 64;
        const inflight = Math.max(0, (latest.nextChunkIndex || 0) - (latest.chunksProcessed || 0));
        if (inflight < windowSize && (latest.nextChunkIndex || 0) < latest.totalChunks) {
            queueMicrotask(() => {
                void this.sendNextChunks(latest);
            });
        }
    }
}
