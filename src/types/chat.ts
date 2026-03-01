export interface ChatMessage {
    id?: string;
    revelnestId: string;
    isMine: boolean;
    message: string;
    status: string;
    timestamp: string;
    replyTo?: string;
    encrypted?: boolean;
    isDeleted?: boolean;
    isEdited?: boolean;
    reactions?: Array<{
        revelnestId: string;
        emoji: string;
    }>;
}

export interface Contact {
    revelnestId: string;
    address: string;
    name: string;
    status: 'pending' | 'incoming' | 'connected';
    publicKey?: string;
    lastSeen?: string;
    lastMessage?: string;
    lastMessageTime?: string;
    lastMessageIsMine?: boolean;
    lastMessageStatus?: string;
    isTyping?: boolean;
}
