/**
 * Operaciones de base de datos para sesiones Double Ratchet.
 * La tabla `ratchet_sessions` está protegida por SQLCipher.
 */
import { getDb, getSchema, eq } from '../shared.js';
import {
    serializeState,
    deserializeState,
    type RatchetState,
    type SerializedRatchetState,
} from '../../security/ratchet.js';

/** Cargar la sesión ratchet de un contacto, o null si no existe. */
export function getRatchetSession(upeerId: string): RatchetState | null {
    const db = getDb();
    const schema = getSchema();

    const row = db.select()
        .from(schema.ratchetSessions)
        .where(eq(schema.ratchetSessions.upeerId, upeerId))
        .get() as { state: string } | undefined;

    if (!row) return null;
    try {
        return deserializeState(JSON.parse(row.state) as SerializedRatchetState);
    } catch {
        return null;
    }
}

/** Guardar (crear o actualizar) la sesión ratchet de un contacto. */
export function saveRatchetSession(upeerId: string, state: RatchetState, spkIdUsed?: number): void {
    const db = getDb();
    const schema = getSchema();
    const now = Date.now();

    const serialized = JSON.stringify(serializeState(state));

    db.insert(schema.ratchetSessions).values({
        upeerId,
        state: serialized,
        spkIdUsed: spkIdUsed ?? null,
        establishedAt: now,
        updatedAt: now,
    }).onConflictDoUpdate({
        target: schema.ratchetSessions.upeerId,
        set: { state: serialized, updatedAt: now },
    }).run();
}

/** Eliminar la sesión ratchet (reset de sesión). */
export function deleteRatchetSession(upeerId: string): void {
    const db = getDb();
    const schema = getSchema();
    db.delete(schema.ratchetSessions)
        .where(eq(schema.ratchetSessions.upeerId, upeerId))
        .run();
}
