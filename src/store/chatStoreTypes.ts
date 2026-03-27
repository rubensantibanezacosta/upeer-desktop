import type { StateCreator } from 'zustand';
import type { ChatMessage, Contact, Group, IncomingRequest, MyIdentity, PendingFile, TransferMessageUpdates, LinkPreview, UntrustworthyInfo } from '../types/chat.js';

export interface ChatState {
    myIdentity: MyIdentity | null;
    networkAddress: string;
    contacts: Contact[];
    groups: Group[];
    targetUpeerId: string;
    activeGroupId: string;
    chatHistory: ChatMessage[];
    groupChatHistory: ChatMessage[];
    searchResults: ChatMessage[];
    isWindowedHistory: boolean;
    messagesByConversation: Record<string, string>;
    replyByConversation: Record<string, ChatMessage | null>;
    typingStatus: Record<string, NodeJS.Timeout>;
    incomingRequests: Record<string, IncomingRequest>;
    untrustworthyAlert: UntrustworthyInfo | null;
    untrustworthyAlerts: Record<string, UntrustworthyInfo>;
    pendingFiles: PendingFile[];
    isDragging: boolean;
}

export interface ChatActions {
    setMyIdentity: (identity: MyIdentity | null) => void;
    setNetworkAddress: (addr: string) => void;
    setTargetUpeerId: (id: string) => void;
    setActiveGroupId: (id: string) => void;
    setMessage: (id: string, val: string) => void;
    setReplyToMessage: (id: string, val: ChatMessage | null) => void;
    setChatHistory: (history: ChatMessage[]) => void;
    setGroupChatHistory: (history: ChatMessage[]) => void;
    handleSearchGlobal: (query: string) => Promise<void>;
    loadHistoryAround: (targetMsgId: string) => Promise<void>;
    reloadLatestHistory: () => Promise<void>;
    refreshContacts: () => Promise<void>;
    refreshGroups: () => Promise<void>;
    refreshData: () => Promise<void>;
    handleSend: (linkPreview?: LinkPreview | null) => Promise<void>;
    handleShareContact: (contact: { name: string; address: string; upeerId?: string; publicKey?: string; avatar?: string }) => Promise<void>;
    handleSendGroupMessage: (message: string, linkPreview?: LinkPreview | null) => Promise<void>;
    handleReaction: (msgId: string, emoji: string, remove: boolean) => void;
    handleUpdateMessage: (msgId: string, newContent: string, linkPreview?: LinkPreview | null) => void;
    handleDeleteMessage: (msgId: string) => void;
    handleTyping: () => void;
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
    setPendingFiles: (files: PendingFile[]) => void;
    setIsDragging: (dragging: boolean) => void;
    handleRetryMessage: (msgId: string) => Promise<void>;
    addFileTransferMessage: (upeerId: string, fileId: string, fileName: string, fileSize: number, mimeType: string, fileHash: string, thumbnail?: string, caption?: string, isMine?: boolean, filePath?: string, isVoiceNote?: boolean) => void;
    updateFileTransferMessage: (fileId: string, updates: TransferMessageUpdates) => void;
    initListeners: () => void;
}

export type ChatStore = ChatState & ChatActions;
export type ChatSet = Parameters<StateCreator<ChatStore>>[0];
export type ChatGet = Parameters<StateCreator<ChatStore>>[1];
