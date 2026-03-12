import { drizzle } from 'drizzle-orm/better-sqlite3';
import BetterSqlite3 from 'better-sqlite3-multiple-ciphers';
// SQLCipher está disponible via better-sqlite3-multiple-ciphers (drop‑in replacement).
import path from 'node:path';
import fs from 'node:fs';
import sodium from 'sodium-native';
import * as schema from './schema.js';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { info, error } from '../security/secure-logger.js';
import { setDatabase } from './shared.js';

// ── SQLCipher key derivation ──────────────────────────────────────────────────
// Derived from a per-device random key (always available, even before mnemonic
// unlock). This protects the DB file against theft/copy to another machine.
// The mnemonic provides a higher layer of protection for the identity keys in
// memory; SQLCipher adds protection for data at rest on this specific device.
const DEVICE_KEY_FILE = 'device.key';

function _getOrCreateDeviceKey(userDataPath: string): Buffer {
    const p = path.join(userDataPath, DEVICE_KEY_FILE);
    if (fs.existsSync(p)) {
        const k = fs.readFileSync(p);
        if (k.length === sodium.crypto_secretbox_KEYBYTES) return k;
    }
    const k = Buffer.allocUnsafe(sodium.crypto_secretbox_KEYBYTES);
    sodium.randombytes_buf(k);
    fs.writeFileSync(p, k, { mode: 0o600 });
    return k;
}

/** Derive a 32-byte SQLCipher key from the device key using BLAKE2b. */
function _deriveDbKey(deviceKey: Buffer): Buffer {
    const dbKey = Buffer.alloc(32);
    sodium.crypto_generichash(dbKey, Buffer.from('upeer-db-sqlcipher-v1'), deviceKey);
    return dbKey;
}

export async function initDB(userDataPath: string) {
    const dbPath = path.join(userDataPath, 'p2p-chat.db');

    // Derive SQLCipher encryption key from device key
    const deviceKey = _getOrCreateDeviceKey(userDataPath);
    const dbKey = _deriveDbKey(deviceKey);
    const dbKeyHex = dbKey.toString('hex');
    sodium.sodium_memzero(deviceKey); // wipe device key from memory ASAP

    const sqlite = new BetterSqlite3(dbPath);
    
    // Detect if database is already encrypted by trying to read without key
    let isEncrypted = false;
    try {
        sqlite.prepare('SELECT count(*) FROM sqlite_master').get();
        info('Database is not encrypted, will encrypt now', {}, 'db');
        isEncrypted = false;
    } catch (err: any) {
        if (err.message.includes('not a database') || err.code === 'SQLITE_NOTADB') {
            // Likely encrypted
            info('Database appears to be encrypted', {}, 'db');
            isEncrypted = true;
        } else {
            error('Unexpected error checking database encryption', err, 'db');
            throw err;
        }
    }
    
    // Apply encryption: rekey for unencrypted DB, key for already encrypted
    try {
        if (!isEncrypted) {
            sqlite.pragma(`rekey = "x'${dbKeyHex}'"`);
            info('Database encrypted with rekey', {}, 'db');
        } else {
            sqlite.pragma(`key = "x'${dbKeyHex}'"`);
            info('Encryption key applied', {}, 'db');
        }
    } catch (err) {
        error('Failed to apply SQLCipher key/rekey', err, 'db');
        throw new Error('SQLCipher initialization failed');
    }
    
    // Verify encryption is active and we can read
    try {
        const cipherResult = sqlite.pragma('cipher_version');
        info('SQLCipher active', { cipherResult }, 'db');
        // Test read access
        sqlite.prepare('SELECT count(*) FROM sqlite_master').get();
        info('Database accessible with encryption key', {}, 'db');
    } catch (err) {
        error('SQLCipher not active - encryption not available', err, 'db');
        throw new Error('SQLCipher not available');
    }
    
    sodium.sodium_memzero(dbKey); // wipe DB key from memory

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

    // Failsafe: asegurar que las columnas del schema existen aunque el rastreador de Drizzle
    // las haya marcado como aplicadas sin haberlas creado realmente.
    try {
        const cols = sqlite.prepare('PRAGMA table_info(contacts)').all() as Array<{ name: string }>;
        const names = new Set(cols.map(c => c.name));
        if (!names.has('known_addresses')) {
            sqlite.exec("ALTER TABLE contacts ADD COLUMN known_addresses TEXT NOT NULL DEFAULT '[]'");
            info('Columna known_addresses añadida por migración de emergencia', {}, 'db');
        }
        if (!names.has('avatar')) {
            sqlite.exec('ALTER TABLE contacts ADD COLUMN avatar TEXT');
            info('Columna avatar añadida por migración de emergencia', {}, 'db');
        }
        if (!names.has('renewal_token')) {
            sqlite.exec('ALTER TABLE contacts ADD COLUMN renewal_token TEXT');
        }
        if (!names.has('blocked_at')) {
            sqlite.exec('ALTER TABLE contacts ADD COLUMN blocked_at TEXT');
            info('Columna blocked_at añadida por migración de emergencia', {}, 'db');
        }
        if (!names.has('ephemeral_public_key_updated_at')) {
            sqlite.exec('ALTER TABLE contacts ADD COLUMN ephemeral_public_key_updated_at TEXT');
            info('Columna ephemeral_public_key_updated_at añadida por migración de emergencia', {}, 'db');
        }
        // ── Double Ratchet: SPK del contacto ─────────────────────────────────
        if (!names.has('signed_pre_key')) {
            sqlite.exec('ALTER TABLE contacts ADD COLUMN signed_pre_key TEXT');
            info('Columna signed_pre_key añadida por migración de emergencia', {}, 'db');
        }
        if (!names.has('signed_pre_key_sig')) {
            sqlite.exec('ALTER TABLE contacts ADD COLUMN signed_pre_key_sig TEXT');
        }
        if (!names.has('signed_pre_key_id')) {
            sqlite.exec('ALTER TABLE contacts ADD COLUMN signed_pre_key_id INTEGER');
        }
    } catch (e) {
        error('Error en migración de emergencia de columnas', e, 'db');
    }

    // Failsafe para tabla groups
    try {
        const gcols = sqlite.prepare('PRAGMA table_info(groups)').all() as Array<{ name: string }>;
        const gnames = new Set(gcols.map(c => c.name));
        if (!gnames.has('avatar')) {
            sqlite.exec('ALTER TABLE groups ADD COLUMN avatar TEXT');
            info('Columna avatar añadida a groups por migración de emergencia', {}, 'db');
        }
    } catch (e) {
        error('Error en migración de emergencia de columnas de groups', e, 'db');
    }

    // ── Double Ratchet: tabla de sesiones ratchet ─────────────────────────────
    try {
        sqlite.exec(`
            CREATE TABLE IF NOT EXISTS ratchet_sessions (
                upeer_id TEXT PRIMARY KEY NOT NULL,
                state TEXT NOT NULL,
                spk_id_used INTEGER,
                established_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            )
        `);
        info('Tabla ratchet_sessions asegurada', {}, 'db');
    } catch (e) {
        error('Error asegurando tabla ratchet_sessions', e, 'db');
    }

    try {
        sqlite.exec(`
            CREATE TABLE IF NOT EXISTS reputation_vouches (
                id TEXT PRIMARY KEY NOT NULL,
                from_id TEXT NOT NULL,
                to_id TEXT NOT NULL,
                type TEXT NOT NULL,
                positive INTEGER NOT NULL,
                timestamp INTEGER NOT NULL,
                signature TEXT NOT NULL,
                received_at INTEGER NOT NULL
            )
        `);
        sqlite.exec('CREATE INDEX IF NOT EXISTS rep_vouches_to_idx ON reputation_vouches (to_id)');
        sqlite.exec('CREATE INDEX IF NOT EXISTS rep_vouches_from_idx ON reputation_vouches (from_id)');
        sqlite.exec('CREATE INDEX IF NOT EXISTS rep_vouches_ts_idx ON reputation_vouches (timestamp)');
        info('Tabla reputation_vouches asegurada', {}, 'db');
    } catch (e) {
        error('Error asegurando tabla reputation_vouches', e, 'db');
    }

    // ── Pending Outbox: mensajes en espera de clave pública ──────────────────
    try {
        sqlite.exec(`
            CREATE TABLE IF NOT EXISTS pending_outbox (
                id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
                msg_id TEXT NOT NULL DEFAULT '',
                recipient_sid TEXT NOT NULL,
                plaintext TEXT NOT NULL,
                reply_to TEXT,
                created_at INTEGER NOT NULL
            )
        `);
        sqlite.exec('CREATE INDEX IF NOT EXISTS pending_outbox_recipient_idx ON pending_outbox (recipient_sid)');
        info('Tabla pending_outbox asegurada', {}, 'db');
    } catch (e) {
        error('Error asegurando tabla pending_outbox', e, 'db');
    }

    // Failsafe columna msg_id en pending_outbox (para installs anteriores)
    try {
        const pocols = sqlite.prepare('PRAGMA table_info(pending_outbox)').all() as Array<{ name: string }>;
        const ponames = new Set(pocols.map(c => c.name));
        if (!ponames.has('msg_id')) {
            sqlite.exec("ALTER TABLE pending_outbox ADD COLUMN msg_id TEXT NOT NULL DEFAULT ''");
            info('Columna msg_id añadida a pending_outbox por migración de emergencia', {}, 'db');
        }
    } catch (e) {
        error('Error en migración de emergencia de pending_outbox.msg_id', e, 'db');
    }

    // Set the shared database instance
    setDatabase(db, sqlite);

    // ── Backup automático de la base de datos ───────────────────────────────────
    try {
        // Realizar backup si no hay uno hoy
        performDatabaseBackup(userDataPath);
        
        // Programar backups diarios (se ejecutará en 24 horas)
        // Nota: el intervalo se mantiene activo mientras la app esté ejecutándose.
        // En una app Electron, esto es aceptable porque la app puede estar días abierta.
        // Si la app se cierra, el timer se cancela automáticamente.
        scheduleBackups(userDataPath, 24);
        
        info('Database backup system initialized', {}, 'db');
    } catch (err) {
        // No fallar la inicialización si el backup falla
        error('Failed to initialize backup system', err, 'db');
    }

    return { db, sqlite };
}

import { closeDatabase } from './shared.js';
import { performDatabaseBackup, scheduleBackups } from './backup.js';

export function closeDB() {
    closeDatabase();
}