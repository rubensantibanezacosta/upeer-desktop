import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockDb = {
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    run: vi.fn(),
};

const mockSchema = {
    contacts: {
        upeerId: { name: 'upeer-id-col' },
        lastActive: { name: 'last-active-col' },
        lastSeen: { name: 'last-seen-col' },
    },
};

vi.mock('../../../src/main_process/storage/shared.js', () => ({
    getDb: () => mockDb,
    getSchema: () => mockSchema,
    eq: (column: unknown, value: unknown) => ({ kind: 'eq', column, value }),
    and: (...parts: unknown[]) => ({ kind: 'and', parts }),
    or: (...parts: unknown[]) => ({ kind: 'or', parts }),
    lt: (column: unknown, value: unknown) => ({ kind: 'lt', column, value }),
}));

vi.mock('drizzle-orm', () => ({
    isNull: (column: unknown) => ({ kind: 'isNull', column }),
}));

import { updateLastActive } from '../../../src/main_process/storage/contacts/status.js';

describe('storage/contacts/status.ts updateLastActive', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockDb.run.mockReturnValue({ changes: 1 });
    });

    it('guarda la marca como ISO', async () => {
        const at = Date.UTC(2026, 9, 20, 10, 0, 0);
        await updateLastActive('peer-1', at);

        expect(mockDb.set).toHaveBeenCalledWith({ lastActive: new Date(at).toISOString() });
    });

    it('recorta las marcas futuras al ahora', async () => {
        const future = Date.now() + 60 * 60_000;
        await updateLastActive('peer-1', future);

        const value = mockDb.set.mock.calls[0][0].lastActive as string;
        expect(new Date(value).getTime()).toBeLessThanOrEqual(Date.now() + 1000);
    });

    it('exige que la marca guardada sea más antigua para escribir', async () => {
        await updateLastActive('peer-1', Date.UTC(2026, 9, 20, 10, 0, 0));

        const where = mockDb.where.mock.calls[0][0] as { kind: string; parts: Array<{ kind: string }> };
        expect(where.kind).toBe('and');
        expect(where.parts.map((part) => part.kind)).toEqual(['eq', 'or']);
        const guard = where.parts[1] as unknown as { parts: Array<{ kind: string }> };
        expect(guard.parts.map((part) => part.kind)).toEqual(['isNull', 'lt']);
    });

    it('ignora marcas no numéricas o anteriores a la época', async () => {
        await updateLastActive('peer-1', Number.NaN);
        await updateLastActive('peer-1', 0);
        await updateLastActive('peer-1', -5);

        expect(mockDb.update).not.toHaveBeenCalled();
    });
});
