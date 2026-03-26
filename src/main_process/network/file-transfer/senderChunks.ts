import { debug, error } from '../../security/secure-logger.js';
import { getContactByUpeerId } from '../../storage/contacts/operations.js';
import { TransferPhase, FileTransfer } from './types.js';
import { CHUNK_PREPARE_CONCURRENCY, prepareChunkPayload } from './senderSupport.js';
import type { TransferManager } from './transfer-manager.js';

export async function sendNextChunks(this: TransferManager, transfer: FileTransfer) {
    if (!this.tryStartSendBatch(transfer.fileId)) return;
    let didSendChunks = false;
    let transferToContinue: FileTransfer | null = null;

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
        if (didSendChunks) {
            const latest = this.store.getTransfer(transfer.fileId, 'sending');
            if (latest && latest.state === 'active' && latest.phase === TransferPhase.TRANSFERRING) {
                const windowSize = latest.windowSize || this.config.initialWindowSize || 64;
                const inflight = Math.max(0, (latest.nextChunkIndex || 0) - (latest.chunksProcessed || 0));
                if (inflight < windowSize && (latest.nextChunkIndex || 0) < latest.totalChunks) {
                    transferToContinue = latest;
                }
            }
        }
    }

    if (transferToContinue) {
        queueMicrotask(() => {
            void this.sendNextChunks(transferToContinue);
        });
    }
}