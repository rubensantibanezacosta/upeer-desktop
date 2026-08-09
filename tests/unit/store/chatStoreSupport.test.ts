import { describe, expect, it } from 'vitest';
import {
    formatMessageTimestamp,
    insertMessageChronologically,
    mapContactMessage,
    mapGroupMessage,
    buildSearchResults,
    applyReactionUpdate,
    updateTransferMessageContent,
} from '../../../src/store/chatStoreSupport.ts';

const msg = (over: Record<string, unknown> = {}) => ({
    id: 'm1',
    chatUpeerId: 'peer-1',
    message: 'hola',
    status: 'sent',
    isMine: true,
    timestamp: 1000,
    ...over,
});

describe('chatStoreSupport', () => {
    it('formatMessageTimestamp usa Date.now para valores inválidos', () => {
        const fixed = new Date(1000 * 60 * 60 * 12).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const result = formatMessageTimestamp(1000 * 60 * 60 * 12);
        expect(result).toBe(fixed);
        expect(formatMessageTimestamp(undefined)).toMatch(/^\d{1,2}:\d{2}/);
        expect(formatMessageTimestamp(NaN)).toMatch(/^\d{1,2}:\d{2}/);
    });

    it('insertMessageChronologically añade el nuevo mensaje al final (orden de llegada)', () => {
        const a = { id: 'a', date: 5 } as never;
        const b = { id: 'b', date: 1 } as never;
        const result = insertMessageChronologically([a] as never, b as never);
        expect(result.map((m) => m.id)).toEqual(['a', 'b']);
    });

    it('mapContactMessage transforma un mensaje crudo de contacto', () => {
        const m = mapContactMessage({
            id: 'm1', chatUpeerId: 'peer-1', message: 'texto', status: 'delivered',
            isMine: false, timestamp: 1000, replyTo: 'r1', reactions: [],
            isEdited: true, isDeleted: false,
        } as never);
        expect(m.upeerId).toBe('peer-1');
        expect(m.isMine).toBe(false);
        expect(m.isEdited).toBe(true);
        expect(m.date).toBe(1000);
    });

    it('mapGroupMessage usa mi identidad para mis mensajes y el contacto para los ajenos', () => {
        const mine = mapGroupMessage('grp-1', msg({ isMine: true }), [], { name: 'Yo' } as never);
        expect(mine.senderName).toBe('Yo');

        const theirs = mapGroupMessage('grp-1', msg({ isMine: false, senderUpeerId: 'p2', senderName: 'Ana' }), [{ upeerId: 'p2', name: 'Ana' }] as never, null);
        expect(theirs.senderName).toBe('Ana');

        const sys = mapGroupMessage('grp-1', msg({ message: '__SYS__|nuevo miembro' }), [], null);
        expect(sys.isSystem).toBe(true);
        expect(sys.message).toBe('nuevo miembro');
    });

    it('buildSearchResults filtra mensajes JSON y calcula nombres', () => {
        const raw = [
            { id: '1', chatUpeerId: 'peer-1', message: 'hola', timestamp: 1, isMine: true },
            { id: '2', chatUpeerId: 'peer-1', message: '{json}', timestamp: 2 },
            { id: '3', chatUpeerId: 'grp-1', message: 'grupo', timestamp: 3 },
        ] as never;
        const results = buildSearchResults(raw, [{ upeerId: 'peer-1', name: 'Bob' }] as never, [{ groupId: 'grp-1', name: 'Mi Grupo' }] as never);
        expect(results).toHaveLength(2);
        expect(results[0].message).toBe('hola');
        expect(results[0].senderName).toBe('Bob');
        expect(results[1].groupId).toBe('grp-1');
        expect(results[1].senderName).toBe('Mi Grupo');
    });

    it('applyReactionUpdate añade, elimina y no duplica reacciones', () => {
        const base = { id: 'm', reactions: [{ upeerId: 'p1', emoji: '👍' }] } as never;
        const added = applyReactionUpdate(base, 'p2', '❤️', false);
        expect(added.reactions).toHaveLength(2);

        const dup = applyReactionUpdate(added, 'p2', '❤️', false);
        expect(dup.reactions).toHaveLength(2);

        const removed = applyReactionUpdate(added, 'p1', '👍', true);
        expect(removed.reactions).toHaveLength(1);
    });

    it('updateTransferMessageContent actualiza solo mensajes de fichero coincidentes', () => {
        const base = { id: 'm', message: '{"type":"file","transferId":"f1"}' } as never;
        const updated = updateTransferMessageContent(base, 'f1', { state: 'completed' });
        expect(updated.message).toContain('"state":"completed"');

        const noMatch = updateTransferMessageContent(base, 'otro', { state: 'x' } as never);
        expect(noMatch).toBe(base);

        const notJson = updateTransferMessageContent({ id: 'm', message: 'texto' } as never, 'f1', {} as never);
        expect(notJson.message).toBe('texto');

        const malformed = updateTransferMessageContent({ id: 'm', message: '{invalido' } as never, 'f1', {} as never);
        expect(malformed.message).toBe('{invalido');
    });
});
