import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { SyncPeerRecord } from '../../../src/main_process/storage/sync/peers.js';

const store = vi.hoisted(() => ({
    applied: new Set<string>(),
    failing: new Set<string>(),
    history: [] as { deviceId: string; cursor: string | null; done: boolean }[],
    completed: [] as string[],
    requests: 0,
}));

vi.mock('../../../src/main_process/storage/sync/messages.js', () => ({
    parseSyncHistoryCursor: (cursor: string) => {
        const separator = cursor.indexOf(':');
        return { timestamp: Number(cursor.slice(0, separator)), id: cursor.slice(separator + 1) };
    },
}));

vi.mock('../../../src/main_process/storage/sync/events.js', () => ({
    recordSyncEvent: (record: { eventId: string }) => {
        if (store.applied.has(record.eventId)) return false;
        store.applied.add(record.eventId);
        return true;
    },
}));

vi.mock('../../../src/main_process/storage/sync/peers.js', () => ({
    updateSyncPeerHistory: (deviceId: string, cursor: string | null, done: boolean) => {
        store.history.push({ deviceId, cursor, done });
    },
    getSyncPeer: () => peer(),
}));

vi.mock('../../../src/main_process/network/sync/apply.js', () => ({
    applySyncEvent: async (event: { eventId: string }) => !store.failing.has(event.eventId),
}));

vi.mock('../../../src/main_process/network/sync/historyProgress.js', () => ({
    forgetHistoryWork: vi.fn(),
    parsePendingCount: () => 0,
    recordHistoryComplete: (deviceId: string) => { store.completed.push(deviceId); },
    recordHistoryPage: vi.fn(),
    recordHistoryServed: vi.fn(),
    resetServedHistory: vi.fn(),
}));

vi.mock('../../../src/main_process/storage/contacts/operations.js', () => ({
    listContactProfiles: () => [],
}));

vi.mock('../../../src/main_process/network/sync/transport.js', () => ({
    sendEncryptedSync: async () => { store.requests += 1; return true; },
}));

vi.mock('../../../src/main_process/network/sync/auth.js', () => ({
    getMySyncIdentity: () => ({ deviceId: 'f'.repeat(64) }),
}));

vi.mock('../../../src/main_process/network/sync/origin.js', () => ({
    signSyncEventOrigin: (event: unknown) => event,
}));

function peer(): SyncPeerRecord {
    return {
        deviceId: 'a'.repeat(64),
        upeerId: 'u'.repeat(64),
        devicePublicKey: 'k',
        deviceCertificate: null,
        deviceSignedPreKey: '',
        deviceSignedPreKeySignature: '',
        deviceSignedPreKeyId: 1,
        address: '200::1',
        lastSeen: 0,
        ackSequence: 0,
        historyCursor: '1000:a',
    } as SyncPeerRecord;
}

function entry(id: string, timestamp: number) {
    return {
        eventId: `history-${id}`,
        kind: 'MESSAGE_UPSERT',
        occurredAt: timestamp,
        sequence: timestamp,
        payload: { id, chatUpeerId: 'c'.repeat(64), message: 'hola', timestamp, status: 'sent' },
    };
}

describe('aplicación del histórico sincronizado', () => {
    beforeEach(() => {
        store.applied.clear();
        store.failing.clear();
        store.history.length = 0;
        store.completed.length = 0;
        store.requests = 0;
    });

    it('avanza el cursor hasta el último mensaje aplicado y da la página por buena', async () => {
        const { applySyncHistoryResponse } = await import('../../../src/main_process/network/sync/history.js');

        await applySyncHistoryResponse(
            peer(),
            { requestId: 'r', entries: [entry('m1', 2000), entry('m2', 3000)], nextCursor: '3000:m2', done: true },
            4000,
            null,
        );

        expect(store.history.at(-1)).toEqual({ deviceId: 'a'.repeat(64), cursor: '3000:m2', done: true });
        expect(store.completed).toEqual(['a'.repeat(64)]);
        expect(store.requests).toBe(0);
    });

    it('no adelanta el cursor por delante de un mensaje que no se pudo aplicar', async () => {
        const { applySyncHistoryResponse } = await import('../../../src/main_process/network/sync/history.js');
        store.failing.add('history-m2');

        await applySyncHistoryResponse(
            peer(),
            { requestId: 'r', entries: [entry('m1', 2000), entry('m2', 3000)], nextCursor: '3000:m2', done: true },
            4000,
            null,
        );

        expect(store.history.at(-1)).toEqual({ deviceId: 'a'.repeat(64), cursor: '2000:m1', done: false });
        expect(store.completed).toEqual([]);
        expect(store.requests).toBe(1);
    });

    it('reintenta una vez y luego acepta el mensaje ya registrado para no quedarse en bucle', async () => {
        const { applySyncHistoryResponse } = await import('../../../src/main_process/network/sync/history.js');
        store.failing.add('history-m2');

        await applySyncHistoryResponse(
            peer(),
            { requestId: 'r', entries: [entry('m1', 2000), entry('m2', 3000)], nextCursor: '3000:m2', done: true },
            4000,
            null,
        );
        store.failing.delete('history-m2');
        await applySyncHistoryResponse(
            peer(),
            { requestId: 'r2', entries: [entry('m1', 2000), entry('m2', 3000)], nextCursor: '3000:m2', done: true },
            5000,
            null,
        );

        expect(store.history.at(-1)).toEqual({ deviceId: 'a'.repeat(64), cursor: '3000:m2', done: true });
        expect(store.completed).toEqual(['a'.repeat(64)]);
    });

    it('una página vacía conserva el cursor que ya había', async () => {
        const { applySyncHistoryResponse } = await import('../../../src/main_process/network/sync/history.js');

        await applySyncHistoryResponse(peer(), { requestId: 'r', entries: [], nextCursor: null, done: true }, 6000, null);

        expect(store.history.at(-1)).toEqual({ deviceId: 'a'.repeat(64), cursor: '1000:a', done: true });
    });
});
