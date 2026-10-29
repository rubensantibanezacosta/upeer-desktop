import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { SyncPeerRecord } from '../../../src/main_process/storage/sync/peers.js';

const store = vi.hoisted(() => ({
    applied: new Set<string>(),
    failing: new Set<string>(),
    attempted: [] as string[],
    unchanged: new Set<string>(),
    history: [] as { deviceId: string; cursor: string | null; done: boolean }[],
    completed: [] as string[],
    requests: 0,
    sent: [] as { cursor: string | null }[],
    latest: null as string | null,
}));

vi.mock('../../../src/main_process/storage/sync/messages.js', () => ({
    parseSyncHistoryCursor: (cursor: string) => {
        const separator = cursor.indexOf(':');
        return { timestamp: Number(cursor.slice(0, separator)), id: cursor.slice(separator + 1) };
    },
    latestSyncHistoryCursor: () => store.latest,
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
    applySyncEventOutcome: async (event: { eventId: string }) => {
        store.attempted.push(event.eventId);
        if (store.failing.has(event.eventId)) return 'rejected';
        if (store.unchanged.has(event.eventId)) return 'unchanged';
        return 'applied';
    },
}));

vi.mock('../../../src/main_process/network/sync/historyProgress.js', () => ({
    forgetHistoryWork: vi.fn(),
    parsePendingCount: () => 0,
    recordHistoryComplete: (deviceId: string) => { store.completed.push(deviceId); },
    recordHistoryPage: vi.fn(),
    recordHistoryServed: vi.fn(),
    resetServedHistory: vi.fn(),
}));

vi.mock('../../../src/main_process/network/sync/repair.js', () => ({
    repairInboundMessages: async () => 0,
}));

vi.mock('../../../src/main_process/storage/contacts/operations.js', () => ({
    listContactProfiles: () => [],
}));

vi.mock('../../../src/main_process/network/sync/transport.js', () => ({
    sendEncryptedSync: async (_peer: unknown, _type: string, payload: { cursor: string | null }) => {
        store.requests += 1;
        store.sent.push({ cursor: payload.cursor });
        return true;
    },
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
    } as unknown as SyncPeerRecord;
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
        store.attempted.length = 0;
        store.unchanged.clear();
        store.history.length = 0;
        store.completed.length = 0;
        store.requests = 0;
        store.sent.length = 0;
        store.latest = null;
    });

    it('aplica un evento ya registrado que nunca llegó a aplicarse', async () => {
        const { applySyncHistoryResponse } = await import('../../../src/main_process/network/sync/history.js');
        store.applied.add('history-m1');

        await applySyncHistoryResponse(
            peer(),
            { requestId: 'r', entries: [entry('m1', 2000)], nextCursor: '2000:m1', done: true },
            4000,
            null,
        );

        expect(store.attempted).toEqual(['history-m1']);
        expect(store.history.at(-1)).toEqual({ deviceId: 'a'.repeat(64), cursor: '2000:m1', done: true });
    });

    it('da por bueno el mensaje que ya estaba en la base de datos', async () => {
        const { applySyncHistoryResponse } = await import('../../../src/main_process/network/sync/history.js');
        store.unchanged.add('history-m1');

        await applySyncHistoryResponse(
            peer(),
            { requestId: 'r', entries: [entry('m1', 2000)], nextCursor: '2000:m1', done: true },
            4000,
            null,
        );

        expect(store.history.at(-1)).toEqual({ deviceId: 'a'.repeat(64), cursor: '2000:m1', done: true });
        expect(store.completed).toEqual(['a'.repeat(64)]);
    });

    it('pide el histórico desde el último mensaje propio si el cursor se adelantó', async () => {
        const { requestSyncHistory } = await import('../../../src/main_process/network/sync/history.js');
        store.latest = '2000:m1';

        await requestSyncHistory({ ...peer(), historyCursor: '9000:z' });

        expect(store.sent).toEqual([{ cursor: '2000:m1' }]);
    });

    it('mantiene el cursor guardado cuando no va por delante de los mensajes', async () => {
        const { requestSyncHistory } = await import('../../../src/main_process/network/sync/history.js');
        store.latest = '9500:z9';

        await requestSyncHistory({ ...peer(), historyCursor: '9000:z' });

        expect(store.sent).toEqual([{ cursor: '9000:z' }]);
    });

    it('pide desde el principio la primera vez', async () => {
        const { requestSyncHistory } = await import('../../../src/main_process/network/sync/history.js');
        store.latest = '2000:m1';

        await requestSyncHistory({ ...peer(), historyCursor: null });

        expect(store.sent).toEqual([{ cursor: null }]);
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
