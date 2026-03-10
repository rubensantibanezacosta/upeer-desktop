import { g as getDb, v as vaultStorage, l as lt, e as eq, h as and, j as gt, k as sql } from "./main-lAzLifty.js";
async function getVaultStats() {
  const db = getDb();
  const result = await db.select({
    count: sql`count(*)`,
    totalSize: sql`sum(length(${vaultStorage.data}))`
  }).from(vaultStorage);
  const stats = result[0] || { count: 0, totalSize: 0 };
  return {
    count: Number(stats.count) || 0,
    sizeBytes: (Number(stats.totalSize) || 0) / 2
  };
}
async function getSenderUsage(senderSid) {
  const db = getDb();
  const result = await db.select({
    usage: sql`sum(length(${vaultStorage.data}))`
  }).from(vaultStorage).where(eq(vaultStorage.senderSid, senderSid)).get();
  return (Number(result == null ? void 0 : result.usage) || 0) / 2;
}
async function saveVaultEntry(payloadHash, recipientSid, senderSid, priority, data, expiresAt) {
  const db = getDb();
  return db.insert(vaultStorage).values({
    payloadHash,
    recipientSid,
    senderSid,
    priority,
    data,
    expiresAt
  }).onConflictDoUpdate({
    target: vaultStorage.payloadHash,
    set: { data, expiresAt }
  });
}
async function getVaultEntriesForRecipient(recipientSid) {
  const db = getDb();
  const now = Date.now();
  return db.select().from(vaultStorage).where(
    and(
      eq(vaultStorage.recipientSid, recipientSid),
      gt(vaultStorage.expiresAt, now)
    )
  );
}
async function deleteVaultEntry(payloadHash) {
  const db = getDb();
  const result = await db.delete(vaultStorage).where(eq(vaultStorage.payloadHash, payloadHash)).run();
  return result.changes > 0;
}
async function cleanupExpiredVaultEntries() {
  const db = getDb();
  const now = Date.now();
  return db.delete(vaultStorage).where(lt(vaultStorage.expiresAt, now));
}
async function getExpiringSoonEntries(windowMs) {
  const db = getDb();
  const now = Date.now();
  return db.select().from(vaultStorage).where(and(
    gt(vaultStorage.expiresAt, now),
    // no expirado aún
    lt(vaultStorage.expiresAt, now + windowMs)
    // expira pronto
  ));
}
async function getVaultEntryByHash(payloadHash) {
  const db = getDb();
  return db.select().from(vaultStorage).where(eq(vaultStorage.payloadHash, payloadHash)).get();
}
async function renewVaultEntry(payloadHash, newExpiresAt) {
  const db = getDb();
  const result = await db.update(vaultStorage).set({ expiresAt: newExpiresAt }).where(eq(vaultStorage.payloadHash, payloadHash)).run();
  return result.changes > 0;
}
export {
  cleanupExpiredVaultEntries,
  deleteVaultEntry,
  getExpiringSoonEntries,
  getSenderUsage,
  getVaultEntriesForRecipient,
  getVaultEntryByHash,
  getVaultStats,
  renewVaultEntry,
  saveVaultEntry
};
