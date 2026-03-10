import { ErasureCoder } from './redundancy/erasure.js';
import { trackDistributedAsset } from '../../storage/vault/index.js';
import { sendSecureUDPMessage } from '../server/transport.js';
import { getMyUPeerId } from '../../security/identity.js';
import { getContacts } from '../../storage/db.js';
import { info, error, debug } from '../../security/secure-logger.js';
import { SHARD_TTL_MS } from './manager.js';

/**
 * ChunkVault handles the 200% resilience distribution for file attachments.
 */
export class ChunkVault {
    // Systematic Reed-Solomon: 4 data blocks, 8 parity blocks (Total 12)
    private static coder = new ErasureCoder(4, 8);

    /**
     * Replicates a file across the social network using Erasure Coding.
     * @param fileHash The SHA-256 hash of the original file.
     * @param data The complete file buffer.
     * @param recipientSid Optional: If this file is for a specific person offline.
     */
    static async replicateFile(fileHash: string, data: Buffer, recipientSid: string = '*') {
        const threshold = 1024 * 1024; // 1MB

        if (data.length < threshold) {
            // Use Mirroring for small files (consistent with text messages)
            debug('Using Mirroring for small file', { fileHash, size: data.length }, 'vault');
            const { sign } = await import('../../security/identity.js');
            const { canonicalStringify } = await import('../utils.js');
            const myId = getMyUPeerId();

            const fileDataPacket = {
                type: 'FILE_DATA_SMALL',
                fileHash,
                data: data.toString('hex')
            };

            const signature = sign(Buffer.from(canonicalStringify(fileDataPacket)));

            const signedPacket = {
                ...fileDataPacket,
                senderUpeerId: myId,
                signature: signature.toString('hex')
            };

            const { VaultManager } = await import('./manager.js');
            return VaultManager.replicateToVaults(recipientSid, signedPacket);
        }

        try {
            // 1. Generate Shards (RS 4+8)
            const shards = this.coder.encode(data);
            const myId = getMyUPeerId();
            const allContacts = await getContacts();

            // Select up to 12 different custodians
            const candidates = allContacts
                .filter(c => c.status === 'connected' && c.upeerId !== myId)
                .sort((a, b) => (new Date(b.lastSeen || 0).getTime()) - (new Date(a.lastSeen || 0).getTime()));

            if (candidates.length === 0) {
                debug('No custodians available for file replication', { fileHash }, 'vault');
                return;
            }

            info('Starting distributed file replication', {
                fileHash,
                shards: shards.length,
                custodians: Math.min(candidates.length, 12)
            }, 'vault');

            // 2. Distribute and Track
            for (let i = 0; i < shards.length; i++) {
                const shard = shards[i];
                // Rotate candidates if we have fewer than 12
                const custodian = candidates[i % candidates.length];

                // CID: shard:fileHash:idx — legible por el receptor para ensamblado.
                // El custodio ve el hash del archivo, pero es un peer de confianza (vouchScore ≥ 30).
                // Cifrar los metadatos del shard (Fix 4 propuesto) requiere incluir un header
                // cifrado con la clave del receptor dentro del campo data — trabajo futuro.
                const cid = `shard:${fileHash}:${i}`;
                const expiresAt = Date.now() + SHARD_TTL_MS;

                const vaultPacket = {
                    type: 'VAULT_STORE',
                    payloadHash: cid,
                    recipientSid, // Can be a specific ID or '*' for public-within-friends
                    senderSid: myId,
                    priority: 3, // Low priority (Background/Heavy)
                    data: shard.toString('hex'),
                    expiresAt
                };

                sendSecureUDPMessage(custodian.address, vaultPacket);

                if (custodian && custodian.upeerId) {
                    await trackDistributedAsset(fileHash, cid, i, shards.length, custodian.upeerId);
                }
            }

            debug('File distribution complete', { fileHash }, 'vault');
        } catch (err) {
            error('Failed to replicate file to vault', err, 'vault');
        }
    }
}
