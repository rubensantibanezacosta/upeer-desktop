import { eq } from 'drizzle-orm';
import { getDb } from '../shared.js';
import { distributedAssets, redundancyHealth } from '../schema.js';

/**
 * Tracks a distributed file shard and its custodian.
 */
export async function trackDistributedAsset(
    fileHash: string,
    cid: string,
    shardIndex: number,
    totalShards: number,
    custodianSid: string,
    segmentIndex: number = 0
) {
    const db = getDb();
    return db.insert(distributedAssets).values({
        fileHash,
        cid,
        shardIndex,
        totalShards,
        custodianSid,
        segmentIndex,
        lastVerified: Date.now()
    }).onConflictDoUpdate({
        target: distributedAssets.cid,
        set: { status: 'active', lastVerified: Date.now() }
    });
}

/**
 * Retrieves the health status of a distributed asset.
 */
export async function getAssetHealth(assetHash: string) {
    const db = getDb();
    const results = await db.select().from(redundancyHealth).where(eq(redundancyHealth.assetHash, assetHash));
    return results[0] || null;
}

/**
 * Updates or creates a redundancy health report for an asset.
 */
export async function updateAssetHealth(
    assetHash: string,
    availableShards: number,
    requiredShards: number,
    healthStatus: string
) {
    const db = getDb();
    return db.insert(redundancyHealth).values({
        assetHash,
        availableShards,
        requiredShards,
        healthStatus,
        lastCheck: Date.now()
    }).onConflictDoUpdate({
        target: redundancyHealth.assetHash,
        set: {
            availableShards,
            requiredShards,
            healthStatus,
            lastCheck: Date.now()
        }
    });
}

/**
 * Gets all shards tracked for a specific file hash.
 */
export async function getAssetShards(fileHash: string) {
    const db = getDb();
    return db.select().from(distributedAssets).where(eq(distributedAssets.fileHash, fileHash));
}
