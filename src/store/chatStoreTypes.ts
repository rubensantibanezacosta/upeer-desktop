import type { StateCreator } from 'zustand';
import type { ChatMessage, Contact, ConversationActivity, ConversationActivitySignal, Group, IncomingRequest, KeyChangeAlert, MyIdentity, PendingFile, TransferMessageUpdates, LinkPreview, UntrustworthyInfo } from '../types/chat.js';
import type { SidebarFilter } from './useNavigationStore.js';
import type { SearchSection } from '../features/search/globalSearch.js';

export interface SearchSectionLoading {
    chats: boolean;
    contacts: boolean;
    groups: boolean;
    messages: boolean;
}


export interface ChatState {
    myIdentity: MyIdentity | null;
    networkAddress: string;
    contacts: Contact[];
    groups: Group[];
    targetUpeerId: string;
    activeGroupId: string;
    chatHistory: ChatMessage[];
    groupChatHistory: ChatMessage[];
    searchQuery: string;
    searchChip: SidebarFilter;
    searchSections: SearchSection[];
    searchRawMessages: ChatMessage[];
    searchMessageLimit: number;
    searchContactLimit: number;
    searchLoading: SearchSectionLoading;
    isWindowedHistory: boolean;
    messagesByConversation: Record<string, string>;
    replyByConversation: Record<string, ChatMessage | null>;
    typingStatus: Record<string, NodeJS.Timeout>;
    peerActivity: Record<string, ConversationActivity>;
    incomingRequests: Record<string, IncomingRequest>;
    untrustworthyAlert: UntrustworthyInfo | null;
    untrustworthyAlerts: Record<string, UntrustworthyInfo>;
    keyChangeAlerts: Record<string, KeyChangeAlert>;
    pendingFiles: PendingFile[];
    isDragging: boolean;
    isHydrating: boolean;
    historyLoading: boolean;
    syncStatus: UpeerSyncStatus;
}

export interface ChatActions {
    setMyIdentity: (identity: MyIdentity | null) => void;
    setNetworkAddress: (addr: string) => void;
    setTargetUpeerId: (id: string) => void;
    setActiveGroupId: (id: string) => void;
    setMessage: (id: string, val: string) => void;
    setReplyToMessage: (id: string, val: ChatMessage | null) => void;
    setChatHistory: (history: ChatMessage[]) => void;
    setHistoryLoading: (loading: boolean) => void;
    setGroupChatHistory: (history: ChatMessage[]) => void;
    handleSearchGlobal: (query: string, chip: SidebarFilter) => Promise<void>;
    loadMoreSearchMessages: () => Promise<void>;
    showAllSearchContacts: () => void;
    loadHistoryAround: (targetMsgId: string) => Promise<void>;
    reloadLatestHistory: () => Promise<void>;
    loadOlderHistory: () => Promise<void>;
    refreshContacts: () => Promise<void>;
    refreshGroups: () => Promise<void>;
    refreshSyncStatus: () => Promise<void>;
    refreshData: () => Promise<void>;
    handleSend: (linkPreview?: LinkPreview | null) => Promise<void>;
    handleShareContact: (contact: { name: string; address: string; upeerId?: string; publicKey?: string; avatar?: string }) => Promise<void>;
    handleSendGroupMessage: (message: string, linkPreview?: LinkPreview | null) => Promise<void>;
    handleReaction: (msgId: string, emoji: string, remove: boolean) => void;
    handleUpdateMessage: (msgId: string, newContent: string, linkPreview?: LinkPreview | null) => void;
    handleDeleteMessage: (msgId: string) => void;
    handleTyping: (state?: ConversationActivitySignal) => void;
    handleCreateGroup: (name: string, memberIds: string[], avatar?: string) => Promise<{ success: boolean; groupId: string }>;
    handleUpdateGroup: (groupId: string, fields: { name?: string, avatar?: string | null }) => Promise<void>;
    handleInviteGroupMembers: (groupId: string, memberIds: string[]) => Promise<void>;
    handleToggleFavoriteGroup: (groupId: string) => Promise<void>;
    handleLeaveGroup: (groupId: string) => Promise<void>;
    handleAddContact: (idAtAddress: string, name: string) => void;
    handleAcceptContact: () => void;
    handleDeleteContact: (id?: string) => void;
    handleToggleFavorite: (id?: string) => Promise<void>;
    handleClearChat: (id?: string) => Promise<void>;
    handleBlockContact: (id?: string) => void;
    handleUnblockContact: (id: string) => void;
    clearUntrustworthyAlert: () => void;
    clearKeyChangeAlert: (upeerId?: string) => void;
    setPendingFiles: (files: PendingFile[]) => void;
    setIsDragging: (dragging: boolean) => void;
    handleRetryMessage: (msgId: string) => Promise<void>;
    addFileTransferMessage: (upeerId: string, fileId: string, fileName: string, fileSize: number, mimeType: string, fileHash: string, thumbnail?: string, caption?: string, isMine?: boolean, filePath?: string, isVoiceNote?: boolean, initialStatus?: string) => void;
    updateFileTransferMessage: (fileId: string, updates: TransferMessageUpdates) => void;
    initListeners: () => void;
}

export type ChatStore = ChatState & ChatActions;
export type ChatSet = Parameters<StateCreator<ChatStore>>[0];
export type ChatGet = Parameters<StateCreator<ChatStore>>[1];
