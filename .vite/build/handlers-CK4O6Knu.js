import { renewVaultEntry, deleteVaultEntry, getVaultEntriesForRecipient, getSenderUsage, saveVaultEntry } from "./operations-H0fA7MW9.js";
import { w as warn, d as debug, c as issueVouch, V as VouchType, s as security, n as network, f as computeScore } from "./main-lAzLifty.js";
import { VAULT_TTL_MS } from "./manager-DI4fM3Sg.js";
const VAULT_DELIVERY_PAGE_SIZE = 50;
async function handleVaultStore(senderSid, data, fromAddress, sendResponse) {
  if (!data.payloadHash || !data.recipientSid || !data.data) {
    warn("Invalid VAULT_STORE packet", { senderSid }, "vault");
    return;
  }
  if (data.priority > 3) {
    security("Invalid vault priority from peer", { senderSid, priority: data.priority }, "vault");
    return;
  }
  const { getContacts: _getContactsForScore } = await import("./db-Cln22U_j.js");
  const _allContacts = _getContactsForScore();
  const _directIds = new Set(
    _allContacts.filter((c) => c.status === "connected" && c.upeerId).map((c) => c.upeerId)
  );
  const vouchScore = computeScore(senderSid, _directIds);
  if (vouchScore < 30) {
    security("Refusing vault storage for untrusted node", { senderSid, vouchScore }, "vault");
    return;
  }
  let quota = 5 * 1024 * 1024;
  if (vouchScore >= 80) {
    quota = 1e3 * 1024 * 1024;
  } else if (vouchScore >= 65) {
    quota = 100 * 1024 * 1024;
  }
  const currentUsage = await getSenderUsage(senderSid);
  const incomingSize = data.data.length / 2;
  if (currentUsage + incomingSize > quota) {
    warn("Vault quota exceeded for sender", { senderSid, usage: currentUsage, quota, incoming: incomingSize }, "vault");
    return;
  }
  try {
    const safeExpiresAt = Math.min(data.expiresAt, Date.now() + VAULT_TTL_MS);
    await saveVaultEntry(
      data.payloadHash,
      data.recipientSid,
      senderSid,
      // ← senderSid autenticado por firma exterior, no data.senderSid
      data.priority,
      data.data,
      safeExpiresAt
    );
    debug("Vault entry saved", { hash: data.payloadHash, recipient: data.recipientSid }, "vault");
    if (fromAddress && sendResponse) {
      sendResponse(fromAddress, {
        type: "VAULT_ACK",
        payloadHashes: [data.payloadHash]
      });
    }
  } catch (err) {
    warn("Failed to save vault entry", { hash: data.payloadHash, error: err }, "vault");
  }
}
async function handleVaultQuery(senderSid, data, fromAddress, sendResponse) {
  if (senderSid !== data.requesterSid) {
    security("Unauthorized vault query attempt", {
      sender: senderSid,
      target: data.requesterSid,
      ip: fromAddress
    }, "vault");
    return;
  }
  try {
    const allEntries = await getVaultEntriesForRecipient(data.requesterSid);
    if (allEntries.length > 0) {
      const offset = data.offset ?? 0;
      const page = allEntries.slice(offset, offset + VAULT_DELIVERY_PAGE_SIZE);
      const hasMore = offset + VAULT_DELIVERY_PAGE_SIZE < allEntries.length;
      network("Delivering vault entries", void 0, {
        recipient: data.requesterSid,
        count: page.length,
        hasMore
      }, "vault");
      sendResponse(fromAddress, {
        type: "VAULT_DELIVERY",
        entries: page,
        hasMore,
        nextOffset: hasMore ? offset + VAULT_DELIVERY_PAGE_SIZE : void 0
      });
    }
  } catch (err) {
    warn("Vault query processing failed", { error: err }, "vault");
  }
}
async function handleVaultAck(senderSid, data) {
  if (!Array.isArray(data.payloadHashes)) return;
  for (const hash of data.payloadHashes) {
    const entry = await (await import("./index-CoL40wUv.js")).getVaultEntryByHash(hash);
    if (!entry) {
      debug("Received VAULT_ACK for unknown entry, rewarding custodian", { hash, custodian: senderSid }, "vault");
      issueVouch(senderSid, VouchType.VAULT_CHUNK).catch(() => {
      });
      continue;
    }
    if (entry.recipientSid !== senderSid) {
      security("VAULT_ACK de no-destinatario — ignorado", { hash, sender: senderSid, recipient: entry.recipientSid }, "vault");
      issueVouch(senderSid, VouchType.MALICIOUS).catch(() => {
      });
      continue;
    }
    const deleted = await deleteVaultEntry(hash);
    if (deleted) {
      debug("Vault entry cleared after delivery ACK", { hash, from: senderSid }, "vault");
      issueVouch(senderSid, VouchType.VAULT_RETRIEVED).catch(() => {
      });
    }
  }
}
async function handleVaultRenew(senderSid, data) {
  if (!data.payloadHash || typeof data.newExpiresAt !== "number") {
    warn("Invalid VAULT_RENEW packet", { senderSid }, "vault");
    return;
  }
  const maxExpiry = Date.now() + VAULT_TTL_MS;
  const safeExpiry = Math.min(data.newExpiresAt, maxExpiry);
  const renewed = await renewVaultEntry(data.payloadHash, safeExpiry);
  if (renewed) {
    debug("Vault entry TTL extended by VAULT_RENEW", { hash: data.payloadHash.slice(0, 8), from: senderSid }, "vault");
  } else {
    debug("VAULT_RENEW for unknown entry, ignoring", { hash: data.payloadHash.slice(0, 8), from: senderSid }, "vault");
  }
}
export {
  handleVaultAck,
  handleVaultQuery,
  handleVaultRenew,
  handleVaultStore
};
