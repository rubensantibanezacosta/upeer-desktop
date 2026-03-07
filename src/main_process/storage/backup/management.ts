import { getDb, getSchema, eq } from '../shared.js';
import { SurvivalKitData } from './types.js';
import { error } from '../../security/secure-logger.js';

export function getAllSurvivalKits(): Array<{
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
        kitId: schema.backupSurvivalKit.kitId,
        name: schema.backupSurvivalKit.name,
        description: schema.backupSurvivalKit.description,
        created: schema.backupSurvivalKit.created,
        expires: schema.backupSurvivalKit.expires,
        isActive: schema.backupSurvivalKit.isActive
    })
    .from(schema.backupSurvivalKit)
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

export function updateSurvivalKit(kitId: string, data: SurvivalKitData): boolean {
    const db = getDb();
    const schema = getSchema();
    
    try {
        db.update(schema.backupSurvivalKit)
            .set({ 
                data: JSON.stringify(data),
                expires: Date.now() + (60 * 24 * 60 * 60 * 1000) // Reset to 60 days
            })
            .where(eq(schema.backupSurvivalKit.kitId, kitId))
            .run();
        return true;
    } catch (err) {
        error('Failed to update survival kit', err, 'backup');
        return false;
    }
}

export function deleteSurvivalKit(kitId: string): boolean {
    const db = getDb();
    const schema = getSchema();
    
    try {
        db.delete(schema.backupSurvivalKit)
            .where(eq(schema.backupSurvivalKit.kitId, kitId))
            .run();
        return true;
    } catch (err) {
        error('Failed to delete survival kit', err, 'backup');
        return false;
    }
}

export function cleanupExpiredSurvivalKits(): number {
    const db = getDb();
    const schema = getSchema();
    
    const now = Date.now();
    // Delete inactive kits
    const inactiveResult = db.delete(schema.backupSurvivalKit)
        .where(eq(schema.backupSurvivalKit.isActive, false))
        .run();
    
    // Delete expired kits
    const expiredResult = db.delete(schema.backupSurvivalKit)
        .where(eq(schema.backupSurvivalKit.expires, now))
        .run();
    
    return (inactiveResult.changes || 0) + (expiredResult.changes || 0);
}