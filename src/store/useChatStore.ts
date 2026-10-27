import { create } from 'zustand';
import { createChatHistoryActions } from './chatStoreHistory.js';
import { createChatSearchActions } from './chatStoreSearch.js';
import { createChatListenerActions } from './chatStoreListeners.js';
import { createChatOperationActions } from './chatStoreOperations.js';
import { createChatSendActions } from './chatStoreSendActions.js';
import { createChatTransferActions } from './chatStoreTransferActions.js';
import { createSyncStatusActions } from './chatStoreSyncStatus.js';
import type { ChatStore } from './chatStoreTypes.js';
import { SEARCH_CONTACT_LIMIT, SEARCH_MESSAGE_LIMIT } from '../features/search/globalSearch.js';

export const useChatStore = create<ChatStore>((set, get) => ({
    myIdentity: null,
    networkAddress: '',
    contacts: [],
    groups: [],
    targetUpeerId: '',
    activeGroupId: '',
    chatHistory: [],
    groupChatHistory: [],
    searchQuery: '',
    searchChip: 'all',
    searchSections: [],
    searchRawMessages: [],
    searchMessageLimit: SEARCH_MESSAGE_LIMIT,
    searchContactLimit: SEARCH_CONTACT_LIMIT,
    searchLoading: { chats: false, contacts: false, groups: false, messages: false },
    isWindowedHistory: false,
    messagesByConversation: {},
    replyByConversation: {},
    typingStatus: {},
    peerActivity: {},
    incomingRequests: {},
    untrustworthyAlert: null,
    untrustworthyAlerts: {},
    keyChangeAlerts: {},
    pendingFiles: [],
    isDragging: false,
    isHydrating: true,
    historyLoadingByChat: {},
    setMyIdentity: (identity) => set({ myIdentity: identity }),
    setNetworkAddress: (networkAddress) => set({ networkAddress }),
    ...createSyncStatusActions(set),
    ...createChatHistoryActions(set, get),
    ...createChatSearchActions(set, get),
    ...createChatOperationActions(set, get),
    ...createChatSendActions(set, get),
    ...createChatTransferActions(set, get),
    ...createChatListenerActions(set, get),
}));
