import { useChatActionsStore } from './useChatActionsStore.js';
import type { ChatGet, ChatSet, SearchSectionLoading } from './chatStoreTypes.js';
import { buildSearchResults } from './chatStoreSupport.js';
import {
    SEARCH_MESSAGE_LIMIT,
    SEARCH_MESSAGE_PAGE,
    buildSearchSections,
    type SearchLimits,
    type SearchSection,
} from '../features/search/globalSearch.js';
import { buildSearchEntities } from '../features/search/searchData.js';
import type { ChatMessage, RawChatMessage } from '../types/chat.js';
import type { SidebarFilter } from './useNavigationStore.js';

const idleLoading: SearchSectionLoading = { chats: false, contacts: false, groups: false, messages: false };

const searchSectionsOf = (
    get: ChatGet,
    query: string,
    chip: SidebarFilter,
    messages: ChatMessage[],
    limits: SearchLimits,
): SearchSection[] => {
    const { contacts, groups } = get();
    const { contactPrefs, groupPrefs } = useChatActionsStore.getState();
    const entities = buildSearchEntities(contacts, groups, { contactPrefs, groupPrefs });
    return buildSearchSections(query, chip, { ...entities, messages }, limits);
};

export const createChatSearchActions = (set: ChatSet, get: ChatGet) => ({
    handleSearchGlobal: async (query: string, chip: SidebarFilter) => {
        const term = query.trim();
        if (!term) {
            set({
                searchQuery: '',
                searchChip: chip,
                searchSections: [],
                searchRawMessages: [],
                searchMessageLimit: SEARCH_MESSAGE_LIMIT,
                searchLoading: idleLoading,
            });
            return;
        }

        const cached = term === get().searchQuery;
        const messages = cached ? get().searchRawMessages : [];
        const messageLimit = cached ? get().searchMessageLimit : SEARCH_MESSAGE_LIMIT;
        set({
            searchQuery: term,
            searchChip: chip,
            searchRawMessages: messages,
            searchMessageLimit: messageLimit,
            searchSections: searchSectionsOf(get, term, chip, messages, {
                contacts: get().searchContactLimit,
                messages: messageLimit,
            }),
            searchLoading: { ...idleLoading, messages: !cached },
        });
        if (cached) return;

        try {
            const rows: RawChatMessage[] = await window.upeer.searchMessages(term, SEARCH_MESSAGE_PAGE, 0);
            if (get().searchQuery !== term) return;
            const fetched = buildSearchResults(rows, get().contacts, get().groups);
            set({
                searchRawMessages: fetched,
                searchSections: searchSectionsOf(get, term, get().searchChip, fetched, {
                    contacts: get().searchContactLimit,
                    messages: get().searchMessageLimit,
                }),
                searchLoading: idleLoading,
            });
        } catch (error) {
            if (get().searchQuery !== term) return;
            console.warn('La búsqueda global de mensajes falló', error);
            set({ searchLoading: idleLoading });
        }
    },

    loadMoreSearchMessages: async () => {
        const { searchQuery, searchChip, searchRawMessages, searchMessageLimit } = get();
        if (!searchQuery) return;
        const nextLimit = searchMessageLimit + SEARCH_MESSAGE_PAGE;
        const limits: SearchLimits = { contacts: get().searchContactLimit, messages: nextLimit };
        if (searchRawMessages.length >= nextLimit) {
            set({
                searchMessageLimit: nextLimit,
                searchSections: searchSectionsOf(get, searchQuery, searchChip, searchRawMessages, limits),
            });
            return;
        }

        set({ searchLoading: { ...idleLoading, messages: true } });
        try {
            const rows: RawChatMessage[] = await window.upeer.searchMessages(searchQuery, SEARCH_MESSAGE_PAGE, searchRawMessages.length);
            if (get().searchQuery !== searchQuery) return;
            const messages = [...searchRawMessages, ...buildSearchResults(rows, get().contacts, get().groups)];
            set({
                searchRawMessages: messages,
                searchMessageLimit: nextLimit,
                searchSections: searchSectionsOf(get, searchQuery, searchChip, messages, limits),
                searchLoading: idleLoading,
            });
        } catch (error) {
            if (get().searchQuery !== searchQuery) return;
            console.warn('No se pudo ampliar la búsqueda de mensajes', error);
            set({ searchLoading: idleLoading });
        }
    },

    showAllSearchContacts: () => {
        const { searchQuery, searchChip, searchRawMessages, searchMessageLimit } = get();
        const contacts = Number.MAX_SAFE_INTEGER;
        set({
            searchContactLimit: contacts,
            ...(searchQuery
                ? {
                    searchSections: searchSectionsOf(get, searchQuery, searchChip, searchRawMessages, {
                        contacts,
                        messages: searchMessageLimit,
                    }),
                }
                : {}),
        });
    },
});
