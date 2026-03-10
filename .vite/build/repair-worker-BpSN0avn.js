import { i as info, w as warn, d as debug, g as getDb, r as redundancyHealth, e as eq, a as distributedAssets } from "./main-lAzLifty.js";
import { VAULT_TTL_MS, VAULT_RENEW_MS } from "./manager-DI4fM3Sg.js";
import { getExpiringSoonEntries, renewVaultEntry } from "./operations-H0fA7MW9.js";
const _RepairWorker = class _RepairWorker {
  static start() {
    if (this.running) return;
    this.running = true;
    info("Vault Repair Worker started (Lazy Mode)", { interval: "4h" }, "vault");
    setTimeout(() => this.runMaintenance(), 1e3 * 60 * 10);
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
  static async renewExpiring() {
    const windowMs = VAULT_TTL_MS - VAULT_RENEW_MS;
    try {
      const expiringSoon = await getExpiringSoonEntries(windowMs);
      if (expiringSoon.length === 0) return;
      info("Renewing expiring vault entries", { count: expiringSoon.length }, "vault");
      const { sendSecureUDPMessage } = await import("./main-lAzLifty.js").then((n) => n.aj);
      const { getContacts } = await import("./db-Cln22U_j.js");
      const { getMyUPeerId } = await import("./main-lAzLifty.js").then((n) => n.ah);
      const allContacts = await getContacts();
      const myId = getMyUPeerId();
      for (const entry of expiringSoon) {
        const newExpiresAt = Date.now() + VAULT_TTL_MS;
        await renewVaultEntry(entry.payloadHash, newExpiresAt);
        const custodians = allContacts.filter((c) => c.status === "connected" && c.upeerId !== myId && c.upeerId !== entry.recipientSid).slice(0, 6);
        for (const c of custodians) {
          sendSecureUDPMessage(c.address, {
            type: "VAULT_RENEW",
            payloadHash: entry.payloadHash,
            newExpiresAt
          });
        }
      }
    } catch (err) {
      warn("Vault renewal cycle failed", { error: err }, "vault");
    }
  }
  static async runMaintenance() {
    debug("Running lazy vault maintenance...", {}, "vault");
    await this.renewExpiring();
    try {
      const db = getDb();
      const degradedAssets = await db.select().from(redundancyHealth).where(eq(redundancyHealth.healthStatus, "degraded"));
      for (const asset of degradedAssets) {
        if (asset.availableShards <= this.REPAIR_THRESHOLD) {
          await this.repairAsset(asset.assetHash);
        }
      }
    } catch (err) {
      warn("Vault maintenance cycle failed", { error: err }, "vault");
    }
  }
  static async repairAsset(fileHash) {
    info("Repairing degraded asset", { fileHash }, "vault");
    try {
      const db = getDb();
      const shards = await db.select().from(distributedAssets).where(eq(distributedAssets.fileHash, fileHash));
      if (shards.length === 0) return;
      debug("Shard-based reconstruction for repair not yet implemented", { fileHash }, "vault");
    } catch (err) {
      warn("Repair failed for asset", { fileHash, error: err }, "vault");
    }
  }
};
_RepairWorker.INTERVAL = 1e3 * 60 * 60 * 4;
_RepairWorker.REPAIR_THRESHOLD = 6;
_RepairWorker.running = false;
let RepairWorker = _RepairWorker;
export {
  RepairWorker
};
