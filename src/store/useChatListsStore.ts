import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
    createChatList,
    deleteChatList,
    renameChatList,
    sanitizeChatIds,
    sanitizeChatLists,
    sanitizeListName,
    toggleChatInList,
} from '../utils/chatLists.js';
import type { ChatList } from '../utils/chatLists.js';

interface ChatListsState {
    lists: ChatList[];
    createList: (name: string) => ChatList | null;
    renameList: (listId: string, name: string) => void;
    deleteList: (listId: string) => void;
    toggleChat: (listId: string, chatId: string) => void;
    applyRemoteList: (values: Record<string, unknown>) => void;
}

function emitListPatch(payload: Record<string, unknown>): void {
    if (typeof window === 'undefined') return;
    const emit = window.upeer?.emitSettingsPatch;
    if (typeof emit !== 'function') return;
    emit({ block: 'lists', ...payload }).catch((cause: unknown) => {
        console.warn('No se pudieron compartir las listas de chats.', cause);
    });
}

function emitList(list: ChatList | undefined): void {
    if (!list) return;
    emitListPatch({ listId: list.id, name: list.name, chatIds: list.chatIds });
}

export const useChatListsStore = create<ChatListsState>()(
    persist(
        (set, get) => ({
            lists: [],
            createList: (name) => {
                const { lists, list } = createChatList(get().lists, name);
                if (list) set({ lists });
                emitList(list ?? undefined);
                return list;
            },
            renameList: (listId, name) => {
                const lists = renameChatList(get().lists, listId, name);
                set({ lists });
                emitList(lists.find((list) => list.id === listId));
            },
            deleteList: (listId) => {
                set({ lists: deleteChatList(get().lists, listId) });
                emitListPatch({ listId, deleted: true });
            },
            toggleChat: (listId, chatId) => {
                const lists = toggleChatInList(get().lists, listId, chatId);
                set({ lists });
                emitList(lists.find((list) => list.id === listId));
            },
            applyRemoteList: (values) => {
                const listId = typeof values.listId === 'string' ? values.listId.trim() : '';
                if (!listId) return;
                if (values.deleted === true) {
                    set({ lists: deleteChatList(get().lists, listId) });
                    return;
                }
                const name = sanitizeListName(values.name);
                if (!name) return;
                const list: ChatList = { id: listId, name, chatIds: sanitizeChatIds(values.chatIds) };
                const exists = get().lists.some((entry) => entry.id === listId);
                const next = exists
                    ? get().lists.map((entry) => (entry.id === listId ? list : entry))
                    : [...get().lists, list];
                set({ lists: sanitizeChatLists(next) });
            },
        }),
        {
            name: 'chat-lists',
            merge: (persisted, current) => ({
                ...current,
                lists: sanitizeChatLists((persisted as Partial<ChatListsState> | undefined)?.lists),
            }),
        }
    )
);
