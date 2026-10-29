import { describe, it, expect, vi, beforeEach } from 'vitest';

type Row = Record<string, unknown>;

let currentTable = '';
let reactionRows: Row[] = [];
let messageRows: Row[] = [];

const mockDb = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn((table: { __name?: string }) => {
        currentTable = table?.__name ?? '';
        return mockDb;
    }),
    orderBy: vi.fn().mockReturnThis(),
    all: vi.fn(() => (currentTable === 'reactions' ? reactionRows : messageRows)),
};

const mockSchema = {
    reactions: { __name: 'reactions', timestamp: { name: 'reactions-timestamp' } },
    messages: { __name: 'messages' },
};

vi.mock('../../../src/main_process/storage/shared.js', () => ({
    getDb: () => mockDb,
    getSchema: () => mockSchema,
}));

vi.mock('drizzle-orm', () => ({
    desc: (column: unknown) => ({ column, order: 'desc' }),
}));

import { getLatestReactionByChat, reactionIsNewer } from '../../../src/main_process/storage/messages/latestReaction.js';

describe('storage/messages/latestReaction', () => {
    beforeEach(() => {
        reactionRows = [];
        messageRows = [];
        currentTable = '';
    });

    it('devuelve solo la reacción más reciente de cada chat', () => {
        messageRows = [
            { id: 'm1', chatUpeerId: 'chat-a', message: 'hola', isMine: false },
            { id: 'm2', chatUpeerId: 'chat-a', message: 'qué tal', isMine: true },
        ];
        reactionRows = [
            { messageId: 'm2', upeerId: 'b', emoji: '🔥', timestamp: 2000 },
            { messageId: 'm1', upeerId: 'b', emoji: '👍', timestamp: 1000 },
        ];

        const latest = getLatestReactionByChat();

        expect(latest.get('chat-a')).toEqual({
            chatUpeerId: 'chat-a',
            messageId: 'm2',
            emoji: '🔥',
            actorUpeerId: 'b',
            timestamp: 2000,
            message: 'qué tal',
            messageIsMine: true,
        });
        expect(latest.size).toBe(1);
    });

    it('ignora reacciones de mensajes que ya no existen', () => {
        messageRows = [{ id: 'm1', chatUpeerId: 'chat-a', message: 'hola', isMine: false }];
        reactionRows = [{ messageId: 'borrado', upeerId: 'b', emoji: '👍', timestamp: 1000 }];

        expect(getLatestReactionByChat().size).toBe(0);
    });

    it('compara la reacción con la hora del último mensaje', () => {
        expect(reactionIsNewer({ timestamp: 5000 }, 4000)).toBe(true);
        expect(reactionIsNewer({ timestamp: 5000 }, 5000)).toBe(false);
        expect(reactionIsNewer({ timestamp: 5000 }, '6000')).toBe(false);
        expect(reactionIsNewer({ timestamp: 5000 }, undefined)).toBe(true);
        expect(reactionIsNewer(undefined, 1000)).toBe(false);
    });
});
