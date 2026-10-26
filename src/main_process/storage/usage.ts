import fs from 'node:fs/promises';
import path from 'node:path';
import { eq, sql } from 'drizzle-orm';
import { getDb } from './shared.js';
import { messages } from './schema.js';
import { getVaultStats } from './vault/operations.js';
import { warn as logWarn } from '../security/secure-logger.js';

export interface StorageUsage {
    ownBytes: number;
    databaseBytes: number;
    attachmentsBytes: number;
    backupsBytes: number;
    attachmentCount: number;
    messageCount: number;
    vaultBytes: number;
    vaultEntries: number;
}

const DATABASE_FILES = ['p2p-chat.db', 'p2p-chat.db-wal', 'p2p-chat.db-shm'];
const BACKUP_PATTERN = /^p2p-chat\.db\.(backup-\d{4}-\d{2}-\d{2}|pre-restore-\d+)$/;

async function measureFile(filePath: string): Promise<number> {
    const stat = await fs.stat(filePath).catch(() => null);
    return stat?.isFile() ? stat.size : 0;
}

async function measureDirectory(dirPath: string): Promise<{ bytes: number; files: number }> {
    const entries = await fs.readdir(dirPath, { withFileTypes: true }).catch(() => null);
    if (!entries) return { bytes: 0, files: 0 };

    let bytes = 0;
    let files = 0;
    for (const entry of entries) {
        const entryPath = path.join(dirPath, entry.name);
        if (entry.isDirectory()) {
            const nested = await measureDirectory(entryPath);
            bytes += nested.bytes;
            files += nested.files;
        } else if (entry.isFile()) {
            bytes += await measureFile(entryPath);
            files += 1;
        }
    }
    return { bytes, files };
}

async function measureDatabase(userDataPath: string): Promise<number> {
    let bytes = 0;
    for (const name of DATABASE_FILES) {
        bytes += await measureFile(path.join(userDataPath, name));
    }
    return bytes;
}

async function measureBackups(userDataPath: string): Promise<number> {
    const entries = await fs.readdir(userDataPath, { withFileTypes: true }).catch(() => null);
    if (!entries) return 0;

    let bytes = 0;
    for (const entry of entries) {
        if (!entry.isFile() || !BACKUP_PATTERN.test(entry.name)) continue;
        bytes += await measureFile(path.join(userDataPath, entry.name));
    }
    return bytes;
}

async function countMessages(): Promise<number> {
    try {
        const rows = await getDb()
            .select({ total: sql<number>`count(*)` })
            .from(messages)
            .where(eq(messages.isDeleted, false));
        return Number(rows[0]?.total) || 0;
    } catch (error) {
        logWarn('No se pudo contar los mensajes guardados', { err: String(error) }, 'storage');
        return 0;
    }
}

export async function getStorageUsage(userDataPath: string): Promise<StorageUsage> {
    const [databaseBytes, backupsBytes, attachments, vault, messageCount] = await Promise.all([
        measureDatabase(userDataPath),
        measureBackups(userDataPath),
        measureDirectory(path.join(userDataPath, 'assets')),
        getVaultStats(),
        countMessages(),
    ]);

    return {
        ownBytes: databaseBytes + backupsBytes + attachments.bytes,
        databaseBytes,
        attachmentsBytes: attachments.bytes,
        backupsBytes,
        attachmentCount: attachments.files,
        messageCount,
        vaultBytes: vault.sizeBytes,
        vaultEntries: vault.count,
    };
}
