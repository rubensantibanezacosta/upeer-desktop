import { describe, it, expect, vi, beforeEach } from 'vitest';

const insertValues = vi.fn();

vi.mock('drizzle-orm', () => ({
    and: (...args: unknown[]) => ({ type: 'and', args }),
    desc: (a: unknown) => ({ type: 'desc', a }),
    eq: (a: unknown, b: unknown) => ({ type: 'eq', a, b }),
    gte: (a: unknown, b: unknown) => ({ type: 'gte', a, b }),
    inArray: (a: unknown, b: unknown) => ({ type: 'inArray', a, b }),
    like: (a: unknown, b: unknown) => ({ type: 'like', a, b }),
    lt: (a: unknown, b: unknown) => ({ type: 'lt', a, b }),
    lte: (a: unknown, b: unknown) => ({ type: 'lte', a, b }),
    sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({ type: 'sql', strings, values }),
}));

vi.mock('../../../src/main_process/storage/shared.js', () => ({
    getDb: vi.fn(),
    getSchema: vi.fn(),
    getSqlite: vi.fn(),
    runTransaction: (fn: () => unknown) => fn(),
    eq: (a: unknown, b: unknown) => ({ type: 'eq', a, b }),
    desc: (a: unknown) => ({ type: 'desc', a }),
    and: (...args: unknown[]) => ({ type: 'and', args }),
    lt: (a: unknown, b: unknown) => ({ type: 'lt', a, b }),
    sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({ type: 'sql', strings, values }),
}));

vi.mock('../../../src/main_process/storage/messages/status.js', () => ({
    updateMessageStatus: vi.fn(),
    getMessageStatus: vi.fn(),
}));

vi.mock('../../../src/main_process/storage/sync/eventSink.js', () => ({
    emitSyncEvent: vi.fn(),
}));

vi.mock('../../../src/main_process/storage/retention/chatRetention.js', () => ({
    expiresAtForMessage: vi.fn((chatId: string, timestamp: number) => (chatId === 'alice' ? timestamp + 86_400_000 : null)),
}));

import { getDb, getSchema } from '../../../src/main_process/storage/shared.js';
import { saveMessage } from '../../../src/main_process/storage/messages/operations.js';

describe('marca de vencimiento al guardar', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(getSchema).mockReturnValue({
            messages: { id: 'id', chatUpeerId: 'chatUpeerId' },
            contacts: { upeerId: 'upeerId', lastClearedAt: 'lastClearedAt' },
            groups: { groupId: 'groupId', lastClearedAt: 'lastClearedAt' },
        } as unknown as ReturnType<typeof getSchema>);

        const db = {
            select: vi.fn().mockReturnValue({
                from: vi.fn().mockReturnValue({
                    where: vi.fn().mockReturnValue({ get: vi.fn().mockReturnValue(null) }),
                }),
            }),
            insert: vi.fn().mockReturnValue({
                values: vi.fn().mockImplementation((values: Record<string, unknown>) => {
                    insertValues(values);
                    return {
                        onConflictDoUpdate: vi.fn().mockReturnValue({ run: vi.fn().mockReturnValue({ changes: 1 }) }),
                    };
                }),
            }),
        };

        vi.mocked(getDb).mockReturnValue(db as unknown as ReturnType<typeof getDb>);
    });

    it('estampa el vencimiento cuando el chat tiene temporales', async () => {
        await saveMessage('m1', 'alice', false, 'hola', undefined, undefined, 'sent', undefined, 1_000_000);

        expect(insertValues).toHaveBeenCalledWith(expect.objectContaining({ expiresAt: 87_400_000 }));
    });

    it('deja la marca vacía cuando el chat no tiene temporales', async () => {
        await saveMessage('m2', 'bob', false, 'hola', undefined, undefined, 'sent', undefined, 1_000_000);

        expect(insertValues).toHaveBeenCalledWith(expect.objectContaining({ expiresAt: null }));
    });
});
