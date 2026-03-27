import { getDb, eq } from './shared.js';
import { appSettings } from './schema.js';
import { info, error } from '../security/secure-logger.js';

/**
 * Obtiene el valor de una configuración por su clave.
 */
export function getAppSetting<T>(key: string, defaultValue: T): T {
    try {
        const db = getDb();
        const row = db.select()
            .from(appSettings)
            .where(eq(appSettings.key, key))
            .get();

        if (!row) return defaultValue;
        return JSON.parse(row.value) as T;
    } catch (err) {
        error(`Failed to get setting ${key}`, err, 'storage');
        return defaultValue;
    }
}

/**
 * Guarda o actualiza una configuración.
 */
export function setAppSetting(key: string, value: unknown): void {
    try {
        const db = getDb();
        const valueStr = JSON.stringify(value);

        db.insert(appSettings)
            .values({
                key,
                value: valueStr,
                updatedAt: Date.now()
            })
            .onConflictDoUpdate({
                target: appSettings.key,
                set: {
                    value: valueStr,
                    updatedAt: Date.now()
                }
            })
            .run();

        info(`Setting updated: ${key}`, {}, 'storage');
    } catch (err) {
        error(`Failed to set setting ${key}`, err, 'storage');
    }
}
