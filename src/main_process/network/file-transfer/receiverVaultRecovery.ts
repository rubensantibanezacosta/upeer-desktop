import crypto from 'node:crypto';
import type { FileHandle } from 'node:fs/promises';
import { debug, warn, error } from '../../security/secure-logger.js';
import { getAssetShards } from '../../storage/vault/asset-operations.js';
import { getVaultEntryByHash } from '../../storage/vault/operations.js';
import { VAULT_REQUIRED_SHARDS, VAULT_SEGMENT_OVERHEAD, VAULT_SEGMENT_SIZE } from '../vault/chunk-vault.js';
import { ErasureCoder } from '../vault/redundancy/erasure.js';
import { TransferPhase, type FileTransfer } from './types.js';
import type { TransferManager } from './transfer-manager.js';

type TrackedShard = {
    cid: string;
    shardIndex: number;
    segmentIndex?: number | null;
};

async function writeAll(handle: FileHandle, buffer: Buffer, position: number): Promise<void> {
    let offset = 0;
    while (offset < buffer.length) {
        const { bytesWritten } = await handle.write(buffer, offset, buffer.length - offset, position + offset);
        if (!bytesWritten || bytesWritten <= 0) {
            throw new Error('Failed to write reconstructed segment to disk');
        }
        offset += bytesWritten;
    }
}

async function ensureTempHandle(manager: TransferManager, transfer: FileTransfer): Promise<FileHandle> {
    let handle = manager.getFileHandle(transfer.fileId);
    if (handle) {
        return handle;
    }

    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const os = await import('node:os');
    const tempFile = transfer.tempPath || path.join(os.tmpdir(), `chat-p2p-${transfer.fileId}.tmp`);

    handle = await fs.open(tempFile, transfer.tempPath ? 'r+' : 'w+').catch(async () => fs.open(tempFile, 'w+'));
    manager.setFileHandle(transfer.fileId, handle);
    if (!transfer.tempPath) {
        manager.store.updateTransfer(transfer.fileId, 'receiving', { tempPath: tempFile });
    }
    return handle;
}

function decryptVaultSegment(segment: Buffer, aesKey: Buffer, expectedLength: number): Buffer {
    if (segment.length < VAULT_SEGMENT_OVERHEAD) {
        throw new Error('Invalid vault segment length');
    }

    const iv = segment.subarray(0, 12);
    const tag = segment.subarray(12, 28);
    const encrypted = segment.subarray(28);
    const decipher = crypto.createDecipheriv('aes-256-gcm', aesKey, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return decrypted.subarray(0, expectedLength);
}

function recoveredBytesToChunks(transfer: FileTransfer, recoveredBytes: number): number {
    if (recoveredBytes <= 0) {
        return 0;
    }

    return Math.min(transfer.totalChunks, Math.ceil(recoveredBytes / transfer.chunkSize));
}

async function recoverReceivingTransfer(this: TransferManager, fileId: string): Promise<void> {
    await this.withTransferLock(fileId, async () => {
        const transfer = this.getTransfer(fileId, 'receiving');
        if (!transfer || transfer.state === 'completed' || transfer.state === 'cancelled' || transfer.state === 'failed') {
            return;
        }

        const aesKey = this.transferKeys.get(transfer.fileId);
        if (!aesKey) {
            return;
        }

        const trackedShards = await getAssetShards(transfer.fileHash) as TrackedShard[];
        if (!trackedShards.length) {
            return;
        }

        const shardsBySegment = new Map<number, Array<{ shardIndex: number; data: Buffer }>>();

        // Resolver todas las entradas del vault en paralelo (evita N queries DB secuenciales,
        // que degradaba el recovery de archivos grandes con muchos shards).
        const shardCids = trackedShards
            .filter((shard) => typeof shard.cid === 'string')
            .map((shard) => shard.cid as string);
        const entries = await Promise.all(
            shardCids.map((cid) => getVaultEntryByHash(cid).catch(() => undefined)),
        );
        const entryByCid = new Map<string, { data?: string }>();
        for (let i = 0; i < shardCids.length; i++) {
            const entry = entries[i];
            if (entry && typeof entry.data === 'string') {
                entryByCid.set(shardCids[i], entry);
            }
        }

        for (const shard of trackedShards) {
            if (typeof shard.cid !== 'string') {
                continue;
            }
            const entry = entryByCid.get(shard.cid);
            if (!entry?.data) {
                continue;
            }

            const segmentIndex = typeof shard.segmentIndex === 'number' ? shard.segmentIndex : 0;
            const segmentShards = shardsBySegment.get(segmentIndex) ?? [];
            segmentShards.push({
                shardIndex: shard.shardIndex,
                data: Buffer.from(entry.data, 'hex')
            });
            shardsBySegment.set(segmentIndex, segmentShards);
        }

        const recoverableSegments = Array.from(shardsBySegment.entries())
            .filter(([, shards]) => shards.length >= VAULT_REQUIRED_SHARDS)
            .sort(([left], [right]) => left - right);

        if (!recoverableSegments.length) {
            return;
        }

        const handle = await ensureTempHandle(this, transfer);
        const coder = new ErasureCoder(VAULT_REQUIRED_SHARDS, 12 - VAULT_REQUIRED_SHARDS);
        let recoveredBytes = 0;
        let lastProgressEmit = 0;

        for (const [segmentIndex, shards] of recoverableSegments) {
            const segmentOffset = segmentIndex * VAULT_SEGMENT_SIZE;
            const plainLength = Math.min(VAULT_SEGMENT_SIZE, transfer.fileSize - segmentOffset);
            if (plainLength <= 0) {
                continue;
            }

            try {
                const reconstructed = coder.decode(shards.map((shard) => ({
                    index: shard.shardIndex,
                    data: shard.data,
                })), plainLength + VAULT_SEGMENT_OVERHEAD);
                if (!reconstructed) {
                    continue;
                }

                const decryptedSegment = decryptVaultSegment(reconstructed, aesKey, plainLength);
                await writeAll(handle, decryptedSegment, segmentOffset);
                recoveredBytes += decryptedSegment.length;

                // Notificar progreso incremental por segmento reconstruido para que la UI
                // muestre el proceso de descarga (como en una transferencia online), en vez
                // de saltar de 0% a 100% al final. Se limita a ~3 updates/seg para no saturar.
                const now = Date.now();
                if (now - lastProgressEmit >= 300) {
                    lastProgressEmit = now;
                    const partialChunks = recoveredBytesToChunks(transfer, recoveredBytes);
                    const partialUpdate = this.store.updateTransfer(transfer.fileId, 'receiving', {
                        state: 'active',
                        phase: TransferPhase.TRANSFERRING,
                        chunksProcessed: partialChunks,
                    });
                    if (partialUpdate) {
                        this.ui.notifyProgress(partialUpdate, false);
                    }
                }
            } catch (err) {
                warn('Failed to reconstruct vault-backed segment', {
                    fileId: transfer.fileId,
                    fileHash: transfer.fileHash,
                    segmentIndex,
                    error: err instanceof Error ? err.message : String(err)
                }, 'vault');
            }
        }

        if (recoveredBytes <= 0) {
            return;
        }

        const recoveredChunkCount = recoveredBytes >= transfer.fileSize
            ? transfer.totalChunks
            : recoveredBytesToChunks(transfer, recoveredBytes);

        const updated = this.store.updateTransfer(transfer.fileId, 'receiving', {
            state: 'active',
            phase: TransferPhase.TRANSFERRING,
            chunksProcessed: recoveredChunkCount
        });

        if (updated) {
            this.ui.notifyProgress(updated, recoveredBytes >= transfer.fileSize);
        }

        debug('Recovered vault-backed attachment progress', {
            fileId: transfer.fileId,
            fileHash: transfer.fileHash,
            recoveredBytes,
            fileSize: transfer.fileSize,
            recoveredChunkCount,
            totalChunks: transfer.totalChunks
        }, 'vault');

        if (recoveredBytes >= transfer.fileSize) {
            await this.finalizeTransfer(transfer.fileId, 'receiving');
        }
    }).catch((err) => {
        error('Vault attachment recovery failed', err, 'vault');
    });
}

export async function tryRecoverVaultTransferByFileHash(this: TransferManager, fileHash: string): Promise<void> {
    if (typeof fileHash !== 'string' || fileHash.length === 0) {
        return;
    }

    const receivingTransfers = this.getAllTransfers()
        .filter((transfer) => transfer.direction === 'receiving' && transfer.fileHash === fileHash)
        .map((transfer) => this.getTransfer(transfer.fileId, 'receiving'))
        .filter((transfer): transfer is FileTransfer => !!transfer);

    if (!receivingTransfers.length) {
        return;
    }

    for (const transfer of receivingTransfers) {
        await recoverReceivingTransfer.call(this, transfer.fileId);
    }
}