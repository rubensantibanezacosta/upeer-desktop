import { getDb } from '../../storage/shared.js';
import { redundancyHealth, distributedAssets } from '../../storage/schema.js';
import { eq, sql } from 'drizzle-orm';
import { info, debug, warn } from '../../security/secure-logger.js';
import { ChunkVault } from './chunk-vault.js';
import { VAULT_TTL_MS, VAULT_RENEW_MS } from './manager.js';
import { getExpiringSoonEntries, renewVaultEntry } from '../../storage/vault/operations.js';
import fs from 'node:fs/promises';

/**
 * RepairWorker ensures the long-term health of distributed files.
 * It uses "Lazy Sync" to avoid unnecessary network traffic.
 */
export class RepairWorker {
    private static INTERVAL = 1000 * 60 * 60 * 4; // Check every 4 hours
    private static REPAIR_THRESHOLD = 6; // Repair if shards online <= 6 (RS 4+8)
    private static running = false;

    static start() {
        if (this.running) return;
        this.running = true;

        info('Vault Repair Worker started (Lazy Mode)', { interval: '4h' }, 'vault');

        // Initial delay to avoid startup congestion
        setTimeout(() => this.runMaintenance(), 1000 * 60 * 10);

        setInterval(() => this.runMaintenance(), this.INTERVAL);
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
    private static async renewExpiring(): Promise<void> {
        // Ventana: entries que expiran en < 15 días (VAULT_TTL_MS - VAULT_RENEW_MS)
        const windowMs = VAULT_TTL_MS - VAULT_RENEW_MS; // 15 días
        try {
            const expiringSoon = await getExpiringSoonEntries(windowMs);
            if (expiringSoon.length === 0) return;

            info('Renewing expiring vault entries', { count: expiringSoon.length }, 'vault');

            const { sendSecureUDPMessage } = await import('../server.js');
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
        info('Repairing degraded asset', { fileHash }, 'vault');

        try {
            const db = getDb();
            // 2. Try to find the original file locally to re-distribute
            // (In a full implementation, we would download 4 shards if we don't have it)
            const shards = await db.select()
                .from(distributedAssets)
                .where(eq(distributedAssets.fileHash, fileHash));

            if (shards.length === 0) return;

            // For MVP: We only repair if we have the file buffer or temp path recorded
            // or if we can find it in our local storage.
            // This is "Lazy" because it prioritizes local resources.

            // TODO: Implementation of shard-based reconstruction for repair
            debug('Shard-based reconstruction for repair not yet implemented', { fileHash }, 'vault');

        } catch (err) {
            warn('Repair failed for asset', { fileHash, error: err }, 'vault');
        }
    }
}

