import { useNavigationStore } from './useNavigationStore.js';
import type { ChatGet, ChatSet } from './chatStoreTypes.js';
import { buildSearchResults, mapContactMessage, mapGroupMessage } from './chatStoreSupport.js';

let navGeneration = 0;

export const createChatHistoryActions = (set: ChatSet, get: ChatGet) => ({
    setTargetUpeerId: (id: string) => {
        set({ targetUpeerId: id, activeGroupId: '', isWindowedHistory: false });
        if (!id) {
            return;
        }
        const generation = ++navGeneration;
        const { pendingScrollMsgId } = useNavigationStore.getState();
        const loadMessages = pendingScrollMsgId
            ? window.upeer.getMessagesAround(id, pendingScrollMsgId)
            : window.upeer.getMessages(id);

        loadMessages.then((messages: any[]) => {
            if (navGeneration !== generation) {
                return;
            }
            const history = pendingScrollMsgId ? messages : messages.reverse();
            history.forEach((message: any) => {
                if (!message.isMine && message.status !== 'read') {
                    window.upeer.sendReadReceipt(id, message.id);
                    message.status = 'read';
                }
            });
            set({
                chatHistory: history.map(mapContactMessage),
                isWindowedHistory: !!pendingScrollMsgId,
            });
        });
    },

    setActiveGroupId: (id: string) => {
        set({ activeGroupId: id, targetUpeerId: '', isWindowedHistory: false });
        if (!id) {
            return;
        }
        const generation = ++navGeneration;
        const { pendingScrollMsgId } = useNavigationStore.getState();
        const loadMessages = pendingScrollMsgId
            ? window.upeer.getMessagesAround(id, pendingScrollMsgId)
            : window.upeer.getMessages(id);

        loadMessages.then((messages: any[]) => {
            if (navGeneration !== generation) {
                return;
            }
            const history = pendingScrollMsgId ? messages : messages.reverse();
            history.forEach((message: any) => {
                if (!message.isMine && message.status !== 'read') {
                    window.upeer.sendReadReceipt(id, message.id);
                    message.status = 'read';
                }
            });
            const { contacts, myIdentity } = get();
            set({
                groupChatHistory: history.map((message: any) => mapGroupMessage(id, message, contacts, myIdentity)),
                isWindowedHistory: !!pendingScrollMsgId,
            });
        });
    },

    setMessage: (id: string, value: string) => set((state) => ({
        messagesByConversation: { ...state.messagesByConversation, [id]: value },
    })),

    setReplyToMessage: (id: string, value: any) => set((state) => ({
        replyByConversation: { ...state.replyByConversation, [id]: value },
    })),

    setChatHistory: (history: any[]) => set({ chatHistory: history }),
    setGroupChatHistory: (history: any[]) => set({ groupChatHistory: history }),

    handleSearchGlobal: async (query: string) => {
        if (!query.trim()) {
            set({ searchResults: [] });
            return;
        }
        const { contacts, groups } = get();
        const raw = await window.upeer.searchMessages(query);
        set({ searchResults: buildSearchResults(raw, contacts, groups) });
    },

    loadHistoryAround: async (targetMsgId: string) => {
        const { targetUpeerId, activeGroupId, contacts, myIdentity } = get();
        const chatId = activeGroupId || targetUpeerId;
        if (!chatId) {
            return;
        }
        const raw = await window.upeer.getMessagesAround(chatId, targetMsgId);
        if (activeGroupId) {
            set({
                groupChatHistory: raw.map((message: any) => mapGroupMessage(chatId, message, contacts, myIdentity)),
                isWindowedHistory: true,
            });
            return;
        }
        set({
            chatHistory: raw.map(mapContactMessage),
            isWindowedHistory: true,
        });
    },

    reloadLatestHistory: async () => {
        const { targetUpeerId, activeGroupId, contacts, myIdentity } = get();
        const chatId = activeGroupId || targetUpeerId;
        if (!chatId) {
            return;
        }
        const raw = await window.upeer.getMessages(chatId);
        const history = raw.reverse();
        if (activeGroupId) {
            set({
                groupChatHistory: history.map((message: any) => mapGroupMessage(chatId, message, contacts, myIdentity)),
                isWindowedHistory: false,
            });
            return;
        }
        set({
            chatHistory: history.map(mapContactMessage),
            isWindowedHistory: false,
        });
    },

    refreshContacts: async () => {
        const contacts = await window.upeer.getContacts();
        set({ contacts });
    },

    refreshGroups: async () => {
        const rawGroups = await window.upeer.getGroups();
        const groups = rawGroups.map((group: any) => ({
            ...group,
            avatar: group.avatar || undefined,
            members: Array.isArray(group.members) ? group.members : JSON.parse(group.members || '[]'),
        }));
        const { activeGroupId } = get();
        const shouldClearActiveGroup = Boolean(activeGroupId) && !groups.some((group: any) => group.groupId === activeGroupId);
        set({
            groups,
            ...(shouldClearActiveGroup ? { activeGroupId: '', groupChatHistory: [], isWindowedHistory: false } : {}),
        });
    },

    refreshData: async () => {
        const networkAddress = await window.upeer.getMyNetworkAddress();
        const identity = await window.upeer.getMyIdentity();
        set({
            networkAddress,
            myIdentity: identity,
            targetUpeerId: '',
            activeGroupId: '',
            chatHistory: [],
            groupChatHistory: [],
            incomingRequests: {},
        });
        get().refreshContacts();
        get().refreshGroups();
    },
});
