import { useChatStore } from './useChatStore.js';
import { useChatActionsStore } from './useChatActionsStore.js';

export function resetAccountStores(): void {
    useChatStore.setState({
        myIdentity: null,
        contacts: [],
        groups: [],
        targetUpeerId: '',
        activeGroupId: '',
        chatHistory: [],
        groupChatHistory: [],
        searchQuery: '',
        searchSections: [],
        searchRawMessages: [],
        searchMessageLimit: 10,
        searchContactLimit: 5,
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
        historyLoading: false,
    });
    useChatActionsStore.setState({ contactPrefs: {}, groupPrefs: {}, messagePrefs: {} });
    localStorage.removeItem('chat-actions-prefs');
}