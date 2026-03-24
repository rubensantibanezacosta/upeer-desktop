/**
 * Tipos TypeScript compartidos para comunicación IPC entre main y renderer.
 * Estas interfaces deben mantenerse sincronizadas con:
 *   - src/preload.ts (exposed API)
 *   - src/main_process/core/ipcHandlers/ (handlers)
 */

// ============================================================================
// Request/Response Types for IPC Invocations
// ============================================================================

// Identity & Network
export interface GetMyNetworkAddressResponse {
    address: string;
}

export interface GetMyIdentityResponse {
    upeerId: string;
    alias: string;
    avatar: string | null;
    publicKey: string;
    fingerprint: string;
}

export interface GetVaultStatsResponse {
    totalEntries: number;
    storageUsedBytes: number;
    uniqueSenders: number;
    replicationFactor: number;
}

export interface IdentityStatusResponse {
    isUnlocked: boolean;
    hasIdentity: boolean;
    alias?: string;
    avatar?: string;
}

export interface GenerateMnemonicResponse {
    mnemonic: string;
}

export interface CreateMnemonicIdentityRequest {
    mnemonic: string;
    alias?: string;
    avatar?: string;
}

export interface CreateMnemonicIdentityResponse {
    success: boolean;
    upeerId?: string;
    error?: string;
}

export interface UnlockSessionRequest {
    mnemonic: string;
}

export interface UnlockSessionResponse {
    success: boolean;
    error?: string;
}

export interface LockSessionResponse {
    success: boolean;
}

export interface SetMyAliasRequest {
    alias: string;
}

export interface SetMyAliasResponse {
    success: boolean;
    error?: string;
}

export interface SetMyAvatarRequest {
    avatar: string;
}

export interface SetMyAvatarResponse {
    success: boolean;
    error?: string;
}

export interface GetMyReputationResponse {
    score: number;
    totalVouches: number;
    directVouches: number;
    indirectVouches: number;
}

// Contacts
export interface AddContactRequest {
    address: string;
    name: string;
}

export interface AddContactResponse {
    success: boolean;
    upeerId?: string;
    error?: string;
}

export interface AcceptContactRequestRequest {
    upeerId: string;
    publicKey: string;
}

export interface AcceptContactRequestResponse {
    success: boolean;
    error?: string;
}

export interface DeleteContactRequest {
    upeerId: string;
}

export interface DeleteContactResponse {
    success: boolean;
    error?: string;
}

export interface ClearChatRequest {
    upeerId: string;
}

export interface ClearChatResponse {
    success: boolean;
    error?: string;
}

export interface BlockContactRequest {
    upeerId: string;
}

export interface BlockContactResponse {
    success: boolean;
    error?: string;
}

export interface UnblockContactRequest {
    upeerId: string;
}

export interface UnblockContactResponse {
    success: boolean;
    error?: string;
}

export interface GetBlockedContactsResponse {
    blocked: Array<{
        upeerId: string;
        alias: string;
        avatar: string | null;
        blockedAt: string;
    }>;
}

export interface Contact {
    upeerId: string;
    alias: string;
    avatar: string | null;
    address: string;
    publicKey: string;
    status: 'pending' | 'connected' | 'blocked';
    lastSeen: string;
    ephemeralPublicKey?: string;
    ephemeralPublicKeyUpdatedAt?: string;
    signedPreKey?: string;
    signedPreKeyId?: number;
}

export interface GetContactsResponse {
    contacts: Contact[];
}

// Messaging
export interface SendMessageRequest {
    upeerId: string;
    message: string;
    replyTo?: string;
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

// Groups
export interface Group {
    id: string;
    name: string;
    adminUpeerId: string;
    members: string[];
    status: 'active' | 'archived';
    avatar: string | null;
}

export interface GetGroupsResponse {
    groups: Group[];
}

export interface CreateGroupRequest {
    name: string;
    memberUpeerIds: string[];
    avatar?: string;
}

export interface CreateGroupResponse {
    success: boolean;
    groupId?: string;
    error?: string;
}

export interface UpdateGroupAvatarRequest {
    groupId: string;
    avatar: string;
}

export interface UpdateGroupAvatarResponse {
    success: boolean;
    error?: string;
}

export interface SendGroupMessageRequest {
    groupId: string;
    message: string;
    replyTo?: string;
}

export interface SendGroupMessageResponse {
    id: string;
    timestamp: number;
    savedMessage: string;
}

export interface InviteToGroupRequest {
    groupId: string;
    upeerId: string;
}

export interface InviteToGroupResponse {
    success: boolean;
    error?: string;
}

export interface UpdateGroupRequest {
    groupId: string;
    name?: string;
    avatar?: string | null;
}

export interface UpdateGroupResponse {
    success: boolean;
    error?: string;
}

export interface LeaveGroupRequest {
    groupId: string;
}

export interface LeaveGroupResponse {
    success: boolean;
    error?: string;
}

// File Dialog & Files
export interface OpenFileDialogOptions {
    title?: string;
    filters?: Array<{ name: string; extensions: string[] }>;
    defaultPath?: string;
    multiSelect?: boolean;
}

export interface OpenFileDialogResponse {
    canceled: boolean;
    filePaths: string[];
}

export interface ReadFileAsBase64Request {
    filePath: string;
    maxSizeMB?: number;
}

export interface ReadFileAsBase64Response {
    success: boolean;
    data?: string;
    error?: string;
}

export interface GetPathForFileRequest {
    file: File;
}

export interface GetPathForFileResponse {
    path: string;
}

// File Transfer
export interface StartFileTransferRequest {
    upeerId: string;
    filePath: string;
    thumbnail?: string;
    caption?: string;
    isVoiceNote?: boolean;
    fileName?: string;
}

export interface StartFileTransferResponse {
    success: boolean;
    fileId?: string;
    error?: string;
}

export interface CancelFileTransferRequest {
    fileId: string;
    reason?: string;
}

export interface CancelFileTransferResponse {
    success: boolean;
    error?: string;
}

export interface GetFileTransfersResponse {
    transfers: Array<{
        fileId: string;
        upeerId: string;
        fileName: string;
        fileSize: number;
        transferredBytes: number;
        status: 'pending' | 'transferring' | 'completed' | 'cancelled' | 'failed';
        direction: 'send' | 'receive';
        thumbnail?: string;
        startTime: string;
    }>;
}

export interface SaveTransferredFileRequest {
    fileId: string;
    destinationPath: string;
}

export interface SaveTransferredFileResponse {
    success: boolean;
    error?: string;
}

// Network & Yggstack
export interface GetNetworkStatsResponse {
    yggdrasilAddress: string;
    connectedPeers: number;
    bytesSent: number;
    bytesReceived: number;
    uptimeSeconds: number;
}

export interface RestartYggstackResponse {
    success: boolean;
    error?: string;
}

// Save Dialog
export interface ShowSaveDialogOptions {
    defaultPath?: string;
    filters?: Array<{ name: string; extensions: string[] }>;
}

export interface ShowSaveDialogResponse {
    canceled: boolean;
    filePath?: string;
}

export interface OpenFileRequest {
    filePath: string;
}

export interface OpenFileResponse {
    success: boolean;
    error?: string;
}

// ============================================================================
// Event Types (emitted from main to renderer)
// ============================================================================

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

// Group Events
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

// File Transfer Events
export interface FileTransferStartedEvent {
    fileId: string;
    upeerId: string;
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

export interface FileTransferProgressEvent {
    fileId: string;
    upeerId: string;
    fileName: string;
    fileSize: number;
    mimeType?: string;
    direction: 'sending' | 'receiving';
    state: 'active' | 'completed' | 'failed' | 'cancelled';
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

export interface FileTransferCompletedEvent {
    fileId: string;
    upeerId: string;
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

// Network Events
export interface YggstackAddressEvent {
    address: string;
}

export interface YggstackStatusEvent {
    status: 'connecting' | 'up' | 'down' | 'reconnecting';
    address?: string;
}

// ============================================================================
// Main IPC Channels (for type-safe invocation)
// ============================================================================

/**
 * Mapa de canales IPC a tipos de request/response.
 * Usar con `ipcRenderer.invoke<Channel>(...)` en el renderer
 * y `ipcMain.handle(...)` en el main con tipos correctos.
 */
export interface IPCMap {
    // Identity
    'get-ygg-ip': { request: void; response: GetMyNetworkAddressResponse };
    'get-my-identity': { request: void; response: GetMyIdentityResponse };
    'get-vault-stats': { request: void; response: GetVaultStatsResponse };
    'identity-status': { request: void; response: IdentityStatusResponse };
    'generate-mnemonic': { request: void; response: GenerateMnemonicResponse };
    'create-mnemonic-identity': { request: CreateMnemonicIdentityRequest; response: CreateMnemonicIdentityResponse };
    'unlock-session': { request: UnlockSessionRequest; response: UnlockSessionResponse };
    'lock-session': { request: void; response: LockSessionResponse };
    'set-my-alias': { request: SetMyAliasRequest; response: SetMyAliasResponse };
    'set-my-avatar': { request: SetMyAvatarRequest; response: SetMyAvatarResponse };
    'get-my-reputation': { request: void; response: GetMyReputationResponse };

    // Contacts
    'add-contact': { request: AddContactRequest; response: AddContactResponse };
    'accept-contact-request': { request: AcceptContactRequestRequest; response: AcceptContactRequestResponse };
    'delete-contact': { request: DeleteContactRequest; response: DeleteContactResponse };
    'clear-chat': { request: ClearChatRequest; response: ClearChatResponse };
    'block-contact': { request: BlockContactRequest; response: BlockContactResponse };
    'unblock-contact': { request: UnblockContactRequest; response: UnblockContactResponse };
    'get-blocked-contacts': { request: void; response: GetBlockedContactsResponse };
    'get-contacts': { request: void; response: GetContactsResponse };

    // Messaging
    'send-p2p-message': { request: SendMessageRequest; response: SendMessageResponse };
    'send-typing-indicator': { request: SendTypingIndicatorRequest; response: SendTypingIndicatorResponse };
    'send-read-receipt': { request: SendReadReceiptRequest; response: SendReadReceiptResponse };
    'send-contact-card': { request: SendContactCardRequest; response: SendContactCardResponse };
    'send-chat-reaction': { request: SendChatReactionRequest; response: SendChatReactionResponse };
    'send-chat-update': { request: SendChatUpdateRequest; response: SendChatUpdateResponse };
    'send-chat-delete': { request: SendChatDeleteRequest; response: SendChatDeleteResponse };
    'get-messages': { request: GetMessagesRequest; response: GetMessagesResponse };

    // Groups
    'get-groups': { request: void; response: GetGroupsResponse };
    'create-group': { request: CreateGroupRequest; response: CreateGroupResponse };
    'update-group-avatar': { request: UpdateGroupAvatarRequest; response: UpdateGroupAvatarResponse };
    'send-group-message': { request: SendGroupMessageRequest; response: SendGroupMessageResponse };
    'invite-to-group': { request: InviteToGroupRequest; response: InviteToGroupResponse };
    'update-group': { request: UpdateGroupRequest; response: UpdateGroupResponse };
    'leave-group': { request: LeaveGroupRequest; response: LeaveGroupResponse };

    // Files
    'open-file-dialog': { request: OpenFileDialogOptions; response: OpenFileDialogResponse };
    'read-file-as-base64': { request: ReadFileAsBase64Request; response: ReadFileAsBase64Response };
    'get-path-for-file': { request: GetPathForFileRequest; response: GetPathForFileResponse };

    // File Transfer
    'start-file-transfer': { request: StartFileTransferRequest; response: StartFileTransferResponse };
    'cancel-file-transfer': { request: CancelFileTransferRequest; response: CancelFileTransferResponse };
    'get-file-transfers': { request: void; response: GetFileTransfersResponse };
    'save-transferred-file': { request: SaveTransferredFileRequest; response: SaveTransferredFileResponse };

    // Network
    'get-network-stats': { request: void; response: GetNetworkStatsResponse };
    'restart-yggstack': { request: void; response: RestartYggstackResponse };

    // Dialogs
    'show-save-dialog': { request: ShowSaveDialogOptions; response: ShowSaveDialogResponse };
    'open-file': { request: OpenFileRequest; response: OpenFileResponse };
}

/**
 * Mapa de eventos IPC (main -> renderer)
 */
export interface IPCEventMap {
    'contact-presence': ContactPresenceEvent;
    'contact-request-received': ContactRequestReceivedEvent;
    'contact-handshake-finished': ContactHandshakeFinishedEvent;
    'contact-untrustworthy': ContactUntrustworthyEvent;
    'key-change-alert': KeyChangeAlertEvent;
    'receive-p2p-message': ReceiveP2PMessageEvent;
    'message-delivered': MessageDeliveredEvent;
    'message-read': MessageReadEvent;
    'message-reaction-updated': MessageReactionUpdatedEvent;
    'message-updated': MessageUpdatedEvent;
    'message-deleted': MessageDeletedEvent;
    'message-status-updated': MessageStatusUpdatedEvent;
    'peer-typing': PeerTypingEvent;

    'group-updated': GroupUpdatedEvent;
    'receive-group-message': ReceiveGroupMessageEvent;
    'group-invite-received': GroupInviteReceivedEvent;
    'group-message-delivered': GroupMessageDeliveredEvent;

    'file-transfer-started': FileTransferStartedEvent;
    'file-transfer-progress': FileTransferProgressEvent;
    'file-transfer-completed': FileTransferCompletedEvent;
    'file-transfer-cancelled': FileTransferCancelledEvent;
    'file-transfer-failed': FileTransferFailedEvent;

    'yggstack-address': YggstackAddressEvent;
    'yggstack-status': YggstackStatusEvent;
}