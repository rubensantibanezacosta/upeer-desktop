import { eq } from 'drizzle-orm';
import { debug, info, warn } from '../../security/secure-logger.js';
import { distributedAssets, redundancyHealth } from '../../storage/schema.js';
import { getDb } from '../../storage/shared.js';
import { getExpiringSoonEntries, renewVaultEntry } from '../../storage/vault/operations.js';
import { VAULT_RENEW_MS, VAULT_TTL_MS } from './manager.js';

import { ErasureCoder } from './redundancy/erasure.js';

/**
 * RepairWorker ensures the long-term health of distributed files.
 * It uses "Lazy Sync" to avoid unnecessary network traffic.
 */
export class RepairWorker {
    private static INTERVAL = 1000 * 60 * 60 * 4; // Check every 4 hours
    private static REPAIR_THRESHOLD = 6; // Repair if shards online <= 6 (RS 4+8)
    private static running = false;
    private static interval: NodeJS.Timeout | null = null;

    static start() {
        if (this.running) return;
        this.running = true;

        // Clear any existing interval
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
        }

        info('Vault Repair Worker started (Lazy Mode)', { interval: '4h' }, 'vault');

        // Initial delay to avoid startup congestion
        setTimeout(() => this.runMaintenance(), 1000 * 60 * 10);

        this.interval = setInterval(() => this.runMaintenance(), this.INTERVAL);
    }

    /**
     * Renueva automáticamente vault entries próximas a expirar.
     * Se llama desde runMaintenance() cada 4h.
     *
     * Algoritmo:
     *   1. Busca entries que expiran en < VAULT_TTL_MS - VAULT_RENEW_MS (15 días).
     *   2. Para cada una: actualiza expiresAt localmente + reenvía VAULT_STORE
     *      a los custodios actuales con el nuevo expiresAt.
     */
    static stop() {
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
        }
        this.running = false;
    }

    private static async renewExpiring(): Promise<void> {
        // Ventana: entries que expiran en < 15 días (VAULT_TTL_MS - VAULT_RENEW_MS)
        const windowMs = VAULT_TTL_MS - VAULT_RENEW_MS; // 15 días
        try {
            const expiringSoon = await getExpiringSoonEntries(windowMs);
            if (expiringSoon.length === 0) return;

            info('Renewing expiring vault entries', { count: expiringSoon.length }, 'vault');

            const { sendSecureUDPMessage } = await import('../server/index.js');
            const { getContacts } = await import('../../storage/db.js');
            const { getMyUPeerId } = await import('../../security/identity.js');
            const allContacts = await getContacts();
            const myId = getMyUPeerId();

            for (const entry of expiringSoon) {
                const newExpiresAt = Date.now() + VAULT_TTL_MS;
                await renewVaultEntry(entry.payloadHash, newExpiresAt);

                // Re-replicar a custodios online distintos del recipient
                const custodians = allContacts
                    .filter(c => c.status === 'connected'
                        && c.upeerId !== myId
                        && c.upeerId !== entry.recipientSid)
                    .slice(0, 6);

                for (const c of custodians) {
                    // BUG I fix: enviar VAULT_RENEW (solo hash + newExpiresAt) en lugar de
                    // VAULT_STORE completo. Esto evita que el custodio re-ejecute la comprobación
                    // de quota contando datos que ya tiene almacenados, y reduce el ancho de banda.
                    sendSecureUDPMessage(c.address, {
                        type: 'VAULT_RENEW',
                        payloadHash: entry.payloadHash,
                        newExpiresAt,
                    });
                }
            }
        } catch (err) {
            warn('Vault renewal cycle failed', { error: err }, 'vault');
        }
    }

    private static async runMaintenance() {
        debug('Running lazy vault maintenance...', {}, 'vault');

        // Renovar vault entries próximas a expirar (Fix resiliencia 60d)
        await this.renewExpiring();

        try {
            const db = getDb();
            // 1. Get assets that look degraded
            const degradedAssets = await db.select()
                .from(redundancyHealth)
                .where(eq(redundancyHealth.healthStatus, 'degraded'));

            for (const asset of degradedAssets) {
                // Lazy Check: Only repair if we've reached a critical quorum loss
                // or if we haven't checked in a long time
                if (asset.availableShards <= this.REPAIR_THRESHOLD) {
                    await this.repairAsset(asset.assetHash);
                }
            }
        } catch (err) {
            warn('Vault maintenance cycle failed', { error: err }, 'vault');
        }
    }

    private static async repairAsset(fileHash: string) {
        info('Repairing degraded asset (segment-aware)', { fileHash }, 'vault');

        try {
            const db = getDb();
            // 1. Get existing shards for this file
            const shards = await db.select()
                .from(distributedAssets)
                .where(eq(distributedAssets.fileHash, fileHash));

            if (shards.length === 0) return;

            // Group by segmentIndex
            const segments = new Map<number, any[]>();
            for (const s of shards) {
                const idx = (s as any).segmentIndex || 0;
                if (!segments.has(idx)) segments.set(idx, []);
                segments.get(idx)!.push(s);
            }

            for (const [segIdx, segShards] of segments.entries()) {
                // 2. Determine missing shard indices (0-11 total)
                const existingIndices = new Set(segShards.map(s => s.shardIndex));
                const allIndices = Array.from({ length: 12 }, (_, i) => i); // 4 data + 8 parity
                const missingIndices = allIndices.filter(idx => !existingIndices.has(idx));

                // 3. If we have at least 4 shards, attempt reconstruction
                if (segShards.length >= 4) {
                    await this.reconstructSegment(fileHash, segIdx, segShards);
                    continue;
                }

                // 4. Otherwise, try to fetch missing shards from custodians
                if (missingIndices.length > 0) {
                    await this.collectMissingShards(fileHash, segIdx, missingIndices);
                }
            }

        } catch (err) {
            warn('Repair failed for asset', { fileHash, error: err }, 'vault');
        }
    }

    /**
     * Reconstructs original file segment from shards.
     */
    private static async reconstructSegment(fileHash: string, segIdx: number, shards: any[]): Promise<void> {
        info('Reconstructing segment from shards', { fileHash, segIdx, shardCount: shards.length }, 'vault');

        try {
            // Convert database shards to format expected by ErasureCoder
            const shardObjects = shards.map(s => ({
                index: s.shardIndex,
                data: Buffer.from(s.data, 'hex')
            }));

            // Determine original file size (need to store this somewhere)
            // For now, assume maximum possible size (shard size * 4)
            const shardSize = shardObjects[0].data.length;
            const originalSize = shardSize * 4;

            const coder = new ErasureCoder(4, 8); // 4 data shards, 8 parity
            const reconstructed = coder.decode(shardObjects, originalSize);
            if (!reconstructed) {
                warn('Failed to reconstruct file', { fileHash }, 'vault');
                return;
            }

            // BUG EX fix: storage to disk and update vault
            // Para segmentos del social mesh, reconstruimos y re-distribuimos.
            // No guardamos el archivo completo reconstruido en disco permanentemente 
            // a menos que sea nuestro, para ahorrar espacio (Lazy Repair).
            debug('Segment reconstructed successfully', { fileHash, segIdx, size: reconstructed.length }, 'vault');

            // 5. Redistribute new shards to custodians
            await this.redistributeSegmentShards(fileHash, segIdx, reconstructed);

        } catch (err) {
            warn('File reconstruction failed', { fileHash, error: err }, 'vault');
        }
    }

    /**
     * Collects missing shards by querying connected custodians.
     */
    private static async collectMissingShards(fileHash: string, segIdx: number, missingIndices: number[]): Promise<void> {
        info('Collecting missing segments shards', { fileHash, segIdx, missingCount: missingIndices.length }, 'vault');

        const { sendSecureUDPMessage } = await import('../server/index.js');
        const { getContacts } = await import('../../storage/db.js');
        const { getMyUPeerId } = await import('../../security/identity.js');
        const contacts = await getContacts();
        const myId = getMyUPeerId();

        const custodians = contacts
            .filter(c => c.status === 'connected' && c.upeerId !== myId)
            .slice(0, 8); // Query up to 8 custodians

        if (custodians.length === 0) {
            warn('No connected custodians available for shard collection', { fileHash }, 'vault');
            return;
        }

        // Send VAULT_QUERY for each missing shard to each custodian
        const promises = [];
        for (const index of missingIndices) {
            // Enhanced CID support: shard:fileHash:segIdx:shardIdx
            const payloadHash = `shard:${fileHash}:${segIdx}:${index}`;
            for (const custodian of custodians) {
                promises.push((async () => {
                    try {
                        await sendSecureUDPMessage(custodian.address, {
                            type: 'VAULT_QUERY',
                            requesterSid: myId,
                            payloadHash
                        });
                    } catch (err: any) {
                        debug('Failed to send VAULT_QUERY', { custodian: custodian.upeerId, error: err }, 'vault');
                    }
                })());
            }
        }

        // Wait for all queries to be sent (not for responses)
        await Promise.allSettled(promises);

        // Wait a bit for responses to arrive
        await new Promise(resolve => setTimeout(resolve, 10000));
    }

    /**
     * Redistributes new shards to custodians after reconstruction.
     */
    private static async redistributeSegmentShards(fileHash: string, segIdx: number, segmentData: Buffer): Promise<void> {
        info('Redistributing segment shards after repair', { fileHash, segIdx }, 'vault');

        const coder = new ErasureCoder(4, 8);
        const shards = coder.encode(segmentData);

        const { sendSecureUDPMessage } = await import('../server/index.js');
        const { getContacts } = await import('../../storage/db.js');
        const { getMyUPeerId } = await import('../../security/identity.js');
        const contacts = await getContacts();
        const myId = getMyUPeerId();

        const custodians = contacts
            .filter(c => c.status === 'connected' && c.upeerId !== myId)
            .slice(0, 12); // Need 12 custodians total

        if (custodians.length < 4) {
            warn('Not enough custodians for redistribution', { fileHash }, 'vault');
            return;
        }

        // Assign each shard to a custodian (round-robin)
        for (let i = 0; i < shards.length; i++) {
            const shard = shards[i];
            const custodian = custodians[i % custodians.length];
            const payloadHash = `shard:${fileHash}:${segIdx}:${i}`;

            // Send VAULT_STORE with shard data
            (async () => {
                try {
                    await sendSecureUDPMessage(custodian.address, {
                        type: 'VAULT_STORE',
                        payloadHash,
                        recipientSid: '*', // Available for anyone
                        senderSid: myId,
                        priority: 2,
                        data: shard.toString('hex'),
                        expiresAt: Date.now() + VAULT_TTL_MS
                    });
                } catch (err: any) {
                    debug('Failed to redistribute shard', { custodian: custodian.upeerId, error: err }, 'vault');
                }
            })();
        }

        info('Shard redistribution completed', { fileHash, shards: shards.length, custodians: custodians.length }, 'vault');
    }
}

