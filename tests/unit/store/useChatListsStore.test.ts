import { beforeEach, describe, expect, it, vi } from 'vitest';

const STORAGE_KEY = 'chat-lists';

const loadStore = async () => {
    vi.resetModules();
    const module = await import('../../../src/store/useChatListsStore.js');
    return module.useChatListsStore;
};

describe('useChatListsStore', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it('arranca sin listas', async () => {
        const store = await loadStore();
        expect(store.getState().lists).toEqual([]);
    });

    it('crea, renombra y borra', async () => {
        const store = await loadStore();

        const created = store.getState().createList('Trabajo');
        expect(created?.name).toBe('Trabajo');
        expect(store.getState().lists).toHaveLength(1);
        if (!created) throw new Error('la lista no se creó');

        store.getState().renameList(created.id, 'Curro');
        expect(store.getState().lists[0].name).toBe('Curro');

        store.getState().deleteList(created.id);
        expect(store.getState().lists).toEqual([]);
    });

    it('no crea listas sin nombre', async () => {
        const store = await loadStore();

        expect(store.getState().createList('   ')).toBeNull();
        expect(store.getState().lists).toEqual([]);
    });

    it('alterna chats dentro de la lista', async () => {
        const store = await loadStore();
        const list = store.getState().createList('Familia');
        if (!list) throw new Error('la lista no se creó');

        store.getState().toggleChat(list.id, 'bob');
        expect(store.getState().lists[0].chatIds).toEqual(['bob']);

        store.getState().toggleChat(list.id, 'bob');
        expect(store.getState().lists[0].chatIds).toEqual([]);
    });

    it('descarta listas guardadas sin nombre al cargar', async () => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
            state: {
                lists: [
                    { id: 'list-1', name: 'Trabajo', chatIds: ['alice'] },
                    { id: 'list-2', name: '', chatIds: [] },
                ],
            },
            version: 0,
        }));

        const store = await loadStore();

        expect(store.getState().lists).toEqual([{ id: 'list-1', name: 'Trabajo', chatIds: ['alice'] }]);
    });
});
