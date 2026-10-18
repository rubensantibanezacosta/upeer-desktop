import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

type SqliteDatabase = {
    prepare(sql: string): {
        get(...params: unknown[]): unknown;
        all(...params: unknown[]): Array<Record<string, unknown>>;
        run(...params: unknown[]): unknown;
    };
    pragma(sql: string): Array<Record<string, unknown>>;
    exec(sql: string): unknown;
};

type MigrationJournal = {
    entries: Array<{ tag: string; when: number }>;
};

type Snapshot = {
    tables: Record<string, { columns: Record<string, unknown> }>;
};

function tableExists(sqlite: SqliteDatabase, tableName: string): boolean {
    return Boolean(sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(tableName));
}

function hasSnapshotTables(sqlite: SqliteDatabase, snapshot: Snapshot): boolean {
    return Object.entries(snapshot.tables).every(([tableName, table]) => {
        if (!tableExists(sqlite, tableName)) return false;
        const columns = new Set(sqlite.pragma(`table_info("${tableName.replaceAll('"', '""')}")`).map((column) => String(column.name)));
        return Object.keys(table.columns).every((columnName) => columns.has(columnName));
    });
}

function hasLegacySchema(sqlite: SqliteDatabase, snapshot: Snapshot): boolean {
    if (!hasSnapshotTables(sqlite, snapshot)) return false;
    const contacts = new Set(sqlite.pragma('table_info("contacts")').map((column) => String(column.name)));
    const groups = new Set(sqlite.pragma('table_info("groups")').map((column) => String(column.name)));
    const ratchetSessions = new Set(sqlite.pragma('table_info("ratchet_sessions")').map((column) => String(column.name)));
    return contacts.has('is_favorite')
        && groups.has('epoch')
        && groups.has('sender_key')
        && groups.has('sender_key_created_at')
        && groups.has('is_favorite')
        && !groups.has('member_public_keys')
        && !ratchetSessions.has('context_id')
        && !tableExists(sqlite, 'backup_survival_kit');
}

function recordMigration(sqlite: SqliteDatabase, migrationsPath: string, journal: MigrationJournal, tag: string): void {
    const entry = journal.entries.find((migration) => migration.tag === tag);
    if (!entry) throw new Error(`Drizzle journal is missing ${tag}`);
    const migrationSql = fs.readFileSync(path.join(migrationsPath, `${tag}.sql`), 'utf8');
    const hash = crypto.createHash('sha256').update(migrationSql).digest('hex');
    sqlite.prepare('INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)').run(hash, entry.when);
}

export function adoptLegacyDrizzleSchema(sqlite: SqliteDatabase, migrationsPath: string): boolean {
    const migrationsTableExists = tableExists(sqlite, '__drizzle_migrations');
    if (migrationsTableExists && sqlite.prepare('SELECT id FROM __drizzle_migrations LIMIT 1').get()) return false;

    const baselineSnapshot = JSON.parse(fs.readFileSync(path.join(migrationsPath, 'meta', '0002_snapshot.json'), 'utf8')) as Snapshot;
    if (!hasLegacySchema(sqlite, baselineSnapshot)) return false;

    const journal = JSON.parse(fs.readFileSync(path.join(migrationsPath, 'meta', '_journal.json'), 'utf8')) as MigrationJournal;
    sqlite.exec(`CREATE TABLE IF NOT EXISTS __drizzle_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, hash text NOT NULL, created_at numeric)`);
    recordMigration(sqlite, migrationsPath, journal, '0005_group_favorites');
    return true;
}