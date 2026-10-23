import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    closeDatabase: vi.fn(),
    getSqlite: vi.fn(),
    stopDatabaseBackupScheduler: vi.fn(),
    resetIdentityForEmptyDevice: vi.fn(),
    getAllTransfers: vi.fn(() => []),
    cancelTransfer: vi.fn(),
    cleanupAll: vi.fn(async () => undefined),
    rmSync: vi.fn(),
    existsSync: vi.fn(() => false),
    readdirSync: vi.fn(() => []),
}));

vi.mock('node:fs', () => ({
    default: {
        rmSync: mocks.rmSync,
        existsSync: mocks.existsSync,
        readdirSync: mocks.readdirSync,
    },
}));

vi.mock('../../../src/main_process/storage/shared.js', () => ({
    closeDatabase: mocks.closeDatabase,
    getSqlite: mocks.getSqlite,
}));

vi.mock('../../../src/main_process/storage/backup.js', () => ({
    stopDatabaseBackupScheduler: mocks.stopDatabaseBackupScheduler,
}));

vi.mock('../../../src/main_process/security/identity.js', () => ({
    resetIdentityForEmptyDevice: mocks.resetIdentityForEmptyDevice,
}));

vi.mock('../../../src/main_process/network/file-transfer/transfer-manager.js', () => ({
    fileTransferManager: {
        getAllTransfers: mocks.getAllTransfers,
        cancelTransfer: mocks.cancelTransfer,
        store: { clear: vi.fn() },
        transferKeys: new Map(),
        transferLocks: new Map(),
    },
}));

vi.mock('../../../src/main_process/network/file-transfer/metadata-sanitizer.js', () => ({
    metadataSanitizer: { cleanupAll: mocks.cleanupAll },
}));

describe('deleteAllUserData', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        const sqlite = {
            exec: vi.fn(),
            transaction: vi.fn((callback: () => void) => callback),
        };
        mocks.getSqlite.mockReturnValue(sqlite);
    });

    it('removes account tables, files, backups and identity while preserving the running database service', async () => {
        const { deleteAllUserData } = await import('../../../src/main_process/storage/delete-all-user-data.js');
        await deleteAllUserData('/user-data');

        const sqlite = mocks.getSqlite.mock.results[0].value;
        expect(sqlite.exec).toHaveBeenCalledWith('DELETE FROM "vault_storage"');
        expect(sqlite.exec).toHaveBeenCalledWith('DELETE FROM "messages"');
        expect(mocks.stopDatabaseBackupScheduler).toHaveBeenCalledOnce();
        expect(mocks.closeDatabase).toHaveBeenCalledOnce();
        expect(mocks.resetIdentityForEmptyDevice).toHaveBeenCalledWith('/user-data');
        expect(mocks.rmSync).toHaveBeenCalledWith('/user-data/assets', { recursive: true, force: true });
        expect(mocks.rmSync).toHaveBeenCalledWith('/user-data/p2p-chat.db', { force: true });
        expect(mocks.rmSync).toHaveBeenCalledWith('/user-data/yggstack.conf', { force: true });
        expect(mocks.rmSync).toHaveBeenCalledWith('/user-data/account-public.enc', { force: true });
        expect(mocks.rmSync).toHaveBeenCalledWith('/user-data/device-identity.enc', { force: true });
        expect(mocks.rmSync).toHaveBeenCalledWith('/user-data/device-spk.enc', { force: true });
    });
});