import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const mocks = vi.hoisted(() => ({
    getVaultStats: vi.fn(),
    select: vi.fn(),
}));

vi.mock('../../../src/main_process/storage/shared.js', () => ({
    getDb: () => ({ select: mocks.select }),
}));

vi.mock('../../../src/main_process/storage/vault/operations.js', () => ({
    getVaultStats: mocks.getVaultStats,
}));

import { getStorageUsage } from '../../../src/main_process/storage/usage.js';

function mockMessageCount(total: number) {
    mocks.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([{ total }]),
        }),
    });
}

async function writeFile(target: string, bytes: number) {
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, Buffer.alloc(bytes, 1));
}

describe('Storage - Uso de disco', () => {
    let userDataPath: string;

    beforeEach(async () => {
        vi.clearAllMocks();
        userDataPath = await fs.mkdtemp(path.join(os.tmpdir(), 'upeer-usage-'));
        mocks.getVaultStats.mockResolvedValue({ count: 4, sizeBytes: 2048 });
        mockMessageCount(12);
    });

    afterEach(async () => {
        await fs.rm(userDataPath, { recursive: true, force: true });
    });

    it('suma base de datos, adjuntos y copias de seguridad', async () => {
        await writeFile(path.join(userDataPath, 'p2p-chat.db'), 1000);
        await writeFile(path.join(userDataPath, 'p2p-chat.db-wal'), 200);
        await writeFile(path.join(userDataPath, 'p2p-chat.db-shm'), 32);
        await writeFile(path.join(userDataPath, 'assets', 'a.bin'), 300);
        await writeFile(path.join(userDataPath, 'assets', 'nested', 'b.bin'), 100);
        await writeFile(path.join(userDataPath, 'p2p-chat.db.backup-2024-01-01'), 500);
        await writeFile(path.join(userDataPath, 'irrelevant.txt'), 9999);

        const usage = await getStorageUsage(userDataPath);

        expect(usage.databaseBytes).toBe(1232);
        expect(usage.attachmentsBytes).toBe(400);
        expect(usage.attachmentCount).toBe(2);
        expect(usage.backupsBytes).toBe(500);
        expect(usage.ownBytes).toBe(2132);
        expect(usage.messageCount).toBe(12);
        expect(usage.vaultBytes).toBe(2048);
        expect(usage.vaultEntries).toBe(4);
    });

    it('devuelve ceros cuando el directorio no tiene datos de uPeer', async () => {
        mocks.getVaultStats.mockResolvedValue({ count: 0, sizeBytes: 0 });
        mockMessageCount(0);

        const usage = await getStorageUsage(userDataPath);

        expect(usage.ownBytes).toBe(0);
        expect(usage.attachmentsBytes).toBe(0);
        expect(usage.backupsBytes).toBe(0);
        expect(usage.messageCount).toBe(0);
    });

    it('tolera un directorio de usuario inexistente', async () => {
        mockMessageCount(0);
        const usage = await getStorageUsage(path.join(userDataPath, 'missing'));

        expect(usage.ownBytes).toBe(0);
        expect(usage.attachmentCount).toBe(0);
    });
});
