import { drizzle } from 'drizzle-orm/better-sqlite3';
// @journeyapps/sqlcipher no exporta tipos de clase compatibles con InstanceType;
// usamos any para sqlite y conservamos tipado fuerte solo para drizzle.
import * as schema from './schema.js';
import { eq, desc, or, and } from 'drizzle-orm';
import { warn, error } from '../security/secure-logger.js';

// Shared database instance
let sqlite: any | null = null;
let db: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function setDatabase(instance: ReturnType<typeof drizzle<typeof schema>>, sqliteInstance: any) {
    db = instance;
    sqlite = sqliteInstance;
}

export function getDb() {
    if (!db) {
        throw new Error('Database not initialized. Call initDB first.');
    }
    return db;
}

export function getSqlite() {
    return sqlite;
}

export function getSchema() {
    return schema;
}

export function closeDatabase() {
    if (sqlite) {
        sqlite.close();
        sqlite = null;
        db = null;
    }
}

/**
 * Borra todos los datos del usuario actual (contactos, mensajes, reacciones, grupos).
 * Se llama al cambiar de cuenta para que el nuevo usuario no vea datos ajenos.
 * NO borra vault_storage ni backup_survival_kit (datos de otros peers).
 */
export function clearUserData(): void {
    if (!sqlite) return;
    sqlite.exec('DELETE FROM messages');
    sqlite.exec('DELETE FROM reactions');
    sqlite.exec('DELETE FROM contacts');
    sqlite.exec('DELETE FROM groups');
    sqlite.exec('DELETE FROM distributed_assets');
    sqlite.exec('DELETE FROM redundancy_health');
    // Bug EZ fix: limpiar material criptográfico sensible al cambiar de cuenta.
    // ratchet_sessions contiene claves DH privadas; pending_outbox contiene plaintexts.
    sqlite.exec('DELETE FROM ratchet_sessions');
    sqlite.exec('DELETE FROM pending_outbox');
    sqlite.exec('DELETE FROM reputation_vouches');
}

/**
 * Ejecuta una función dentro de una transacción SQLite.
 * Si la función lanza un error, la transacción se revierte y el error se relanza.
 * Devuelve el valor devuelto por la función.
 */
export function runTransaction<T>(fn: () => T): T {
    const sqliteInstance = getSqlite();
    if (!sqliteInstance) {
        throw new Error('Database not initialized');
    }
    
    // Begin transaction
    sqliteInstance.exec('BEGIN TRANSACTION');
    
    try {
        const result = fn();
        sqliteInstance.exec('COMMIT');
        return result;
    } catch (err) {
        sqliteInstance.exec('ROLLBACK');
        error('Transaction failed, rolled back', err, 'db');
        throw err;
    }
}

export { eq, desc, or, and };