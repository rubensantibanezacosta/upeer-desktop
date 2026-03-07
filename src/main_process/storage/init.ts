import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import path from 'node:path';
import * as schema from './schema.js';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { info, error } from '../security/secure-logger.js';
import { setDatabase } from './shared.js';

export async function initDB(userDataPath: string) {
    const dbPath = path.join(userDataPath, 'p2p-chat.db');
    const sqlite = new Database(dbPath);
    const db = drizzle(sqlite, { schema });

    // Canonical Migration System
    try {
        // En desarrollo (tsx/etc) process.cwd(), en prod/electron process.resourcesPath
        // Intentamos detectar dónde están las migraciones
        let migrationsPath = path.join(process.cwd(), 'drizzle');

        // Si estamos en Electron, podemos ser más precisos
        try {
            const { app: electronApp } = await import('electron');
            if (electronApp?.isPackaged) {
                migrationsPath = path.join(process.resourcesPath, 'drizzle');
            }
        } catch (e) {
            // No estamos en Electron o no podemos importar app, usamos el fallback de cwd
        }

        migrate(db, { migrationsFolder: migrationsPath });
        info('Migraciones aplicadas correctamente', {}, 'db');
    } catch (err) {
        error('Error en migraciones', err, 'db');
    }

    // Set the shared database instance
    setDatabase(db, sqlite);
    
    return { db, sqlite };
}

import { closeDatabase } from './shared.js';

export function closeDB() {
    closeDatabase();
}