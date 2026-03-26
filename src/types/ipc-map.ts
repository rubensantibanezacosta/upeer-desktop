import type {
    GetMyNetworkAddressResponse,
    GetMyIdentityResponse,
    GetVaultStatsResponse,
    IdentityStatusResponse,
    GenerateMnemonicResponse,
    CreateMnemonicIdentityRequest,
    CreateMnemonicIdentityResponse,
    UnlockSessionRequest,
    UnlockSessionResponse,
    LockSessionResponse,
    SetMyAliasRequest,
    SetMyAliasResponse,
    SetMyAvatarRequest,
    SetMyAvatarResponse,
    GetMyReputationResponse,
    AddContactRequest,
    AddContactResponse,
    AcceptContactRequestRequest,
    AcceptContactRequestResponse,
    DeleteContactRequest,
    DeleteContactResponse,
    ToggleFavoriteContactRequest,
    ToggleFavoriteContactResponse,
    ClearChatRequest,
    ClearChatResponse,
    BlockContactRequest,
    BlockContactResponse,
    UnblockContactRequest,
    UnblockContactResponse,
    GetBlockedContactsResponse,
    GetContactsResponse,
} from './ipc-identity.js';
import type {
    SendMessageRequest,
    SendMessageResponse,
    SendTypingIndicatorRequest,
    SendTypingIndicatorResponse,
    SendReadReceiptRequest,
    SendReadReceiptResponse,
    SendContactCardRequest,
    SendContactCardResponse,
    SendChatReactionRequest,
    SendChatReactionResponse,
    SendChatUpdateRequest,
    SendChatUpdateResponse,
    SendChatDeleteRequest,
    SendChatDeleteResponse,
    GetMessagesRequest,
    GetMessagesResponse,
} from './ipc-messaging.js';
import type {
    GetGroupsResponse,
    CreateGroupRequest,
    CreateGroupResponse,
    UpdateGroupAvatarRequest,
    UpdateGroupAvatarResponse,
    SendGroupMessageRequest,
    SendGroupMessageResponse,
    InviteToGroupRequest,
    InviteToGroupResponse,
    UpdateGroupRequest,
    UpdateGroupResponse,
    ToggleFavoriteGroupRequest,
    ToggleFavoriteGroupResponse,
    LeaveGroupRequest,
    LeaveGroupResponse,
} from './ipc-groups.js';
import type {
    OpenFileDialogOptions,
    OpenFileDialogResponse,
    ReadFileAsBase64Request,
    ReadFileAsBase64Response,
    GetPathForFileRequest,
    GetPathForFileResponse,
    StartFileTransferRequest,
    StartFileTransferResponse,
    CancelFileTransferRequest,
    CancelFileTransferResponse,
    GetFileTransfersResponse,
    SaveTransferredFileRequest,
    SaveTransferredFileResponse,
    GetNetworkStatsResponse,
    RestartYggstackResponse,
    ShowSaveDialogOptions,
    ShowSaveDialogResponse,
    OpenFileRequest,
    OpenFileResponse,
} from './ipc-files.js';
import type {
    ContactPresenceEvent,
    ContactRequestReceivedEvent,
    ContactHandshakeFinishedEvent,
    ContactUntrustworthyEvent,
    KeyChangeAlertEvent,
    ReceiveP2PMessageEvent,
    MessageDeliveredEvent,
    MessageReadEvent,
    MessageReactionUpdatedEvent,
    MessageUpdatedEvent,
    MessageDeletedEvent,
    MessageStatusUpdatedEvent,
    PeerTypingEvent,
    GroupUpdatedEvent,
    ReceiveGroupMessageEvent,
    GroupInviteReceivedEvent,
    GroupMessageDeliveredEvent,
    FileTransferStartedEvent,
    FileTransferProgressEvent,
    FileTransferCompletedEvent,
    FileTransferCancelledEvent,
    FileTransferFailedEvent,
    YggstackAddressEvent,
    YggstackStatusEvent,
} from './ipc-events.js';

export interface IPCMap {
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
    'add-contact': { request: AddContactRequest; response: AddContactResponse };
    'accept-contact-request': { request: AcceptContactRequestRequest; response: AcceptContactRequestResponse };
    'delete-contact': { request: DeleteContactRequest; response: DeleteContactResponse };
    'toggle-favorite-contact': { request: ToggleFavoriteContactRequest; response: ToggleFavoriteContactResponse };
    'clear-chat': { request: ClearChatRequest; response: ClearChatResponse };
    'block-contact': { request: BlockContactRequest; response: BlockContactResponse };
    'unblock-contact': { request: UnblockContactRequest; response: UnblockContactResponse };
    'get-blocked-contacts': { request: void; response: GetBlockedContactsResponse };
    'get-contacts': { request: void; response: GetContactsResponse };
    'send-p2p-message': { request: SendMessageRequest; response: SendMessageResponse };
    'send-typing-indicator': { request: SendTypingIndicatorRequest; response: SendTypingIndicatorResponse };
    'send-read-receipt': { request: SendReadReceiptRequest; response: SendReadReceiptResponse };
    'send-contact-card': { request: SendContactCardRequest; response: SendContactCardResponse };
    'send-chat-reaction': { request: SendChatReactionRequest; response: SendChatReactionResponse };
    'send-chat-update': { request: SendChatUpdateRequest; response: SendChatUpdateResponse };
    'send-chat-delete': { request: SendChatDeleteRequest; response: SendChatDeleteResponse };
    'get-messages': { request: GetMessagesRequest; response: GetMessagesResponse };
    'get-groups': { request: void; response: GetGroupsResponse };
    'create-group': { request: CreateGroupRequest; response: CreateGroupResponse };
    'update-group-avatar': { request: UpdateGroupAvatarRequest; response: UpdateGroupAvatarResponse };
    'send-group-message': { request: SendGroupMessageRequest; response: SendGroupMessageResponse };
    'invite-to-group': { request: InviteToGroupRequest; response: InviteToGroupResponse };
    'update-group': { request: UpdateGroupRequest; response: UpdateGroupResponse };
    'toggle-favorite-group': { request: ToggleFavoriteGroupRequest; response: ToggleFavoriteGroupResponse };
    'leave-group': { request: LeaveGroupRequest; response: LeaveGroupResponse };
    'open-file-dialog': { request: OpenFileDialogOptions; response: OpenFileDialogResponse };
    'read-file-as-base64': { request: ReadFileAsBase64Request; response: ReadFileAsBase64Response };
    'get-path-for-file': { request: GetPathForFileRequest; response: GetPathForFileResponse };
    'start-file-transfer': { request: StartFileTransferRequest; response: StartFileTransferResponse };
    'cancel-file-transfer': { request: CancelFileTransferRequest; response: CancelFileTransferResponse };
    'get-file-transfers': { request: void; response: GetFileTransfersResponse };
    'save-transferred-file': { request: SaveTransferredFileRequest; response: SaveTransferredFileResponse };
    'get-network-stats': { request: void; response: GetNetworkStatsResponse };
    'restart-yggstack': { request: void; response: RestartYggstackResponse };
    'show-save-dialog': { request: ShowSaveDialogOptions; response: ShowSaveDialogResponse };
    'open-file': { request: OpenFileRequest; response: OpenFileResponse };
}

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
