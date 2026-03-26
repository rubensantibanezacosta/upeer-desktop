import type { LinkPreview } from './chat.js';

export interface SendMessageRequest {
    upeerId: string;
    message: string;
    replyTo?: string;
    linkPreview?: LinkPreview | null;
    messageId?: string;
}

export interface SendMessageResponse {
    id: string;
    savedMessage: string;
    timestamp: number;
}

export interface SendTypingIndicatorRequest {
    upeerId: string;
}

export interface SendTypingIndicatorResponse {
    success: boolean;
}

export interface SendReadReceiptRequest {
    upeerId: string;
    id: string;
}

export interface SendReadReceiptResponse {
    success: boolean;
}

export interface SendContactCardRequest {
    targetUpeerId: string;
    contact: {
        name: string;
        address: string;
        upeerId: string;
        publicKey: string;
    };
}

export interface SendContactCardResponse {
    success: boolean;
    msgId?: string;
    error?: string;
}

export interface SendChatReactionRequest {
    upeerId: string;
    msgId: string;
    emoji: string;
    remove: boolean;
}

export interface SendChatReactionResponse {
    success: boolean;
    error?: string;
}

export interface SendChatUpdateRequest {
    upeerId: string;
    msgId: string;
    newContent: string;
    linkPreview?: LinkPreview | null;
}

export interface SendChatUpdateResponse {
    success: boolean;
    error?: string;
}

export interface SendChatDeleteRequest {
    upeerId: string;
    msgId: string;
}

export interface SendChatDeleteResponse {
    success: boolean;
    error?: string;
}

export interface GetMessagesRequest {
    upeerId: string;
}

export interface Message {
    id: string;
    upeerId: string;
    isOutgoing: boolean;
    content: string;
    replyTo?: string;
    signature: string;
    status: 'sent' | 'delivered' | 'read' | 'vaulted' | 'failed';
    timestamp: string;
    reactions: Array<{ upeerId: string; emoji: string }>;
}

export interface GetMessagesResponse {
    messages: Message[];
}
