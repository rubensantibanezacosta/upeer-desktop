import { describe, expect, it } from 'vitest';
import { groupStarredByChat, starredIdsOf, toStarredRow, toStarredRows } from '../../../../src/features/chat/starredGlobal.js';

const contacts = [{ id: 'alice', name: 'Alice' }, { id: 'bob', name: 'Bob' }];
const groups = [{ id: 'grp-1', name: 'Equipo' }];

describe('toStarredRow', () => {
    it('normaliza una fila válida', () => {
        expect(toStarredRow({ id: 'm1', chatUpeerId: 'alice', message: 'Hola', timestamp: 1000, isMine: true })).toEqual({
            id: 'm1', chatUpeerId: 'alice', message: 'Hola', timestamp: 1000, isMine: true,
        });
    });

    it('acepta el alias upeerId de las filas del renderer', () => {
        expect(toStarredRow({ id: 'm1', upeerId: 'bob', message: 'Hola', timestamp: 5 })).toMatchObject({ chatUpeerId: 'bob' });
    });

    it('descarta filas sin id o sin chat', () => {
        expect(toStarredRow({ chatUpeerId: 'alice' })).toBeNull();
        expect(toStarredRow({ id: 'm1' })).toBeNull();
    });

    it('descarta los mensajes borrados', () => {
        expect(toStarredRow({ id: 'm1', chatUpeerId: 'alice', isDeleted: true })).toBeNull();
    });

    it('acepta timestamps en texto y cae a cero si no son números', () => {
        expect(toStarredRow({ id: 'm1', chatUpeerId: 'alice', timestamp: '1700' })?.timestamp).toBe(1700);
        expect(toStarredRow({ id: 'm1', chatUpeerId: 'alice', timestamp: 'ayer' })?.timestamp).toBe(0);
    });
});

describe('toStarredRows', () => {
    it('filtra lo que no es fila', () => {
        expect(toStarredRows([{ id: 'm1', chatUpeerId: 'alice' }, null, 'texto', 42])).toHaveLength(1);
    });

    it('devuelve vacío si la respuesta no es una lista', () => {
        expect(toStarredRows(undefined)).toEqual([]);
        expect(toStarredRows({ id: 'm1' })).toEqual([]);
    });
});

describe('groupStarredByChat', () => {
    it('agrupa por chat y ordena de más reciente a más antiguo', () => {
        const rows = [
            { id: 'a1', chatUpeerId: 'alice', message: 'uno', timestamp: 1000, isMine: false },
            { id: 'b1', chatUpeerId: 'bob', message: 'dos', timestamp: 3000, isMine: true },
            { id: 'a2', chatUpeerId: 'alice', message: 'tres', timestamp: 2000, isMine: false },
        ];
        const result = groupStarredByChat(rows, contacts, groups);
        expect(result.map((chat) => chat.chatId)).toEqual(['bob', 'alice']);
        expect(result[1].rows.map((row) => row.id)).toEqual(['a2', 'a1']);
    });

    it('resuelve el nombre del grupo y el tipo de chat', () => {
        const result = groupStarredByChat([
            { id: 'g1', chatUpeerId: 'grp-1', message: 'hola', timestamp: 1, isMine: false },
            { id: 'a1', chatUpeerId: 'alice', message: 'hola', timestamp: 2, isMine: false },
        ], contacts, groups);
        expect(result[0]).toMatchObject({ chatId: 'alice', kind: 'contact', name: 'Alice' });
        expect(result[1]).toMatchObject({ chatId: 'grp-1', kind: 'group', name: 'Equipo' });
    });

    it('cae al id cuando el chat ya no está en la agenda', () => {
        const result = groupStarredByChat([
            { id: 'x1', chatUpeerId: '200:aaaa:bbbb:cccc:dddd:eeee:ffff:9999', message: 'hola', timestamp: 1, isMine: false },
        ], contacts, groups);
        expect(result[0].kind).toBe('contact');
        expect(result[0].name).toContain('200:aaaa');
    });

    it('sin filas no hay grupos', () => {
        expect(groupStarredByChat([], contacts, groups)).toEqual([]);
    });
});

describe('starredIdsOf', () => {
    it('solo devuelve los marcados', () => {
        const ids = starredIdsOf({
            a: { starred: true },
            b: { starred: false },
            c: { starred: true },
        });
        expect(ids.sort()).toEqual(['a', 'c']);
    });
});
