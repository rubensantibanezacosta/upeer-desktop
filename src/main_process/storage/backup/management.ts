import { getDb, getSchema, eq } from '../shared.js';
import { lt } from 'drizzle-orm';
import { SurvivalKitData as PulseSyncData } from './types.js';
import { error } from '../../security/secure-logger.js';

export function getAllPulseSyncs(): Array<{
    kitId: string;
    name: string;
    description?: string;
    created: string;
    expires: number;
    isActive: boolean;
}> {
    const db = getDb();
    const schema = getSchema();

    const results = db.select({
        kitId: schema.backupPulseSync.kitId,
        name: schema.backupPulseSync.name,
        description: schema.backupPulseSync.description,
        created: schema.backupPulseSync.created,
        expires: schema.backupPulseSync.expires,
        isActive: schema.backupPulseSync.isActive
    })
        .from(schema.backupPulseSync)
        .all();

    return results.map(r => ({
        kitId: r.kitId,
        name: r.name,
        description: r.description || undefined,
        created: r.created || '',
        expires: r.expires || 0,
        isActive: r.isActive
    }));
}

export function updatePulseSync(kitId: string, data: PulseSyncData): boolean {
    const db = getDb();
    const schema = getSchema();

    try {
        db.update(schema.backupPulseSync)
            .set({
                data: JSON.stringify(data),
                expires: Date.now() + (60 * 24 * 60 * 60 * 1000) // Reset to 60 days
            })
            .where(eq(schema.backupPulseSync.kitId, kitId))
            .run();
        return true;
    } catch (err) {
        error('Failed to update pulse sync', err, 'backup');
        return false;
    }
}

export function deletePulseSync(kitId: string): boolean {
    const db = getDb();
    const schema = getSchema();

    try {
        db.delete(schema.backupPulseSync)
            .where(eq(schema.backupPulseSync.kitId, kitId))
            .run();
        return true;
    } catch (err) {
        error('Failed to delete pulse sync', err, 'backup');
        return false;
    }
}

export function cleanupExpiredPulseSyncs(): number {
    const db = getDb();
    const schema = getSchema();

    const now = Date.now();
    // Delete inactive kits
    const inactiveResult = db.delete(schema.backupPulseSync)
        .where(eq(schema.backupPulseSync.isActive, false))
        .run();

    // lt(expires, now) borra correctamente todos los registros vencidos.
    const expiredResult = db.delete(schema.backupPulseSync)
        .where(lt(schema.backupPulseSync.expires, now))
        .run();

    return (inactiveResult.changes || 0) + (expiredResult.changes || 0);
}