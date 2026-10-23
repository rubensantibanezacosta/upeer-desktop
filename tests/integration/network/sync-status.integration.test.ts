import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

vi.mock('electron', () => ({
    BrowserWindow: {
        getAllWindows: vi.fn(() => [{ webContents: { send: vi.fn() } }]),
    },
    app: {
        isPackaged: false,
        getPath: () => '/tmp',
        getAppPath: () => process.cwd(),
    },
}));

const upeerId = 'aa'.repeat(32);
const deviceA = 'b'.repeat(64);
const deviceB = 'c'.repeat(64);

describe('estado de sincronización con SQLite real', () => {
    let dir: string;
    let peers: typeof import('../../../src/main_process/storage/sync/peers.js');
    let events: typeof import('../../../src/main_process/storage/sync/events.js');
    let status: typeof import('../../../src/main_process/storage/sync/status.js');

    beforeAll(async () => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'upeer-sync-status-'));
        const { initDB } = await import('../../../src/main_process/storage/init.js');
        await initDB(dir);
        peers = await import('../../../src/main_process/storage/sync/peers.js');
        events = await import('../../../src/main_process/storage/sync/events.js');
        status = await import('../../../src/main_process/storage/sync/status.js');
        for (const deviceId of [deviceA, deviceB]) {
            peers.upsertSyncPeer({
                deviceId,
                upeerId,
                devicePublicKey: 'd'.repeat(64),
                deviceCertificate: '{}',
                deviceSignedPreKey: 'e'.repeat(64),
                deviceSignedPreKeySignature: 'f'.repeat(128),
                deviceSignedPreKeyId: 1,
                address: '200::1',
                lastSeen: 1,
            });
        }
    });

    afterAll(async () => {
        const { closeDB } = await import('../../../src/main_process/storage/init.js');
        closeDB();
        fs.rmSync(dir, { recursive: true, force: true });
    });

    const record = (eventId: string, sequence: number, entityId: string) => {
        events.recordSyncEvent({
            eventId,
            originDeviceId: '9'.repeat(64),
            kind: 'MESSAGE_UPSERT',
            occurredAt: sequence,
            sequence,
            payload: JSON.stringify({ id: entityId }),
            entityId,
            direction: 'outbound',
            appliedAt: sequence,
        });
    };

    it('marca los mensajes pendientes hasta que todos los dispositivos confirman', () => {
        record('e1', 1, 'message-1');
        record('e2', 2, 'message-2');

        const pending = status.getSyncStatus(upeerId);
        expect(pending.state).toBe('pending');
        expect(pending.pendingEvents).toBe(2);
        expect(pending.pendingEntityIds.sort()).toEqual(['message-1', 'message-2']);
        expect(pending.peers.every((peer) => peer.state === 'pending')).toBe(true);

        peers.updateSyncPeerAck(deviceA, 2);
        const partial = status.getSyncStatus(upeerId);
        expect(partial.state).toBe('pending');
        expect(partial.peers.find((peer) => peer.deviceId === deviceA)?.state).toBe('synced');
        expect(partial.peers.find((peer) => peer.deviceId === deviceB)?.state).toBe('pending');

        peers.updateSyncPeerAck(deviceB, 2);
        const synced = status.getSyncStatus(upeerId);
        expect(synced).toMatchObject({ state: 'synced', pendingEvents: 0, pendingEntityIds: [] });
    });
});
