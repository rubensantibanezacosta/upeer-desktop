import { g as getDb, e as eq, t as error, b as getSchema, l as lt, m as getContacts, u as getMessageStatus, x as updateMessageStatus, y as deleteMessagesByChatId, z as deleteGroup, A as getContactByRevelnestId, B as getMessageById } from "./main-lAzLifty.js";
import { C, h, D, E, F, G, H, I, J, K, L, M, N, O, P, Q, R, S, T, U, W, X, Y, Z, _, $, a0, a1, a2, a3, a4, a5, a6, a7, a8, a9, aa, ab, ac, ad, ae, af, ag } from "./main-lAzLifty.js";
import crypto from "node:crypto";
import { cleanupExpiredVaultEntries, deleteVaultEntry, getExpiringSoonEntries, getSenderUsage, getVaultEntriesForRecipient, getVaultEntryByHash, getVaultStats, renewVaultEntry, saveVaultEntry } from "./operations-H0fA7MW9.js";
import { g, a, t, u } from "./asset-operations-DymvH6mt.js";
function createSurvivalKit(name, description) {
  const db = getDb();
  const schema = getSchema();
  const kitId = crypto.randomUUID();
  const now = Date.now();
  const expires = now + 60 * 24 * 60 * 60 * 1e3;
  const allContacts = db.select().from(schema.contacts).all();
  const activeContacts = allContacts.filter(
    (c) => c.status === "connected" && c.dhtSignature && c.dhtExpiresAt && c.dhtExpiresAt > now
  );
  const topContacts = activeContacts.sort((a10, b) => {
    const aLastSeen = a10.lastSeen ? new Date(a10.lastSeen).getTime() : 0;
    const bLastSeen = b.lastSeen ? new Date(b.lastSeen).getTime() : 0;
    return bLastSeen - aLastSeen;
  }).slice(0, 10).map((c) => ({
    upeerId: c.upeerId || "",
    name: c.name,
    publicKey: c.publicKey || "",
    locationBlock: {
      address: c.address,
      dhtSeq: c.dhtSeq || 0,
      signature: c.dhtSignature || "",
      expiresAt: c.dhtExpiresAt || 0
      // Note: renewal tokens not stored in contacts yet
    },
    lastSeen: c.lastSeen ? new Date(c.lastSeen).getTime() : now
  }));
  const renewalTokens = [];
  const kitData = {
    version: "1.0",
    myRevelnestId: "",
    // Will be filled by caller
    myPublicKey: "",
    // Will be filled by caller
    timestamp: now,
    contacts: topContacts,
    renewalTokens
  };
  db.insert(schema.backupSurvivalKit).values({
    kitId,
    name,
    description,
    data: JSON.stringify(kitData),
    expires,
    isActive: true
  }).run();
  return kitId;
}
function getSurvivalKit(kitId) {
  const db = getDb();
  const schema = getSchema();
  const result = db.select().from(schema.backupSurvivalKit).where(eq(schema.backupSurvivalKit.kitId, kitId)).get();
  if (!result) return null;
  try {
    return JSON.parse(result.data);
  } catch (err) {
    error("Failed to parse survival kit data", err, "backup");
    return null;
  }
}
function getAllSurvivalKits() {
  const db = getDb();
  const schema = getSchema();
  const results = db.select({
    kitId: schema.backupSurvivalKit.kitId,
    name: schema.backupSurvivalKit.name,
    description: schema.backupSurvivalKit.description,
    created: schema.backupSurvivalKit.created,
    expires: schema.backupSurvivalKit.expires,
    isActive: schema.backupSurvivalKit.isActive
  }).from(schema.backupSurvivalKit).all();
  return results.map((r) => ({
    kitId: r.kitId,
    name: r.name,
    description: r.description || void 0,
    created: r.created || "",
    expires: r.expires || 0,
    isActive: r.isActive
  }));
}
function updateSurvivalKit(kitId, data) {
  const db = getDb();
  const schema = getSchema();
  try {
    db.update(schema.backupSurvivalKit).set({
      data: JSON.stringify(data),
      expires: Date.now() + 60 * 24 * 60 * 60 * 1e3
      // Reset to 60 days
    }).where(eq(schema.backupSurvivalKit.kitId, kitId)).run();
    return true;
  } catch (err) {
    error("Failed to update survival kit", err, "backup");
    return false;
  }
}
function deleteSurvivalKit(kitId) {
  const db = getDb();
  const schema = getSchema();
  try {
    db.delete(schema.backupSurvivalKit).where(eq(schema.backupSurvivalKit.kitId, kitId)).run();
    return true;
  } catch (err) {
    error("Failed to delete survival kit", err, "backup");
    return false;
  }
}
function cleanupExpiredSurvivalKits() {
  const db = getDb();
  const schema = getSchema();
  const now = Date.now();
  const inactiveResult = db.delete(schema.backupSurvivalKit).where(eq(schema.backupSurvivalKit.isActive, false)).run();
  const expiredResult = db.delete(schema.backupSurvivalKit).where(lt(schema.backupSurvivalKit.expires, now)).run();
  return (inactiveResult.changes || 0) + (expiredResult.changes || 0);
}
export {
  C as addOrUpdateContact,
  h as and,
  D as blockContact,
  cleanupExpiredSurvivalKits,
  cleanupExpiredVaultEntries,
  E as clearUserData,
  F as closeDB,
  G as computeKeyFingerprint,
  H as countRecentVouchesByFrom,
  createSurvivalKit,
  I as deleteContact,
  deleteGroup,
  J as deleteMessageLocally,
  deleteMessagesByChatId,
  K as deleteReaction,
  deleteSurvivalKit,
  deleteVaultEntry,
  L as desc,
  eq,
  getAllSurvivalKits,
  g as getAssetHealth,
  a as getAssetShards,
  M as getBlockedContacts,
  N as getContactByAddress,
  getContactByRevelnestId,
  getContacts,
  getExpiringSoonEntries,
  O as getGroupById,
  P as getGroups,
  getMessageById,
  getMessageStatus,
  Q as getMessages,
  getSenderUsage,
  getSurvivalKit,
  getVaultEntriesForRecipient,
  getVaultEntryByHash,
  getVaultStats,
  R as getVouchIds,
  S as getVouchesByIds,
  T as getVouchesForNode,
  U as initDB,
  W as insertVouch,
  X as isContactBlocked,
  Y as or,
  renewVaultEntry,
  Z as saveFileMessage,
  _ as saveGroup,
  $ as saveMessage,
  a0 as saveReaction,
  saveVaultEntry,
  t as trackDistributedAsset,
  a1 as unblockContact,
  u as updateAssetHealth,
  a2 as updateContactAvatar,
  a3 as updateContactDhtLocation,
  a4 as updateContactEphemeralPublicKey,
  a5 as updateContactLocation,
  a6 as updateContactName,
  a7 as updateContactPublicKey,
  a8 as updateContactSignedPreKey,
  a9 as updateContactStatus,
  aa as updateGroupAvatar,
  ab as updateGroupInfo,
  ac as updateGroupMembers,
  ad as updateGroupStatus,
  ae as updateLastSeen,
  af as updateMessageContent,
  updateMessageStatus,
  updateSurvivalKit,
  ag as vouchExists
};
