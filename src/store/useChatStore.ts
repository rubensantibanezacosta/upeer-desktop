import { create } from 'zustand';
import { createChatHistoryActions } from './chatStoreHistory.js';
import { createChatListenerActions } from './chatStoreListeners.js';
import { createChatOperationActions } from './chatStoreOperations.js';
import { createChatTransferActions } from './chatStoreTransferActions.js';
import type { ChatStore } from './chatStoreTypes.js';

export const useChatStore = create<ChatStore>((set, get) => ({
    myIdentity: null,
    networkAddress: '',
    contacts: [],
    groups: [],
    targetUpeerId: '',
    activeGroupId: '',
    chatHistory: [],
    groupChatHistory: [],
    searchResults: [],
    isWindowedHistory: false,
    messagesByConversation: {},
    replyByConversation: {},
    typingStatus: {},
    incomingRequests: {},
    untrustworthyAlert: null,
    untrustworthyAlerts: {},
    pendingFiles: [],
    isDragging: false,
    setMyIdentity: (identity) => set({ myIdentity: identity }),
    setNetworkAddress: (networkAddress) => set({ networkAddress }),
    ...createChatHistoryActions(set, get),
    ...createChatOperationActions(set, get),
    ...createChatTransferActions(set, get),
    ...createChatListenerActions(set, get),
}));
