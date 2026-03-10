import { g as getDb, p as pendingOutbox, d as debug, e as eq, w as warn } from "./main-lAzLifty.js";
async function savePendingOutboxMessage(recipientSid, msgId, plaintext, replyTo) {
  const db = getDb();
  await db.insert(pendingOutbox).values({
    msgId,
    recipientSid,
    plaintext,
    replyTo: replyTo ?? null,
    createdAt: Date.now()
  });
  debug("Pending outbox: message queued", { recipientSid, msgId }, "vault");
}
async function getPendingOutboxMessages(recipientSid) {
  const db = getDb();
  return db.select().from(pendingOutbox).where(eq(pendingOutbox.recipientSid, recipientSid));
}
async function deletePendingOutboxMessage(id) {
  const db = getDb();
  await db.delete(pendingOutbox).where(eq(pendingOutbox.id, id));
}
async function flushPendingOutbox(recipientSid, recipientPublicKeyHex) {
  const messages = await getPendingOutboxMessages(recipientSid);
  if (messages.length === 0) return;
  debug("Flushing pending outbox", { recipientSid, count: messages.length }, "vault");
  const { encrypt, getMyUPeerId, sign } = await import("./main-lAzLifty.js").then((n) => n.ah);
  const { canonicalStringify } = await import("./main-lAzLifty.js").then((n) => n.ai);
  const { VaultManager } = await import("./manager-DI4fM3Sg.js");
  const myId = getMyUPeerId();
  for (const entry of messages) {
    try {
      const { ciphertext, nonce } = encrypt(
        Buffer.from(entry.plaintext, "utf-8"),
        Buffer.from(recipientPublicKeyHex, "hex"),
        false
        // siempre estática para vault — nunca ephemeral
      );
      const vaultData = {
        type: "CHAT",
        id: entry.msgId,
        content: ciphertext.toString("hex"),
        nonce: nonce.toString("hex"),
        replyTo: entry.replyTo ?? void 0
      };
      const sig = sign(Buffer.from(canonicalStringify(vaultData)));
      const innerPacket = {
        ...vaultData,
        senderRevelnestId: myId,
        signature: sig.toString("hex")
      };
      await VaultManager.replicateToVaults(recipientSid, innerPacket);
      await deletePendingOutboxMessage(entry.id);
      debug("Pending outbox: message vaulted and removed", { id: entry.id, recipientSid }, "vault");
    } catch (err) {
      warn("Pending outbox: failed to flush message", { id: entry.id, error: err }, "vault");
    }
  }
}
export {
  deletePendingOutboxMessage,
  flushPendingOutbox,
  getPendingOutboxMessages,
  savePendingOutboxMessage
};
