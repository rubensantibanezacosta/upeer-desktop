import { create } from 'zustand';
import { createChatHistoryActions } from './chatStoreHistory.js';
import { createChatListenerActions } from './chatStoreListeners.js';
import { createChatOperationActions } from './chatStoreOperations.js';
import { createChatSendActions } from './chatStoreSendActions.js';
import { createChatTransferActions } from './chatStoreTransferActions.js';
import { createSyncStatusActions } from './chatStoreSyncStatus.js';
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
    peerActivity: {},
    incomingRequests: {},
    untrustworthyAlert: null,
    untrustworthyAlerts: {},
    keyChangeAlerts: {},
    pendingFiles: [],
    isDragging: false,
    isHydrating: true,
    historyLoading: false,
    setMyIdentity: (identity) => set({ myIdentity: identity }),
    setNetworkAddress: (networkAddress) => set({ networkAddress }),
    ...createSyncStatusActions(set),
    ...createChatHistoryActions(set, get),
    ...createChatOperationActions(set, get),
    ...createChatSendActions(set, get),
    ...createChatTransferActions(set, get),
    ...createChatListenerActions(set, get),
}));
