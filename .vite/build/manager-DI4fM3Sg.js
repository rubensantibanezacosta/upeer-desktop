import "better-sqlite3";
import "node:path";
import "node:fs";
import "sodium-native";
import { m as getContacts, d as debug, o as sendSecureUDPMessage, i as info, q as getMyUPeerId } from "./main-lAzLifty.js";
import crypto from "node:crypto";
const VAULT_TTL_MS = 60 * 24 * 60 * 60 * 1e3;
const SHARD_TTL_MS = 60 * 24 * 60 * 60 * 1e3;
const VAULT_RENEW_MS = 45 * 24 * 60 * 60 * 1e3;
const _VaultManager = class _VaultManager {
  /**
   * Replicates a chat message or metadata to multiple trusted friends' vaults.
   * This is called as a fallback when direct P2P delivery fails.
   */
  static async replicateToVaults(recipientSid, packet, ttlMs, payloadHashOverride) {
    const allContacts = await getContacts();
    const myId = getMyUPeerId();
    const candidates = allContacts.filter((c) => c.status === "connected" && c.upeerId !== myId && c.upeerId !== recipientSid).sort((a, b) => {
      const timeA = a.lastSeen ? new Date(a.lastSeen).getTime() : 0;
      const timeB = b.lastSeen ? new Date(b.lastSeen).getTime() : 0;
      return timeB - timeA;
    }).slice(0, this.MESSAGE_REPLICATION_FACTOR);
    if (candidates.length === 0) {
      debug("No friends online to act as vault", { recipientSid }, "vault");
      return 0;
    }
    const packetJson = JSON.stringify(packet);
    const payloadHash = payloadHashOverride ?? crypto.createHash("sha256").update(packetJson).digest("hex");
    const expiresAt = Date.now() + (ttlMs ?? VAULT_TTL_MS);
    const vaultPacket = {
      type: "VAULT_STORE",
      payloadHash,
      recipientSid,
      senderSid: myId,
      priority: 1,
      // High priority for text messages
      data: Buffer.from(packetJson).toString("hex"),
      expiresAt
    };
    for (const friend of candidates) {
      sendSecureUDPMessage(friend.address, vaultPacket);
    }
    info("Message replicated to vaults", {
      recipient: recipientSid,
      nodes: candidates.length,
      hash: payloadHash.slice(0, 8)
    }, "vault");
    return candidates.length;
  }
  /**
   * Queries all online friends for any messages they might be holding for us.
   * Called at startup or periodic reconnection.
   */
  static async queryOwnVaults() {
    const allContacts = await getContacts();
    const myId = getMyUPeerId();
    const onlineFriends = allContacts.filter((c) => c.status === "connected" && c.upeerId !== myId);
    if (onlineFriends.length === 0) return;
    const queryPacket = {
      type: "VAULT_QUERY",
      requesterSid: myId,
      timestamp: Date.now()
    };
    debug("Querying friends for offline messages", { friendCount: onlineFriends.length }, "vault");
    for (const friend of onlineFriends) {
      sendSecureUDPMessage(friend.address, queryPacket);
    }
  }
};
_VaultManager.MESSAGE_REPLICATION_FACTOR = 6;
let VaultManager = _VaultManager;
export {
  SHARD_TTL_MS,
  VAULT_RENEW_MS,
  VAULT_TTL_MS,
  VaultManager
};
