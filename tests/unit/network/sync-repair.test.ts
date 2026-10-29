import { beforeEach, describe, expect, it, vi } from 'vitest';

const store = vi.hoisted(() => ({
    events: [] as { eventId: string; payload: { id: string } }[],
    existing: new Set<string>(),
    applied: [] as string[],
    outcome: 'applied' as 'applied' | 'unchanged' | 'rejected',
}));

vi.mock('../../../src/main_process/security/secure-logger.js', () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
}));

vi.mock('../../../src/main_process/storage/sync/events.js', () => ({
    listInboundMessageEvents: () => store.events,
}));

vi.mock('../../../src/main_process/storage/messages/operations.js', () => ({
    getMessageById: (id: string) => (store.existing.has(id) ? { id } : undefined),
}));

vi.mock('../../../src/main_process/network/sync/apply.js', () => ({
    applySyncEventOutcome: async (event: { payload: { id: string } }) => {
        store.applied.push(event.payload.id);
        return store.outcome;
    },
}));

vi.mock('../../../src/main_process/network/sync/replay.js', () => ({
    toPlainEvent: (record: { eventId: string; payload: { id: string } }) => ({
        eventId: record.eventId,
        kind: 'MESSAGE_UPSERT',
        occurredAt: 1,
        sequence: 1,
        originDeviceId: 'a'.repeat(64),
        payload: record.payload,
    }),
}));

const { repairInboundMessages } = await import('../../../src/main_process/network/sync/repair.js');

describe('repairInboundMessages', () => {
    beforeEach(() => {
        store.events = [];
        store.existing = new Set<string>();
        store.applied = [];
        store.outcome = 'applied';
    });

    it('reaplica el evento entrante cuyo mensaje no está en la base de datos', async () => {
        store.events = [{ eventId: 'e1', payload: { id: 'm1' } }];

        const repaired = await repairInboundMessages(null);

        expect(store.applied).toEqual(['m1']);
        expect(repaired).toBe(1);
    });

    it('ignora el evento cuyo mensaje ya existe', async () => {
        store.events = [{ eventId: 'e1', payload: { id: 'm1' } }];
        store.existing = new Set(['m1']);

        const repaired = await repairInboundMessages(null);

        expect(store.applied).toEqual([]);
        expect(repaired).toBe(0);
    });

    it('no cuenta como recuperado lo que no llegó a aplicarse', async () => {
        store.events = [{ eventId: 'e1', payload: { id: 'm1' } }];
        store.outcome = 'rejected';

        const repaired = await repairInboundMessages(null);

        expect(store.applied).toEqual(['m1']);
        expect(repaired).toBe(0);
    });

    it('descarta los eventos sin identificador de mensaje', async () => {
        store.events = [{ eventId: 'e1', payload: {} as { id: string } }];

        const repaired = await repairInboundMessages(null);

        expect(store.applied).toEqual([]);
        expect(repaired).toBe(0);
    });
});
