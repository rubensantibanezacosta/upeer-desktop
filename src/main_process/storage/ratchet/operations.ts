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
export function getRatchetSession(upeerId: string): { state: RatchetState, spkIdUsed: number | null } | null {
    const db = getDb();
    const schema = getSchema();

    const row = db.select()
        .from(schema.ratchetSessions)
        .where(eq(schema.ratchetSessions.upeerId, upeerId))
        .get() as { state: string, spkIdUsed: number | null } | undefined;

    if (!row) return null;
    try {
        const deserialized = deserializeState(JSON.parse(row.state) as SerializedRatchetState);
        // Priorizar el spkId que viene de la tabla si el JSON no lo tiene (migración suave)
        if (deserialized.spkIdUsed === null && row.spkIdUsed !== null) {
            deserialized.spkIdUsed = row.spkIdUsed;
        }
        return deserialized;
    } catch {
        return null;
    }
}

/** Guardar (crear o actualizar) la sesión ratchet de un contacto. */
export function saveRatchetSession(upeerId: string, state: RatchetState, spkIdUsed?: number | null): void {
    const db = getDb();
    const schema = getSchema();
    const now = Date.now();

    const serialized = JSON.stringify(serializeState(state, spkIdUsed));

    db.insert(schema.ratchetSessions).values({
        upeerId,
        state: serialized,
        spkIdUsed: spkIdUsed ?? null,
        establishedAt: now,
        updatedAt: now,
    }).onConflictDoUpdate({
        target: schema.ratchetSessions.upeerId,
        set: { state: serialized, spkIdUsed: spkIdUsed ?? null, updatedAt: now },
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
