export interface LinkPreview {
    url: string;
    title?: string;
    description?: string;
    imageBase64?: string;
    domain?: string;
}

export interface ChatMessage {
    id?: string;
    upeerId: string;
    isMine: boolean;
    message: string;
    status: string;
    timestamp: string;
    replyTo?: string;
    encrypted?: boolean;
    isDeleted?: boolean;
    isEdited?: boolean;
    reactions?: Array<{
        upeerId: string;
        emoji: string;
    }>;
    // Group message extras
    senderUpeerId?: string;
    senderName?: string;
    senderAvatar?: string;
    groupId?: string;
    isSystem?: boolean;
    date: number;
}

export interface MessageReaction {
    upeerId: string;
    emoji: string;
}

export interface RawChatMessage {
    id?: string;
    chatUpeerId: string;
    isMine: boolean | number;
    message: string;
    status: string;
    timestamp: number;
    replyTo?: string;
    reactions?: MessageReaction[];
    isEdited?: boolean | number;
    isDeleted?: boolean | number;
    senderUpeerId?: string;
    senderName?: string;
}

export interface MyIdentity {
    address: string | null;
    upeerId: string;
    publicKey: string;
    alias?: string | null;
    name?: string | null;
    avatar?: string | null;
}

export interface UntrustworthyInfo {
    reason?: string;
    details?: string;
    scoreImpact?: number;
    [key: string]: unknown;
}

export interface IncomingRequest {
    publicKey: string;
    avatar?: string;
    receivedAt?: number;
    untrustworthy?: UntrustworthyInfo | null;
    vouchScore?: number;
}

export interface IncomingContactRequestEvent {
    upeerId: string;
    address: string;
    alias?: string;
    publicKey: string;
    avatar?: string;
    vouchScore?: number;
}

export interface IncomingDirectMessageEvent extends RawChatMessage {
    upeerId: string;
    timestamp?: number;
}

export interface IncomingGroupMessageEvent extends RawChatMessage {
    groupId: string;
    isSystem?: boolean;
    timestamp?: number;
}

export interface PendingFile {
    path: string;
    name: string;
    size: number;
    type: string;
    lastModified: number;
}

export interface TransferMessageUpdates {
    filePath?: string;
    savedPath?: string;
    tempPath?: string;
    status?: string;
    progress?: number;
    phase?: number;
    error?: string;
    [key: string]: unknown;
}

export interface GroupRecord extends Omit<Group, 'members'> {
    members: string[] | string;
}

export interface ReputationData {
    vouchScore: number;
    connectionCount: number;
}

export interface Contact {
    upeerId: string;
    address: string;
    name: string;
    alias?: string | null;
    isFavorite?: boolean;
    status: 'pending' | 'incoming' | 'connected' | 'offline' | 'blocked';
    publicKey?: string;
    avatar?: string;
    lastSeen?: string;
    lastMessage?: string;
    lastMessageTime?: string;
    lastMessageIsMine?: boolean;
    lastMessageStatus?: string;
    isTyping?: boolean;
    vouchScore?: number;
    knownAddresses?: string[];
    blockedAt?: string | null;
    isConversationOnly?: boolean;
}

export interface Group {
    groupId: string;
    name: string;
    adminUpeerId: string;
    members: string[];
    isFavorite?: boolean;
    status: 'active' | 'invited';
    avatar?: string | null;
    createdAt?: string;
    // UI extras
    lastMessage?: string;
    lastMessageTime?: string;
    lastMessageStatus?: string;
    lastMessageIsMine?: boolean;
}

export interface MediaItem {
    url: string;
    fileName: string;
    mimeType: string;
    fileId: string;
    messageId?: string;
    thumbnail?: string;
    senderName?: string;
    senderAvatar?: string;
    timestamp?: string;
}

