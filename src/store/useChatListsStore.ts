import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
    createChatList,
    deleteChatList,
    renameChatList,
    sanitizeChatLists,
    toggleChatInList,
} from '../utils/chatLists.js';
import type { ChatList } from '../utils/chatLists.js';

interface ChatListsState {
    lists: ChatList[];
    createList: (name: string) => ChatList | null;
    renameList: (listId: string, name: string) => void;
    deleteList: (listId: string) => void;
    toggleChat: (listId: string, chatId: string) => void;
}

export const useChatListsStore = create<ChatListsState>()(
    persist(
        (set, get) => ({
            lists: [],
            createList: (name) => {
                const { lists, list } = createChatList(get().lists, name);
                if (list) set({ lists });
                return list;
            },
            renameList: (listId, name) => set((state) => ({ lists: renameChatList(state.lists, listId, name) })),
            deleteList: (listId) => set((state) => ({ lists: deleteChatList(state.lists, listId) })),
            toggleChat: (listId, chatId) => set((state) => ({ lists: toggleChatInList(state.lists, listId, chatId) })),
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
