import { describe, it, expect } from 'vitest';
import {
    LIST_NAME_MAX_LENGTH,
    MAX_CHAT_LISTS,
    createChatList,
    deleteChatList,
    findChatList,
    listsForChat,
    nextListId,
    renameChatList,
    sanitizeChatIds,
    sanitizeChatLists,
    sanitizeListName,
    toggleChatInList,
} from '../../../src/utils/chatLists.js';

const lists = [
    { id: 'list-1', name: 'Trabajo', chatIds: ['alice'] },
    { id: 'list-2', name: 'Familia', chatIds: [] },
];

describe('chatLists', () => {
    it('limpia el nombre y lo recorta al máximo', () => {
        expect(sanitizeListName('  Trabajo   del   año ')).toBe('Trabajo del año');
        expect(sanitizeListName('   ')).toBe('');
        expect(sanitizeListName(42)).toBe('');
        expect(sanitizeListName('x'.repeat(80))).toHaveLength(LIST_NAME_MAX_LENGTH);
    });

    it('deduplica y limpia los chats de una lista', () => {
        expect(sanitizeChatIds(['alice', 'alice', ' bob ', '', 42])).toEqual(['alice', 'bob']);
        expect(sanitizeChatIds('alice')).toEqual([]);
    });

    it('sanea listas guardadas: sin id o sin nombre se caen', () => {
        expect(sanitizeChatLists([
            { id: 'list-1', name: 'Trabajo', chatIds: ['alice'] },
            { id: 'list-1', name: 'Repetida', chatIds: [] },
            { id: '', name: 'Sin id', chatIds: [] },
            { id: 'list-3', name: '   ', chatIds: [] },
            null,
        ])).toEqual([{ id: 'list-1', name: 'Trabajo', chatIds: ['alice'] }]);
    });

    it('devuelve un id libre', () => {
        expect(nextListId([])).toBe('list-1');
        expect(nextListId([{ id: 'list-1', name: 'a', chatIds: [] }])).toBe('list-2');
        expect(nextListId([{ id: 'list-1', name: 'a', chatIds: [] }, { id: 'list-2', name: 'b', chatIds: [] }])).toBe('list-3');
    });

    it('crea listas vacías y rechaza nombres en blanco', () => {
        const created = createChatList(lists, '  Amigos ');
        expect(created.list).toEqual({ id: 'list-3', name: 'Amigos', chatIds: [] });
        expect(created.lists).toHaveLength(3);

        const rejected = createChatList(lists, '   ');
        expect(rejected.list).toBeNull();
        expect(rejected.lists).toBe(lists);
    });

    it('no pasa del tope de listas', () => {
        const many = Array.from({ length: MAX_CHAT_LISTS }, (_, index) => ({ id: `list-${index + 1}`, name: `L${index}`, chatIds: [] }));
        expect(createChatList(many, 'Otra').list).toBeNull();
    });

    it('renombra sin tocar los chats', () => {
        const next = renameChatList(lists, 'list-1', '  Curro ');
        expect(next[0]).toEqual({ id: 'list-1', name: 'Curro', chatIds: ['alice'] });
        expect(renameChatList(lists, 'list-1', '  ')).toBe(lists);
    });

    it('borra una lista sin tocar las demás', () => {
        expect(deleteChatList(lists, 'list-1')).toEqual([lists[1]]);
    });

    it('alterna un chat dentro de la lista elegida', () => {
        const added = toggleChatInList(lists, 'list-2', 'bob');
        expect(added[1].chatIds).toEqual(['bob']);

        const removed = toggleChatInList(added, 'list-2', 'bob');
        expect(removed[1].chatIds).toEqual([]);
        expect(removed[0]).toEqual(lists[0]);
    });

    it('busca la lista activa y en qué listas está un chat', () => {
        expect(findChatList(lists, 'list-2')?.name).toBe('Familia');
        expect(findChatList(lists, null)).toBeNull();
        expect(listsForChat(lists, 'alice').map((list) => list.name)).toEqual(['Trabajo']);
        expect(listsForChat(lists, 'bob')).toEqual([]);
    });
});
