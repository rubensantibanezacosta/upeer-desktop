import crypto from 'node:crypto';
import { ErasureCoder } from './redundancy/erasure.js';
import { trackDistributedAsset } from '../../storage/vault/asset-operations.js';
import { sendSecureUDPMessage } from '../server/transport.js';
import { getMyUPeerId } from '../../security/identity.js';
import { getContacts } from '../../storage/contacts/operations.js';
import { info, error, debug, warn } from '../../security/secure-logger.js';
import { SHARD_TTL_MS } from './manager.js';
import { getVouchScore } from '../../security/reputation/vouches.js';

/**
 * ChunkVault handles the 200% resilience distribution for file attachments.
 */
export class ChunkVault {
    private static MAX_BINARY_CHUNK_SIZE = 32 * 1024;
    private static DEFAULT_SEGMENT_SIZE = 128 * 1024;
    private static MAX_SEGMENT_SIZE = 128 * 1024;
    private static MIN_SEGMENT_SIZE = 128 * 1024;

    // Systematic Reed-Solomon: 4 data blocks, 8 parity blocks (Total 12)
    private static coder = new ErasureCoder(4, 8);

    /**
     * Calcula el tamaño del segmento basado en la reputación del receptor.
     * Si el receptor es confiable, permitimos segmentos más grandes para reducir overhead 
     * y mejorar la velocidad de transferencia. Si es poco confiable, usamos segmentos 
     * pequeños para mitigar el impacto de fragmentos corruptos o denegaciones de servicio.
     */
    private static async getDynamicSegmentSize(recipientSid: string): Promise<number> {
        try {
            const score = await getVouchScore(recipientSid);
            if (score >= 80) return this.MAX_SEGMENT_SIZE;
            if (score <= 30) return this.MIN_SEGMENT_SIZE;

            // Interpolación para el rango medio (30-80)
            const ratio = (score - 30) / (80 - 30);
            const sizeRange = this.MAX_SEGMENT_SIZE - this.MIN_SEGMENT_SIZE;
            return Math.floor(this.MIN_SEGMENT_SIZE + (ratio * sizeRange));
        } catch {
            return this.DEFAULT_SEGMENT_SIZE;
        }
    }

    /**
     * Replicates a file across the social network using Erasure Coding.
     * Supports both direct buffers (small files) and file paths (large files with streaming).
     */
    static async replicateFile(fileHash: string, dataOrPath: Buffer | string, aesKey: Buffer, recipientSid = '*', fileId?: string) {
        const threshold = this.MAX_BINARY_CHUNK_SIZE;

        // If it's a buffer and small, use mirroring
        if (Buffer.isBuffer(dataOrPath) && dataOrPath.length < threshold) {
            return this._replicateSmallBuffer(fileHash, dataOrPath, recipientSid, fileId);
        }

        try {
            if (typeof dataOrPath === 'string') {
                // Large File / Stream Mode
                await this._replicateLargeFileBySegments(fileHash, dataOrPath, aesKey, recipientSid, fileId);
            } else if (Buffer.isBuffer(dataOrPath)) {
                // Buffer Mode (legacy or medium small files)
                await this._replicateBufferRS(fileHash, dataOrPath, recipientSid, fileId);
            }
        } catch (err) {
            error('Failed to replicate file to vault', err, 'vault');
        }
    }

    private static async _replicateSmallBuffer(fileHash: string, data: Buffer, recipientSid: string, fileId?: string) {
        debug('Using Mirroring for small file', { fileHash, size: data.length }, 'vault');
        const { sign } = await import('../../security/identity.js');
        const { canonicalStringify } = await import('../utils.js');
        const myId = getMyUPeerId();
        const allContacts = await getContacts();

        const candidates = allContacts
            .filter(c => c.status === 'connected' && c.upeerId !== myId)
            .sort((a, b) => (new Date(b.lastSeen || 0).getTime()) - (new Date(a.lastSeen || 0).getTime()));

        const fileDataPacket = {
            type: 'FILE_DATA_SMALL',
            fileHash,
            data: data.toString('hex')
        };

        const signature = sign(Buffer.from(canonicalStringify(fileDataPacket)));
        const signedPacket = { ...fileDataPacket, senderUpeerId: myId, signature: signature.toString('hex') };

        if (candidates.length === 0) {
            warn('No candidates for small buffer vault replication', { fileHash, fileId }, 'vault');
            if (fileId) {
                const { fileTransferManager } = await import('../file-transfer/transfer-manager.js');
                fileTransferManager.store.updateTransfer(fileId, 'sending', { state: 'failed', isVaulting: true });
                const updated = fileTransferManager.getTransfer(fileId, 'sending');
                if (updated) fileTransferManager.ui.notifyProgress(updated, true);
            }
            return 0;
        }

        const packetJson = JSON.stringify(signedPacket);
        const payloadHash = crypto.createHash('sha256').update(packetJson).digest('hex');
        const expiresAt = Date.now() + SHARD_TTL_MS;

        const vaultPacket = {
            type: 'VAULT_STORE',
            payloadHash,
            recipientSid,
            senderSid: myId,
            priority: 2,
            data: Buffer.from(packetJson).toString('hex'),
            expiresAt,
        };

        const { VaultManager } = await import('./manager.js');
        const nodes = await VaultManager.replicateToVaults(recipientSid, signedPacket);
        if (fileId && nodes > 0) {
            const { fileTransferManager } = await import('../file-transfer/transfer-manager.js');
            fileTransferManager.notifyVaultProgress(fileId, 1, 1);
        } else if (fileId) {
            const { fileTransferManager } = await import('../file-transfer/transfer-manager.js');
            fileTransferManager.store.updateTransfer(fileId, 'sending', { state: 'failed', isVaulting: true });
            const updated = fileTransferManager.getTransfer(fileId, 'sending');
            if (updated) fileTransferManager.ui.notifyProgress(updated, true);
        }
        return nodes;
    }

    private static async _replicateBufferRS(fileHash: string, data: Buffer, recipientSid: string, fileId?: string) {
        const shards = this.coder.encode(data);
        return this._distributeShards(fileHash, shards, recipientSid, fileId);
    }

    /**
     * Implements Segmented Vaulting: Reads a file in blocks, encrypts, and RS-encodes each.
     */
    private static async _replicateLargeFileBySegments(fileHash: string, filePath: string, aesKey: Buffer, recipientSid: string, fileId?: string) {
        const fs = await import('node:fs/promises');
        const crypto = await import('node:crypto');
        const stats = await fs.stat(filePath);

        const segmentSize = await this.getDynamicSegmentSize(recipientSid);
        const totalSegments = Math.ceil(stats.size / segmentSize);

        info('Starting segmented file replication', {
            fileHash,
            totalSegments,
            size: stats.size,
            segmentSize: (segmentSize / 1024 / 1024).toFixed(2) + 'MB'
        }, 'vault');

        const fd = await fs.open(filePath, 'r');
        try {
            const { fileTransferManager } = await import('../file-transfer/transfer-manager.js');

            for (let segIdx = 0; segIdx < totalSegments; segIdx++) {
                // BUG EV fix: comprobar si el usuario canceló la transferencia durante el proceso de segmentación/vaulting.
                // Sin esto, una vez iniciado el 'replicateFile', el bucle continúa hasta el final aunque el estado sea 'cancelled'.
                if (fileId) {
                    const transfer = fileTransferManager.getTransfer(fileId, 'sending');
                    if (transfer && transfer.state === 'cancelled') {
                        warn('File replication to vault aborted due to cancellation', { fileId, segIdx }, 'vault');
                        return;
                    }
                }

                const start = segIdx * segmentSize;
                const length = Math.min(segmentSize, stats.size - start);
                const buffer = Buffer.alloc(length);
                await fd.read(buffer, 0, length, start);

                // 1. Encrypt segment
                const iv = crypto.randomBytes(12);
                const cipher = crypto.createCipheriv('aes-256-gcm', aesKey, iv);
                const encrypted = Buffer.concat([cipher.update(buffer), cipher.final()]);
                const tag = cipher.getAuthTag();
                const sealedSegment = Buffer.concat([iv, tag, encrypted]);

                // 2. RS Encode (Segment as a whole)
                const shards = this.coder.encode(sealedSegment);

                // 3. Distribute WITHOUT per-shard notification (we do it once per segment below)
                await this._distributeShards(fileHash, shards, recipientSid, undefined, segIdx, totalSegments);

                // 4. Update progress once per segment (throttle IPC)
                if (fileId) {
                    const progress = Math.floor(((segIdx + 1) / totalSegments) * 100);
                    fileTransferManager.notifyVaultProgress(fileId, progress, 100);
                }
            }
        } finally {
            await fd.close();
        }
    }

    private static async _distributeShards(fileHash: string, shards: Buffer[], recipientSid: string, fileId?: string, segIdx = 0, totalSegments = 1) {
        const myId = getMyUPeerId();
        const allContacts = await getContacts();

        const candidates = allContacts
            .filter(c => c.status === 'connected' && c.upeerId !== myId)
            .sort((a, b) => (new Date(b.lastSeen || 0).getTime()) - (new Date(a.lastSeen || 0).getTime()));

        if (candidates.length === 0) return 0;

        for (let i = 0; i < shards.length; i++) {
            const shard = shards[i];
            const custodian = candidates[i % candidates.length];

            // Format: shard:fileHash:segIdx:shardIdx
            const cid = `shard:${fileHash}:${segIdx}:${i}`;
            const expiresAt = Date.now() + SHARD_TTL_MS;

            const vaultPacket = {
                type: 'VAULT_STORE',
                payloadHash: cid,
                recipientSid,
                senderSid: myId,
                priority: 3,
                data: shard.toString('hex'),
                expiresAt
            };

            sendSecureUDPMessage(custodian.address, vaultPacket);

            if (custodian.upeerId) {
                await trackDistributedAsset(fileHash, cid, i, shards.length, custodian.upeerId, segIdx);

                if (fileId) {
                    const { fileTransferManager } = await import('../file-transfer/transfer-manager.js');
                    const progress = Math.floor(((segIdx * shards.length + i + 1) / (totalSegments * shards.length)) * 100);
                    fileTransferManager.notifyVaultProgress(fileId, progress, 100);
                }

                const kademlia = (await import('../dht/shared.js')).getKademliaInstance();
                if (kademlia) {
                    const { createVaultPointerKey } = await import('../dht/kademlia/store.js');
                    const ptrKey = createVaultPointerKey(fileHash);
                    kademlia.storeValue(ptrKey, { fileHash, custodians: [custodian.upeerId], type: 'file-shards' }, myId).catch(() => { });
                }
            }
        }
        return candidates.length;
    }
}
