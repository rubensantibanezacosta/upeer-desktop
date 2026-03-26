export interface ContactPresenceEvent {
    upeerId: string;
    lastSeen: string;
    alias?: string;
    avatar?: string;
}

export interface ContactRequestReceivedEvent {
    upeerId: string;
    alias: string;
    avatar?: string;
    publicKey: string;
    address: string;
}

export interface ContactHandshakeFinishedEvent {
    upeerId: string;
    alias: string;
    avatar?: string;
    address: string;
}

export interface ContactUntrustworthyEvent {
    upeerId: string;
    alias: string;
    reason: string;
}

export interface KeyChangeAlertEvent {
    upeerId: string;
    oldFingerprint: string;
    newFingerprint: string;
    alias: string;
}

export interface ReceiveP2PMessageEvent {
    id: string;
    upeerId: string;
    content: string;
    replyTo?: string;
    signature: string;
    timestamp: number;
}

export interface MessageDeliveredEvent {
    id: string;
    upeerId: string;
}

export interface MessageReadEvent {
    id: string;
    upeerId: string;
}

export interface MessageReactionUpdatedEvent {
    msgId: string;
    upeerId: string;
    emoji: string;
    remove: boolean;
}

export interface MessageUpdatedEvent {
    id: string;
    upeerId: string;
    newContent: string;
    signature: string;
}

export interface MessageDeletedEvent {
    id: string;
    upeerId: string;
}

export interface MessageStatusUpdatedEvent {
    id: string;
    status: string;
}

export interface PeerTypingEvent {
    upeerId: string;
}

export interface GroupUpdatedEvent {
    groupId: string;
    name?: string;
    avatar?: string | null;
    adminUpeerId: string;
}

export interface ReceiveGroupMessageEvent {
    id: string;
    groupId: string;
    senderUpeerId: string;
    content: string;
    replyTo?: string;
    signature: string;
    timestamp: number;
}

export interface GroupInviteReceivedEvent {
    groupId: string;
    groupName: string;
    adminUpeerId: string;
    members: string[];
    avatar?: string;
}

export interface GroupMessageDeliveredEvent {
    id: string;
    groupId: string;
    upeerId: string;
}

export interface FileTransferStartedEvent {
    fileId: string;
    sessionFileId?: string;
    upeerId: string;
    chatUpeerId?: string;
    messageId?: string;
    fileName: string;
    fileSize: number;
    mimeType?: string;
    direction: 'sending' | 'receiving';
    state: string;
    phase: number;
    chunksProcessed: number;
    totalChunks: number;
    thumbnail?: string;
    fileHash: string;
    isVaulting?: boolean;
    isVoiceNote?: boolean;
    tempPath?: string;
    progress: number;
    bytesTransferred: number;
    totalBytes: number;
    chunksTransferred: number;
}

export interface FileTransferProgressEvent extends FileTransferStartedEvent {
    state: 'active' | 'completed' | 'failed' | 'cancelled';
}

export type FileTransferCompletedEvent = FileTransferStartedEvent;

export interface FileTransferCancelledEvent {
    fileId: string;
    upeerId: string;
    reason: string;
}

export interface FileTransferFailedEvent {
    fileId: string;
    upeerId: string;
    error: string;
}

export interface YggstackAddressEvent {
    address: string;
}

export interface YggstackStatusEvent {
    status: 'connecting' | 'up' | 'down' | 'reconnecting';
    address?: string;
}
