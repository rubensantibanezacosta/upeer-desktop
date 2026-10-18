import { beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { adoptLegacyDrizzleSchema } from '../../../src/main_process/storage/legacy-drizzle-adoption.js';

const migrationsPath = path.resolve('drizzle');
const baseline = JSON.parse(fs.readFileSync(path.join(migrationsPath, 'meta/0002_snapshot.json'), 'utf8')) as {
    tables: Record<string, { columns: Record<string, unknown> }>;
};

function createLegacyDatabase(hasMigrationsTable = false) {
    const migrationRecords: Array<{ hash: string; createdAt: number }> = [];
    const existingTables = new Set(Object.keys(baseline.tables));
    if (hasMigrationsTable) existingTables.add('__drizzle_migrations');
    const tableColumns = Object.fromEntries(
        Object.entries(baseline.tables).map(([tableName, table]) => [tableName, new Set(Object.keys(table.columns))]),
    );
    for (const column of ['is_favorite']) tableColumns.contacts?.add(column);
    for (const column of ['epoch', 'sender_key', 'sender_key_created_at', 'is_favorite']) tableColumns.groups?.add(column);
    const run = vi.fn((...params: unknown[]) => {
        migrationRecords.push({ hash: String(params[0]), createdAt: Number(params[1]) });
    });
    const sqlite = {
        prepare: vi.fn((query: string) => ({
            get: vi.fn((tableName?: unknown) => {
                if (query.includes('sqlite_master')) return existingTables.has(String(tableName)) ? { name: tableName } : undefined;
                if (query.includes('__drizzle_migrations')) return hasMigrationsTable || migrationRecords[0] ? { id: 1 } : undefined;
                return undefined;
            }),
            all: vi.fn(() => []),
            run,
        })),
        pragma: vi.fn((query: string) => {
            const tableName = query.match(/table_info\("(.+)"\)/)?.[1]?.replaceAll('""', '"') ?? '';
            if (tableName === 'groups' && !tableColumns.groups?.has('member_public_keys')) return [...(tableColumns.groups ?? [])].map((name) => ({ name }));
            return [...(tableColumns[tableName] ?? [])].map((name) => ({ name }));
        }),
        exec: vi.fn((query: string) => {
            if (query.includes('CREATE TABLE IF NOT EXISTS __drizzle_migrations')) existingTables.add('__drizzle_migrations');
        }),
    };
    return { sqlite, migrationRecords, existingTables, run };
}

describe('legacy Drizzle schema adoption', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('records the existing legacy baseline so startup can apply only pending migrations', () => {
        const { sqlite, migrationRecords, existingTables } = createLegacyDatabase();

        expect(adoptLegacyDrizzleSchema(sqlite, migrationsPath)).toBe(true);
        expect(existingTables.has('__drizzle_migrations')).toBe(true);
        expect(migrationRecords).toHaveLength(1);
        expect(migrationRecords[0]?.createdAt).toBe(1774026000000);
    });

    it('does not adopt when the database already has migration history', () => {
        const { sqlite, run } = createLegacyDatabase(true);

        expect(adoptLegacyDrizzleSchema(sqlite, migrationsPath)).toBe(false);
        expect(run).not.toHaveBeenCalled();
    });

    it('does not adopt an incomplete or newer schema', () => {
        const { sqlite, existingTables } = createLegacyDatabase();
        existingTables.delete('contacts');

        expect(adoptLegacyDrizzleSchema(sqlite, migrationsPath)).toBe(false);
        expect(existingTables.has('__drizzle_migrations')).toBe(false);
    });
});