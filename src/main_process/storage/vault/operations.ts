import { eq, lt, sql, gt, and } from 'drizzle-orm';
import { getDb } from '../shared.js';
import { vaultStorage } from '../schema.js';

/**
 * Gets statistics about the vault storage usage.
 */
export async function getVaultStats() {
    const db = getDb();
    const result = await db.select({
        count: sql<number>`count(*)`,
        totalSize: sql<number>`sum(length(${vaultStorage.data}))`
    }).from(vaultStorage);

    const stats = result[0] || { count: 0, totalSize: 0 };
    // size is in characters, hex is 2 chars per byte
    return {
        count: Number(stats.count) || 0,
        sizeBytes: (Number(stats.totalSize) || 0) / 2
    };
}

/**
 * Gets the total storage usage (in bytes) for a specific sender.
 */
export async function getSenderUsage(senderSid: string): Promise<number> {
    const db = getDb();
    const result = await db.select({
        usage: sql<number>`sum(length(${vaultStorage.data}))`
    })
        .from(vaultStorage)
        .where(eq(vaultStorage.senderSid, senderSid))
        .get() as { usage: number };

    return (Number(result?.usage) || 0) / 2;
}

/**
 * Saves an encrypted entry (message or chunk) into the vault storage.
 * If the entry already exists, it updates the data and expiration time.
 */
export async function saveVaultEntry(
    payloadHash: string,
    recipientSid: string,
    senderSid: string,
    priority: number,
    data: string,
    expiresAt: number
) {
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

/**
 * Retrieves all vault entries intended for a specific recipient.
 * BUG AI fix: solo se retornan entradas no expiradas. Sin este filtro, entradas
 * con expiresAt en el pasado se enviaban en VAULT_DELIVERY, consumiendo ancho
 * de banda y pudiendo provocar ACK/delete prematuro de entradas válidas si se
 * producía una colisión de payloadHash. La limpieza periódica (cleanupExpiredVaultEntries)
 * se ejecuta cada 4h, creando una ventana de entrega de datos caducados.
 */
export async function getVaultEntriesForRecipient(recipientSid: string) {
    const db = getDb();
    const now = Date.now();
    return db.select().from(vaultStorage).where(
        and(
            eq(vaultStorage.recipientSid, recipientSid),
            gt(vaultStorage.expiresAt, now)
        )
    );
}

/**
 * Deletes a specific entry from the vault by its hash.
 * Returns true if an entry was actually deleted.
 */
export async function deleteVaultEntry(payloadHash: string): Promise<boolean> {
    const db = getDb();
    const result = await db.delete(vaultStorage)
        .where(eq(vaultStorage.payloadHash, payloadHash))
        .run();
    return result.changes > 0;
}

/**
 * Removes all entries that have passed their expiration timestamp.
 */
export async function cleanupExpiredVaultEntries() {
    const db = getDb();
    const now = Date.now();
    return db.delete(vaultStorage).where(lt(vaultStorage.expiresAt, now));
}

/**
 * Returns entries whose expiresAt falls within [now, now + windowMs].
 * El custodio debe replicarlas a nuevos custodios antes de que expiren.
 */
export async function getExpiringSoonEntries(windowMs: number) {
    const db = getDb();
    const now = Date.now();
    return db.select()
        .from(vaultStorage)
        .where(and(
            gt(vaultStorage.expiresAt, now),                 // no expirado aún
            lt(vaultStorage.expiresAt, now + windowMs)       // expira pronto
        ));
}

/**
 * Busca una entry del vault por su payloadHash.
 * Necesario para verificar autoría en VAULT_RENEW (BUG L fix).
 */
export async function getVaultEntryByHash(payloadHash: string) {
    const db = getDb();
    return db.select()
        .from(vaultStorage)
        .where(eq(vaultStorage.payloadHash, payloadHash))
        .get() as typeof vaultStorage.$inferSelect | undefined;
}

/**
 * Actualiza el expiresAt de una entry existente (renovación por custodio).
 */
export async function renewVaultEntry(payloadHash: string, newExpiresAt: number): Promise<boolean> {
    const db = getDb();
    // BUG G fix: `await` faltaba — sin él el Promise<boolean> nunca se resolvía
    // correctamente en la cadena de llamadas async del repair-worker.
    const result = await db.update(vaultStorage)
        .set({ expiresAt: newExpiresAt })
        .where(eq(vaultStorage.payloadHash, payloadHash))
        .run();
    return result.changes > 0;
}
