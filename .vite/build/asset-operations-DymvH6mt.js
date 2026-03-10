import { g as getDb, a as distributedAssets, r as redundancyHealth, e as eq } from "./main-lAzLifty.js";
async function trackDistributedAsset(fileHash, cid, shardIndex, totalShards, custodianSid) {
  const db = getDb();
  return db.insert(distributedAssets).values({
    fileHash,
    cid,
    shardIndex,
    totalShards,
    custodianSid,
    lastVerified: Date.now()
  }).onConflictDoUpdate({
    target: distributedAssets.cid,
    set: { status: "active", lastVerified: Date.now() }
  });
}
async function getAssetHealth(assetHash) {
  const db = getDb();
  const results = await db.select().from(redundancyHealth).where(eq(redundancyHealth.assetHash, assetHash));
  return results[0] || null;
}
async function updateAssetHealth(assetHash, availableShards, requiredShards, healthStatus) {
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
async function getAssetShards(fileHash) {
  const db = getDb();
  return db.select().from(distributedAssets).where(eq(distributedAssets.fileHash, fileHash));
}
export {
  getAssetShards as a,
  getAssetHealth as g,
  trackDistributedAsset as t,
  updateAssetHealth as u
};
