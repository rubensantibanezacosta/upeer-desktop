import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { SyncPeerRecord } from '../../../src/main_process/storage/sync/peers.js';

type SentEnvelope = { type: string; payload: { entries: { kind: string; eventId: string; payload: Record<string, unknown> }[]; done: boolean } };

const store = vi.hoisted(() => ({
    sent: [] as SentEnvelope[],
    messages: [] as { id: string; timestamp: number }[],
    profiles: [] as { upeerId: string; name: string }[],
    groups: [] as { groupId: string; payload: Record<string, unknown> }[],
    requestedLimits: [] as number[],
    served: [] as { deviceId: string; count: number }[],
}));

vi.mock('../../../src/main_process/storage/sync/messages.js', () => ({
    parseSyncHistoryCursor: (cursor: string | null) => {
        if (!cursor) return { timestamp: 0, id: '' };
        const separator = cursor.indexOf(':');
        return { timestamp: Number(cursor.slice(0, separator)), id: cursor.slice(separator + 1) };
    },
    listSyncHistoryMessages: (_timestamp: number, _id: string, limit: number) => {
        store.requestedLimits.push(limit);
        const page = store.messages.slice(0, limit);
        return {
            messages: page,
            nextCursor: page.length > 0 ? `${page[page.length - 1].timestamp}:${page[page.length - 1].id}` : null,
            done: page.length >= store.messages.length,
        };
    },
    countSyncHistoryAfter: () => 0,
    latestSyncHistoryCursor: () => null,
}));

vi.mock('../../../src/main_process/storage/sync/events.js', () => ({
    recordSyncEvent: () => true,
}));

vi.mock('../../../src/main_process/storage/sync/peers.js', () => ({
    updateSyncPeerHistory: vi.fn(),
    getSyncPeer: vi.fn(),
}));

vi.mock('../../../src/main_process/storage/contacts/operations.js', () => ({
    listContactProfiles: () => store.profiles,
}));

vi.mock('../../../src/main_process/storage/groups/operations.js', () => ({
    listGroupSyncPayloads: () => store.groups,
}));

vi.mock('../../../src/main_process/network/sync/apply.js', () => ({
    applySyncEventOutcome: async () => 'applied',
}));

vi.mock('../../../src/main_process/network/sync/auth.js', () => ({
    getMySyncIdentity: () => ({ deviceId: 'f'.repeat(64) }),
}));

vi.mock('../../../src/main_process/network/sync/origin.js', () => ({
    signSyncEventOrigin: (event: unknown) => event,
}));

vi.mock('../../../src/main_process/network/sync/transport.js', () => ({
    sendEncryptedSync: async (_peer: unknown, type: string, payload: SentEnvelope['payload']) => {
        store.sent.push({ type, payload });
        return true;
    },
}));

vi.mock('../../../src/main_process/network/sync/historyProgress.js', () => ({
    completeServedHistory: vi.fn(),
    forgetHistoryWork: vi.fn(),
    parsePendingCount: () => 0,
    recordHistoryComplete: vi.fn(),
    recordHistoryPage: vi.fn(),
    recordHistoryServed: (deviceId: string, count: number) => { store.served.push({ deviceId, count }); },
    resetServedHistory: vi.fn(),
}));

vi.mock('../../../src/main_process/network/sync/repair.js', () => ({
    repairInboundMessages: async () => 0,
}));

const { respondSyncHistory } = await import('../../../src/main_process/network/sync/history.js');

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
        historyCursor: null,
    } as unknown as SyncPeerRecord;
}

function messages(count: number) {
    return Array.from({ length: count }, (_unused, index) => ({ id: `m${index}`, timestamp: 1000 + index }));
}

describe('histórico sincronizado con grupos', () => {
    beforeEach(() => {
        store.sent.length = 0;
        store.requestedLimits.length = 0;
        store.served.length = 0;
        store.messages = messages(3);
        store.profiles = [];
        store.groups = [];
    });

    it('la primera página lleva los grupos aunque no haya mensajes recientes', async () => {
        store.groups = [{
            groupId: 'grp-ae5fca2d-1735-4732-b016-a57e85e62e41',
            payload: { groupId: 'grp-ae5fca2d-1735-4732-b016-a57e85e62e41', name: 'grupo', status: 'active' },
        }];

        await respondSyncHistory(peer(), { requestId: 'r1', cursor: null, limit: 50 });

        const entries = store.sent[0].payload.entries;
        const groups = entries.filter((entry) => entry.kind === 'GROUP_UPSERT');
        expect(groups).toHaveLength(1);
        expect(groups[0].eventId).toBe('group-grp-ae5fca2d-1735-4732-b016-a57e85e62e41');
        expect(groups[0].payload).toMatchObject({ groupId: 'grp-ae5fca2d-1735-4732-b016-a57e85e62e41', name: 'grupo' });
        expect(entries.filter((entry) => entry.kind === 'MESSAGE_UPSERT')).toHaveLength(3);
    });

    it('la página siguiente no repite los grupos', async () => {
        store.groups = [{ groupId: 'grp-1', payload: { groupId: 'grp-1', name: 'uno', status: 'active' } }];

        await respondSyncHistory(peer(), { requestId: 'r2', cursor: '1002:m2', limit: 50 });

        const entries = store.sent[0].payload.entries;
        expect(entries.some((entry) => entry.kind === 'GROUP_UPSERT')).toBe(false);
    });

    it('deja sitio a los grupos dentro del límite de la página', async () => {
        store.messages = messages(60);
        store.profiles = Array.from({ length: 40 }, (_unused, index) => ({ upeerId: `p${index}`, name: `Persona ${index}` }));
        store.groups = Array.from({ length: 10 }, (_unused, index) => ({ groupId: `grp-${index}`, payload: { groupId: `grp-${index}`, status: 'active' } }));

        await respondSyncHistory(peer(), { requestId: 'r3', cursor: null, limit: 200 });

        const entries = store.sent[0].payload.entries;
        expect(entries.length).toBeLessThanOrEqual(200);
        expect(entries).toHaveLength(110);
        expect(entries.filter((entry) => entry.kind === 'GROUP_UPSERT')).toHaveLength(10);
        expect(entries.filter((entry) => entry.kind === 'CONTACT_PROFILE')).toHaveLength(40);
        expect(store.requestedLimits[0]).toBe(150);
    });
});
