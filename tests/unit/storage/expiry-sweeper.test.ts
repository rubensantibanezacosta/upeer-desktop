import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/main_process/storage/shared.js', () => ({
    getDb: vi.fn(),
    getSchema: vi.fn(),
    runTransaction: (fn: () => unknown) => fn(),
    sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({ type: 'sql', strings, values }),
}));

import { getDb, getSchema } from '../../../src/main_process/storage/shared.js';
import { sweepExpiredMessages, startExpirySweeper } from '../../../src/main_process/storage/retention/expirySweeper.js';

const schema = {
    messages: { id: 'id', chatUpeerId: 'chatUpeerId' },
    reactions: { messageId: 'messageId' },
};

function makeDb(rows: { chatUpeerId: string }[]) {
    const all = vi.fn().mockReturnValue(rows);
    const run = vi.fn().mockReturnValue({ changes: rows.length });

    const db = {
        select: vi.fn().mockReturnValue({
            from: vi.fn().mockReturnValue({
                where: vi.fn().mockReturnValue({ all }),
            }),
        }),
        delete: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({ run }),
        }),
    };

    return { db, all, run };
}

describe('sweepExpiredMessages', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(getSchema).mockReturnValue(schema as unknown as ReturnType<typeof getSchema>);
    });

    it('no toca nada cuando no hay mensajes vencidos', () => {
        const { db, run } = makeDb([]);
        vi.mocked(getDb).mockReturnValue(db as unknown as ReturnType<typeof getDb>);

        expect(sweepExpiredMessages(1_000)).toEqual([]);
        expect(run).not.toHaveBeenCalled();
    });

    it('borra reacciones y mensajes y devuelve los chats afectados sin repetir', () => {
        const { db, run } = makeDb([{ chatUpeerId: 'alice' }, { chatUpeerId: 'alice' }, { chatUpeerId: 'grp-1' }]);
        vi.mocked(getDb).mockReturnValue(db as unknown as ReturnType<typeof getDb>);

        const chats = sweepExpiredMessages(1_000);

        expect(chats).toEqual(['alice', 'grp-1']);
        expect(db.delete).toHaveBeenCalledTimes(2);
        expect(run).toHaveBeenCalledTimes(2);
    });

    it('devuelve una lista vacía si la base falla', () => {
        const { db } = makeDb([]);
        db.select.mockImplementation(() => {
            throw new Error('db caída');
        });
        vi.mocked(getDb).mockReturnValue(db as unknown as ReturnType<typeof getDb>);

        expect(sweepExpiredMessages(1_000)).toEqual([]);
    });
});

describe('startExpirySweeper', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(getSchema).mockReturnValue(schema as unknown as ReturnType<typeof getSchema>);
    });

    it('barre al arrancar y avisa solo cuando hay chats afectados', () => {
        const { db } = makeDb([{ chatUpeerId: 'alice' }]);
        vi.mocked(getDb).mockReturnValue(db as unknown as ReturnType<typeof getDb>);
        const onExpired = vi.fn();

        const stop = startExpirySweeper({ intervalMs: 60_000, onExpired });
        stop();

        expect(onExpired).toHaveBeenCalledWith(['alice']);
    });

    it('no avisa si no había nada vencido', () => {
        const { db } = makeDb([]);
        vi.mocked(getDb).mockReturnValue(db as unknown as ReturnType<typeof getDb>);
        const onExpired = vi.fn();

        const stop = startExpirySweeper({ intervalMs: 60_000, onExpired });
        stop();

        expect(onExpired).not.toHaveBeenCalled();
    });
});
