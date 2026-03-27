import { info } from '../../security/secure-logger.js';
import { runLazyVaultMaintenance, renewExpiringVaultEntries } from './repairWorkerMaintenance.js';
import {
    collectMissingVaultShards,
    reconstructVaultSegment,
    redistributeVaultSegmentShards,
    repairVaultAsset,
} from './repairWorkerRepair.js';

type DistributedShard = {
    shardIndex: number;
    data: string;
    segmentIndex?: number | null;
};

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
        await renewExpiringVaultEntries();
    }

    private static async runMaintenance() {
        await runLazyVaultMaintenance(this.REPAIR_THRESHOLD, () => this.renewExpiring(), (fileHash) => this.repairAsset(fileHash));
    }

    private static async repairAsset(fileHash: string) {
        await repairVaultAsset(
            fileHash,
            (assetHash, segIdx, shards) => this.reconstructSegment(assetHash, segIdx, shards),
            (assetHash, segIdx, missingIndices) => this.collectMissingShards(assetHash, segIdx, missingIndices)
        );
    }

    /**
     * Reconstructs original file segment from shards.
     */
    private static async reconstructSegment(fileHash: string, segIdx: number, shards: DistributedShard[]): Promise<void> {
        await reconstructVaultSegment(fileHash, segIdx, shards, (assetHash, segmentIndex, segmentData) => this.redistributeSegmentShards(assetHash, segmentIndex, segmentData));
    }

    /**
     * Collects missing shards by querying connected custodians.
     */
    private static async collectMissingShards(fileHash: string, segIdx: number, missingIndices: number[]): Promise<void> {
        await collectMissingVaultShards(fileHash, segIdx, missingIndices);
    }

    /**
     * Redistributes new shards to custodians after reconstruction.
     */
    private static async redistributeSegmentShards(fileHash: string, segIdx: number, segmentData: Buffer): Promise<void> {
        await redistributeVaultSegmentShards(fileHash, segIdx, segmentData);
    }
}

