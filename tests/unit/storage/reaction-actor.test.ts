import { describe, expect, it, vi } from 'vitest';

const mine = 'a'.repeat(64);

vi.mock('../../../src/main_process/security/identity.js', () => ({
    getMyUPeerId: () => 'a'.repeat(64),
    getAlias: () => 'Rubén',
}));

const reaction = (actorUpeerId: string) => ({
    chatUpeerId: 'chat-a',
    messageId: 'm1',
    emoji: '🤙',
    actorUpeerId,
    timestamp: 1000,
    message: 'hola',
    messageIsMine: false,
});

describe('actorNamesFrom', () => {
    it('indexa los nombres por identificador y prefiere el nombre al alias', async () => {
        const { actorNamesFrom } = await import('../../../src/main_process/storage/messages/reactionActor.js');
        const names = actorNamesFrom([
            { upeerId: 'b'.repeat(64), name: 'Ivan', alias: 'ivan' },
            { upeerId: 'c'.repeat(64), name: '', alias: 'Ana' },
            { upeerId: 'd'.repeat(64), name: '   ', alias: '' },
        ]);
        expect(names.get('b'.repeat(64))).toBe('Ivan');
        expect(names.get('c'.repeat(64))).toBe('Ana');
        expect(names.has('d'.repeat(64))).toBe(false);
    });
});

describe('buildReactionPreview', () => {
    it('marca la reacción propia con mi alias', async () => {
        const { buildReactionPreview } = await import('../../../src/main_process/storage/messages/reactionActor.js');
        const preview = buildReactionPreview(reaction(mine), new Map());
        expect(preview.actorIsMe).toBe(true);
        expect(preview.actorName).toBe('Rubén');
    });

    it('resuelve el nombre del actor desde la agenda', async () => {
        const { buildReactionPreview } = await import('../../../src/main_process/storage/messages/reactionActor.js');
        const actor = 'b'.repeat(64);
        const preview = buildReactionPreview(reaction(actor), new Map([[actor, 'Ivan']]));
        expect(preview.actorIsMe).toBe(false);
        expect(preview.actorName).toBe('Ivan');
    });

    it('deja el nombre vacío cuando el actor no está en la agenda', async () => {
        const { buildReactionPreview } = await import('../../../src/main_process/storage/messages/reactionActor.js');
        const preview = buildReactionPreview(reaction('e'.repeat(64)), new Map());
        expect(preview.actorName).toBe('');
    });
});
