import { warn, error } from '../../security/secure-logger.js';
import { getContactByUpeerId } from '../../storage/contacts/operations.js';
import { verify, sign } from '../../security/identity.js';
import { canonicalStringify } from '../utils.js';
import { TransferPhase } from './types.js';
import { decryptChunk, unsealTransferKey } from './crypto.js';
import { saveTransferToDB } from './db-helper.js';
import type { TransferManager } from './transfer-manager.js';

async function writeAll(handle: any, buffer: Buffer, position: number): Promise<void> {
    let offset = 0;
    while (offset < buffer.length) {
        const { bytesWritten } = await handle.write(buffer, offset, buffer.length - offset, position + offset);
        if (!bytesWritten || bytesWritten <= 0) {
            throw new Error('Failed to write complete chunk to disk');
        }
        offset += bytesWritten;
    }
}

export async function handleFileProposal(this: TransferManager, upeerId: string, address: string, data: any) {
    try {
        const existing = this.store.getTransfer(data.fileId, 'receiving');
        if (existing) {
            if (existing.state === 'active' &&
                (existing.phase === TransferPhase.PROPOSED || existing.phase === TransferPhase.TRANSFERRING)) {
                const contact = await getContactByUpeerId(upeerId);
                const acceptMsg: any = { type: 'FILE_ACCEPT', fileId: data.fileId };
                const sig = sign(Buffer.from(canonicalStringify(acceptMsg)));
                acceptMsg.signature = sig.toString('hex');
                this.send(address, acceptMsg, contact?.publicKey);
            }
            return;
        }

        try {
            this.validator.validateIncomingFile(data);
        } catch (e: any) {
            warn('Invalid file proposal received', { upeerId, fileId: data.fileId, error: e.message }, 'file-transfer');
            return;
        }

        const contact = await getContactByUpeerId(upeerId);
        if (data.signature) {
            const proposalCopy = { ...data };
            delete proposalCopy.signature;
            const isValid = verify(
                Buffer.from(canonicalStringify(proposalCopy)),
                Buffer.from(data.signature, 'hex'),
                Buffer.from(contact?.publicKey || '', 'hex')
            );
            if (!isValid) {
                warn('Invalid signature on file proposal', { upeerId, fileId: data.fileId }, 'file-transfer');
                return;
            }
        }

        if (data.encryptedKey && data.encryptedKeyNonce) {
            const senderKey = contact?.ephemeralPublicKey || contact?.publicKey;
            if (senderKey) {
                const aesKey = unsealTransferKey(data.encryptedKey, data.encryptedKeyNonce, senderKey);
                if (aesKey) this.transferKeys.set(data.fileId, aesKey);
            }
        }

        let thumbnail = data.thumbnail;
        const aesKey = this.transferKeys.get(data.fileId);
        if (thumbnail && typeof thumbnail === 'object' && thumbnail.iv && aesKey) {
            try {
                const raw = decryptChunk(thumbnail.data, thumbnail.iv, thumbnail.tag, aesKey);
                const mime = data.mimeType?.startsWith('image/') ? data.mimeType : 'image/jpeg';
                thumbnail = `data:${mime};base64,${raw.toString('base64')}`;
            } catch {
                thumbnail = undefined;
            }
        } else if (thumbnail && typeof thumbnail === 'object') {
            thumbnail = undefined;
        }

        const transfer = this.store.createTransfer({
            fileId: data.fileId,
            upeerId,
            peerAddress: address,
            fileName: data.fileName,
            fileSize: data.fileSize,
            mimeType: data.mimeType,
            totalChunks: data.totalChunks,
            chunkSize: data.chunkSize,
            fileHash: data.fileHash,
            thumbnail,
            caption: data.caption,
            direction: 'receiving' as const
        });

        this.store.updateTransfer(transfer.fileId, 'receiving', { state: 'active', phase: TransferPhase.PROPOSED });
        this.ui.notifyReceiveMessage(transfer, upeerId);
        await saveTransferToDB(transfer);
        await this.acceptTransfer(transfer.fileId);
    } catch (err) {
        error('Error handling FILE_PROPOSAL', err, 'file-transfer');
    }
}

export async function acceptTransfer(this: TransferManager, fileId: string) {
    const transfer = this.store.getTransfer(fileId, 'receiving');
    if (!transfer || transfer.state !== 'active') return;
    if (transfer.phase !== TransferPhase.PROPOSED && transfer.phase !== TransferPhase.TRANSFERRING) return;

    try {
        const acceptMsg: any = { type: 'FILE_ACCEPT', fileId };
        const sig = sign(Buffer.from(canonicalStringify(acceptMsg)));
        acceptMsg.signature = sig.toString('hex');

        const contact = await getContactByUpeerId(transfer.upeerId);
        const targetAddress = contact?.address || transfer.peerAddress;
        this.send(targetAddress, acceptMsg, contact?.publicKey);

        if (transfer.phase === TransferPhase.PROPOSED) {
            this.store.updateTransfer(fileId, 'receiving', { phase: TransferPhase.TRANSFERRING });
            this.ui.notifyStarted(transfer);
        }
    } catch (err) {
        error('Error accepting transfer', err, 'file-transfer');
    }
}

export async function handleFileChunk(this: TransferManager, upeerId: string, address: string, data: any) {
    await this.withTransferLock(data.fileId, async () => {
        try {
            const transfer = this.store.getTransfer(data.fileId, 'receiving');
            if (!transfer) return;

            if (transfer.state === 'completed') {
                this.send(address, { type: 'FILE_DONE_ACK', fileId: data.fileId });
                return;
            }

            if (transfer.state !== 'active') return;

            if (typeof data.chunkIndex !== 'number' || data.chunkIndex < 0 || data.chunkIndex >= transfer.totalChunks) {
                warn('Received chunk with invalid index, ignoring', { fileId: data.fileId, chunkIndex: data.chunkIndex, totalChunks: transfer.totalChunks }, 'file-transfer');
                return;
            }

            if (transfer.pendingChunks.has(data.chunkIndex)) {
                this.send(address, { type: 'FILE_ACK', fileId: data.fileId, chunkIndex: data.chunkIndex });
                return;
            }

            let handle = this.getFileHandle(transfer.fileId);
            if (!handle) {
                const fs = await import('node:fs/promises');
                const path = await import('node:path');
                const os = await import('node:os');
                const tempFile = path.join(os.tmpdir(), `chat-p2p-${transfer.fileId}.tmp`);
                handle = await fs.open(tempFile, 'w+');
                this.setFileHandle(transfer.fileId, handle);
                this.store.updateTransfer(transfer.fileId, 'receiving', { tempPath: tempFile });
            }

            const aesKey = this.transferKeys.get(data.fileId);
            const chunkData = (aesKey && data.iv && data.tag)
                ? decryptChunk(data.data, data.iv, data.tag, aesKey)
                : Buffer.from(data.data, 'base64');

            const chunkStart = data.chunkIndex * transfer.chunkSize;
            const maxChunkLength = Math.min(transfer.chunkSize, transfer.fileSize - chunkStart);
            if (chunkData.length <= 0 || chunkData.length > maxChunkLength) {
                warn('Received chunk with invalid byte length, ignoring', {
                    fileId: data.fileId,
                    chunkIndex: data.chunkIndex,
                    chunkLength: chunkData.length,
                    maxChunkLength
                }, 'file-transfer');
                return;
            }

            await writeAll(handle, chunkData, chunkStart);

            transfer.pendingChunks.add(data.chunkIndex);
            const received = transfer.pendingChunks.size;

            const updated = this.store.updateTransfer(data.fileId, 'receiving', { chunksProcessed: received });

            this.send(address, { type: 'FILE_ACK', fileId: data.fileId, chunkIndex: data.chunkIndex });

            if (updated) this.ui.notifyProgress(updated);

            if (received === transfer.totalChunks) {
                await this.finalizeTransfer(data.fileId, 'receiving');
            }
        } catch (err) {
            error('Error handling FILE_CHUNK', err, 'file-transfer');
        }
    });
}

export async function handleFileDone(this: TransferManager, upeerId: string, address: string, data: any) {
    try {
        const contact = await getContactByUpeerId(upeerId);
        this.send(address, { type: 'FILE_DONE_ACK', fileId: data.fileId }, contact?.publicKey);
    } catch (err) {
        error('Error handling FILE_DONE', err, 'file-transfer');
    }
}

export async function handleFileCancel(this: TransferManager, upeerId: string, address: string, data: any) {
    warn('File transfer cancelled by peer', { fileId: data.fileId, upeerId, reason: data.reason }, 'file-transfer');
    this.cancelTransfer(data.fileId, 'sending', 'peer_cancelled');
    this.cancelTransfer(data.fileId, 'receiving', 'peer_cancelled');
}

export function handleHeartbeat(this: TransferManager, upeerId: string, address: string, data: any) {
    const transfer = this.store.getTransfer(data.fileId, 'sending');
    if (transfer && transfer.state === 'active') {
        this.send(address, { type: 'FILE_HEARTBEAT_ACK', fileId: data.fileId, t: data.t });
    }
}
