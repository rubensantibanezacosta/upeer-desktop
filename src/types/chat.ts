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
    groupId?: string;
    isSystem?: boolean;
    date: number;
}

export interface ReputationData {
    vouchScore: number;
    connectionCount: number;
}

export interface Contact {
    upeerId: string;
    address: string;
    name: string;
    status: 'pending' | 'incoming' | 'connected' | 'blocked';
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
}

export interface Group {
    groupId: string;
    name: string;
    adminUpeerId: string;
    members: string[];
    status: 'active' | 'invited';
    avatar?: string | null;
    createdAt?: string;
    // UI extras
    lastMessage?: string;
    lastMessageTime?: string;
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

