import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sodium from 'sodium-native';
import { closeDatabase, getSqlite } from './shared.js';
import { stopDatabaseBackupScheduler } from './backup.js';
import { resetIdentityForEmptyDevice } from '../security/identity.js';
import { fileTransferManager } from '../network/file-transfer/transfer-manager.js';
import { metadataSanitizer } from '../network/file-transfer/metadata-sanitizer.js';

const ACCOUNT_FILES = [
    'identity.alias',
    'identity.avatar',
    'identity.key',
    'identity.enc',
    'identity.key.legacy-bak',
    'identity.mnemonic.enc',
    'identity.mnemonic_mode',
    'session.locked',
    'spk.enc',
    'backup_survival_kit.json',
];

const ACCOUNT_TABLES = [
    'messages',
    'reactions',
    'contacts',
    'groups',
    'backup_pulse_sync',
    'vault_storage',
    'distributed_assets',
    'redundancy_health',
    'reputation_vouches',
    'ratchet_sessions',
    'pending_outbox',
    'devices',
];

const ACCOUNT_SETTINGS = [
    'security.pin.hash',
    'security.pin.enabled',
    'security.pin.failedAttempts',
    'security.pin.lockedUntil',
    'backup.survivalKit',
    'backup.survivalKit.encrypted',
    'identity.mnemonic',
];

function eraseDeviceKey(userDataPath: string): void {
    const keyPath = path.join(userDataPath, 'device.key');
    if (!fs.existsSync(keyPath)) return;
    const key = fs.readFileSync(keyPath);
    sodium.sodium_memzero(key);
    fs.rmSync(keyPath, { force: true });
}

async function removeOwnedTempFiles(): Promise<void> {
    const tempRoot = path.resolve(os.tmpdir());
    const transfers = fileTransferManager.getAllTransfers();
    const ownedFiles = transfers
        .flatMap((transfer) => [transfer.tempPath, transfer.sanitizedPath])
        .filter((filePath): filePath is string => typeof filePath === 'string');

    for (const transfer of transfers) {
        fileTransferManager.cancelTransfer(transfer.fileId, transfer.direction, 'account data deleted');
    }
    fileTransferManager.store.clear();
    for (const key of fileTransferManager.transferKeys.values()) {
        key.fill(0);
    }
    fileTransferManager.transferKeys.clear();
    fileTransferManager.transferLocks.clear();

    for (const filePath of ownedFiles) {
        const resolvedPath = path.resolve(filePath);
        if (resolvedPath.startsWith(`${tempRoot}${path.sep}`)) {
            fs.rmSync(resolvedPath, { force: true });
        }
    }

    await metadataSanitizer.cleanupAll();
    const tempEntries = await fsPromises.readdir(tempRoot, { withFileTypes: true });
    for (const entry of tempEntries) {
        if (entry.isDirectory() && entry.name.startsWith('upeer-')) {
            await fsPromises.rm(path.join(tempRoot, entry.name), { recursive: true, force: true });
        }
    }
}

function removeAccountFiles(userDataPath: string): void {
    for (const name of ACCOUNT_FILES) {
        fs.rmSync(path.join(userDataPath, name), { force: true });
    }

    for (const entry of fs.readdirSync(userDataPath, { withFileTypes: true })) {
        if (/^p2p-chat\.db\.backup-\d{4}-\d{2}-\d{2}$/.test(entry.name)) {
            fs.rmSync(path.join(userDataPath, entry.name), { force: true });
        }
    }

    fs.rmSync(path.join(userDataPath, 'assets'), { recursive: true, force: true });
}

export async function deleteAllUserData(userDataPath: string): Promise<void> {
    const sqlite = getSqlite();
    if (!sqlite) throw new Error('Database is not initialized');

    await removeOwnedTempFiles();
    stopDatabaseBackupScheduler();
    eraseDeviceKey(userDataPath);
    sqlite.exec('PRAGMA secure_delete = ON');
    sqlite.exec('PRAGMA wal_checkpoint(TRUNCATE)');
    sqlite.transaction(() => {
        for (const table of ACCOUNT_TABLES) {
            sqlite.exec(`DELETE FROM "${table}"`);
        }
        for (const key of ACCOUNT_SETTINGS) {
            sqlite.exec(`DELETE FROM app_settings WHERE key = '${key}'`);
        }
    })();
    sqlite.exec('VACUUM');
    sqlite.exec('PRAGMA wal_checkpoint(TRUNCATE)');

    eraseDeviceKey(userDataPath);
    removeAccountFiles(userDataPath);
    for (const entry of fs.readdirSync(userDataPath, { withFileTypes: true })) {
        if (/^p2p-chat\.db\.backup-\d{4}-\d{2}-\d{2}$/.test(entry.name)) {
            fs.rmSync(path.join(userDataPath, entry.name), { force: true });
        }
    }

    closeDatabase();
    fs.rmSync(path.join(userDataPath, 'p2p-chat.db'), { force: true });
    fs.rmSync(path.join(userDataPath, 'p2p-chat.db-wal'), { force: true });
    fs.rmSync(path.join(userDataPath, 'p2p-chat.db-shm'), { force: true });
    fs.rmSync(path.join(userDataPath, 'p2p-chat.db-journal'), { force: true });
    const identityFlags = [
        'identity.mnemonic_mode',
        'identity.mnemonic-mode',
        'identity.mode',
    ];
    for (const flag of identityFlags) {
        fs.rmSync(path.join(userDataPath, flag), { force: true });
    }
    for (const entry of fs.readdirSync(userDataPath, { withFileTypes: true })) {
        if (/^p2p-chat\.db\.backup-\d{4}-\d{2}-\d{2}$/.test(entry.name)) {
            fs.rmSync(path.join(userDataPath, entry.name), { force: true });
        }
    }
    fs.rmSync(path.join(userDataPath, 'dht_state.json'), { force: true });
    resetIdentityForEmptyDevice(userDataPath);
}