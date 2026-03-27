import path from 'node:path';
import type { FileHandle } from 'node:fs/promises';
import { warn, debug, error } from '../../security/secure-logger.js';
import { getContactByUpeerId } from '../../storage/contacts/operations.js';
import { sign } from '../../security/identity.js';
import { canonicalStringify } from '../utils.js';
import { TransferPhase } from './types.js';
import { generateTransferKey, sealTransferKey, encryptChunk } from './crypto.js';
import { saveTransferToDB } from './db-helper.js';
import { metadataSanitizer } from './metadata-sanitizer.js';
import { calculateHashFromChunks } from './senderSupport.js';
import type { TransferManager } from './transfer-manager.js';

type EncryptedThumbnail = ReturnType<typeof encryptChunk>;

type FileProposalPacket = {
    type: 'FILE_PROPOSAL';
    fileId: string;
    fileName: string;
    fileSize: number;
    mimeType: string;
    totalChunks: number;
    chunkSize: number;
    fileHash: string;
    encryptedKey?: string;
    encryptedKeyNonce?: string;
    useRecipientEphemeral?: boolean;
    thumbnail?: EncryptedThumbnail;
    caption?: string;
    isVoiceNote?: boolean;
    messageId?: string;
    chatUpeerId?: string;
    signature?: string;
};

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
        let sendHandle: FileHandle | undefined;
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

        let encThumb: EncryptedThumbnail | undefined;
        if (thumbnail && aesKey) {
            try {
                const thumbData = thumbnail.startsWith('data:') ? thumbnail.split(',')[1] : thumbnail;
                encThumb = encryptChunk(Buffer.from(thumbData, 'base64'), aesKey);
            } catch (e) {
                debug('Failed to encrypt thumbnail', e, 'file-transfer');
            }
        }

        const proposal: FileProposalPacket = {
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
                        this.startVaultingFailover(transfer.fileId, upeerId, contact?.publicKey, aesKey, encThumb).catch((err: unknown) => {
                            error('Vaulting failover failed', err, 'vault');
                        });
                        return;
                    }
                } else {
                    clearInterval(proposalTimer);
                    this.startVaultingFailover(transfer.fileId, upeerId, contact?.publicKey, aesKey, encThumb).catch((err: unknown) => {
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