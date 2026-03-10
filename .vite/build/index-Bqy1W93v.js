import { g as getDb, e as eq, b as getSchema } from "./main-lAzLifty.js";
import { deserializeState, serializeState } from "./ratchet-CVCdiEOM.js";
function getRatchetSession(upeerId) {
  const db = getDb();
  const schema = getSchema();
  const row = db.select().from(schema.ratchetSessions).where(eq(schema.ratchetSessions.upeerId, upeerId)).get();
  if (!row) return null;
  try {
    return deserializeState(JSON.parse(row.state));
  } catch {
    return null;
  }
}
function saveRatchetSession(upeerId, state, spkIdUsed) {
  const db = getDb();
  const schema = getSchema();
  const now = Date.now();
  const serialized = JSON.stringify(serializeState(state));
  db.insert(schema.ratchetSessions).values({
    upeerId,
    state: serialized,
    spkIdUsed: spkIdUsed ?? null,
    establishedAt: now,
    updatedAt: now
  }).onConflictDoUpdate({
    target: schema.ratchetSessions.upeerId,
    set: { state: serialized, updatedAt: now }
  }).run();
}
function deleteRatchetSession(upeerId) {
  const db = getDb();
  const schema = getSchema();
  db.delete(schema.ratchetSessions).where(eq(schema.ratchetSessions.upeerId, upeerId)).run();
}
export {
  deleteRatchetSession,
  getRatchetSession,
  saveRatchetSession
};
