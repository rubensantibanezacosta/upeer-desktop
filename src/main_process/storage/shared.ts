import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import * as schema from './schema.js';
import { eq, desc, or, and } from 'drizzle-orm';

// Shared database instance
let sqlite: Database.Database | null = null;
let db: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function setDatabase(instance: ReturnType<typeof drizzle<typeof schema>>, sqliteInstance: Database.Database) {
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

export { eq, desc, or, and };