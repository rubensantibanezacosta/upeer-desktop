import { drizzle } from 'drizzle-orm/better-sqlite3';
import BetterSqlite3 from 'better-sqlite3-multiple-ciphers';
// SQLCipher está disponible via better-sqlite3-multiple-ciphers (drop‑in replacement).
import path from 'node:path';
import fs from 'node:fs';
import sodium from 'sodium-native';
import * as schema from './schema.js';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { error } from '../security/secure-logger.js';
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
    const k = Buffer.alloc(sodium.crypto_secretbox_KEYBYTES);
    sodium.randombytes_buf(k);
    fs.writeFileSync(p, k, { mode: 0o600 });
    return k;
}

function _deriveDbKey(deviceKey: Buffer): Buffer {
    const dbKey = Buffer.alloc(32);
    sodium.crypto_generichash(dbKey, Buffer.from('upeer-db-sqlcipher-v1'), deviceKey);
    return dbKey;
}

export async function initDB(userDataPath: string) {
    const dbPath = path.join(userDataPath, 'p2p-chat.db');

    const deviceKey = _getOrCreateDeviceKey(userDataPath);
    const dbKey = _deriveDbKey(deviceKey);
    const dbKeyHex = dbKey.toString('hex');
    sodium.sodium_memzero(deviceKey);

    const sqlite = new BetterSqlite3(dbPath);

    let isEncrypted = false;
    try {
        sqlite.prepare('SELECT count(*) FROM sqlite_master').get();
        isEncrypted = false;
    } catch (err: any) {
        if (err.message.includes('not a database') || err.code === 'SQLITE_NOTADB') {
            isEncrypted = true;
        } else {
            error('Unexpected error checking database encryption', err, 'db');
            throw err;
        }
    }

    try {
        if (!isEncrypted) {
            sqlite.pragma(`rekey = "x'${dbKeyHex}'"`);
        } else {
            sqlite.pragma(`key = "x'${dbKeyHex}'"`);
        }

        sqlite.pragma('cipher_memory_security = ON');
        sqlite.pragma('cipher_page_size = 4096');
        sqlite.pragma('kdf_iter = 1000000');
        sqlite.pragma('cipher_header_check = ON');
    } catch (err) {
        error('Failed to apply SQLCipher key/rekey', err, 'db');
        throw new Error('SQLCipher initialization failed');
    }

    try {
        sqlite.pragma('cipher_version');
        sqlite.prepare('SELECT count(*) FROM sqlite_master').get();
    } catch (err) {
        error('SQLCipher not active - encryption not available', err, 'db');
        throw new Error('SQLCipher not available');
    }

    sodium.sodium_memzero(dbKey);

    const db = drizzle(sqlite, { schema });

    try {
        let migrationsPath = path.join(process.cwd(), 'drizzle');

        try {
            const { app: electronApp } = await import('electron');
            if (electronApp?.isPackaged) {
                migrationsPath = path.join(process.resourcesPath, 'drizzle');
            }
        } catch (_e) {
            // Ignored, might be running in a test environment without electron
        }

        migrate(db, { migrationsFolder: migrationsPath });
    } catch (err) {
        error('Error en migraciones', err, 'db');
    }

    setDatabase(db, sqlite);

    _runOneTimeMigrations(sqlite);

    try {
        performDatabaseBackup(userDataPath);
        scheduleBackups(userDataPath, 24);
    } catch (err) {
        error('Failed to initialize backup system', err, 'db');
    }

    return { db, sqlite };
}

import { closeDatabase } from './shared.js';
import { performDatabaseBackup, scheduleBackups } from './backup.js';
import type BetterSqlite3Type from 'better-sqlite3-multiple-ciphers';

function _runOneTimeMigrations(sqlite: InstanceType<typeof BetterSqlite3Type>) {
    sqlite.exec(`CREATE TABLE IF NOT EXISTS _app_flags (key TEXT PRIMARY KEY, value TEXT NOT NULL)`);

    const sealedFixed = sqlite.prepare(`SELECT value FROM _app_flags WHERE key = 'sealed_crypto_fixed'`).get() as { value: string } | undefined;
    if (!sealedFixed) {
        sqlite.prepare(`DELETE FROM ratchet_sessions`).run();
        sqlite.prepare(`INSERT INTO _app_flags (key, value) VALUES ('sealed_crypto_fixed', '1')`).run();
    }

    const drRecoveryV2 = sqlite.prepare(`SELECT value FROM _app_flags WHERE key = 'dr_recovery_v2'`).get() as { value: string } | undefined;
    if (!drRecoveryV2) {
        sqlite.prepare(`DELETE FROM ratchet_sessions`).run();
        sqlite.prepare(`INSERT INTO _app_flags (key, value) VALUES ('dr_recovery_v2', '1')`).run();
    }

    const spkRotationFix = sqlite.prepare(`SELECT value FROM _app_flags WHERE key = 'spk_rotation_fix'`).get() as { value: string } | undefined;
    if (!spkRotationFix) {
        sqlite.prepare(`DELETE FROM ratchet_sessions`).run();
        sqlite.prepare(`UPDATE contacts SET signed_pre_key = NULL, signed_pre_key_sig = NULL, signed_pre_key_id = NULL`).run();
        sqlite.prepare(`INSERT INTO _app_flags (key, value) VALUES ('spk_rotation_fix', '1')`).run();
    }
}

export function closeDB() {
    closeDatabase();
}