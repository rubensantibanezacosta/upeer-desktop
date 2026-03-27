import { ipcRenderer, webUtils } from 'electron';
import type { IncomingContactRequestEvent, IncomingDirectMessageEvent, IncomingGroupMessageEvent, LinkPreview, PendingFile, TransferMessageUpdates } from './types/chat.js';

type ContactCardPayload = {
    name: string;
    address: string;
    upeerId?: string;
    publicKey?: string;
    avatar?: string;
};

type FileDialogFilter = {
    name: string;
    extensions: string[];
};

type FileDialogOptions = {
    title?: string;
    filters?: FileDialogFilter[];
    defaultPath?: string;
    multiSelect?: boolean;
};

type MessageReactionUpdatedPayload = {
    msgId: string;
    upeerId: string;
    chatUpeerId: string;
    emoji: string;
    remove: boolean;
};

type MessageUpdatedPayload = {
    id: string;
    upeerId: string;
    chatUpeerId: string;
    content: string;
};

type MessageDeletedPayload = {
    id: string;
    upeerId: string;
    chatUpeerId: string;
};

type ContactPresencePayload = {
    upeerId: string;
    lastSeen: string;
};

type HandshakeFinishedPayload = {
    upeerId: string;
};

type ContactUntrustworthyPayload = {
    upeerId: string;
    address: string;
    alias?: string;
    reason: string;
};

type GroupUpdatedPayload = {
    groupId: string;
    members?: string[];
};

type GroupInvitePayload = {
    groupId: string;
};

type GroupMessageDeliveredPayload = {
    id: string;
    groupId: string;
    upeerId: string;
};

const subscribe = <Args extends unknown[]>(channel: string, callback: (...args: Args) => void) => {
    const listener = (_event: unknown, ...args: unknown[]) => callback(...args as Args);
    ipcRenderer.on(channel, listener);
    return () => {
        ipcRenderer.off(channel, listener);
    };
};

const persistSelectedFile = (file: File) => {
    try {
        const filePath = webUtils.getPathForFile(file);
        if (!filePath) {
            return Promise.resolve({ success: false, error: 'No se pudo resolver la ruta del archivo seleccionado' });
        }
        return ipcRenderer.invoke('register-trusted-selected-file', { filePath })
            .then((registrationResult: { success: boolean; error?: string }) => {
                if (!registrationResult?.success) {
                    return { success: false, error: registrationResult?.error || 'No se pudo validar el archivo seleccionado' };
                }
                return ipcRenderer.invoke('persist-selected-file', { filePath, fileName: file.name });
            });
    } catch (error) {
        return Promise.resolve({ success: false, error: error instanceof Error ? error.message : 'No se pudo resolver la ruta del archivo seleccionado' });
    }
};

const identityApi = {
    getMyNetworkAddress: () => ipcRenderer.invoke('get-ygg-ip'),
    getMyIdentity: () => ipcRenderer.invoke('get-my-identity'),
    getVaultStats: () => ipcRenderer.invoke('get-vault-stats'),
    identityStatus: () => ipcRenderer.invoke('identity-status'),
    generateMnemonic: () => ipcRenderer.invoke('generate-mnemonic'),
    getMnemonic: (pin: string) => ipcRenderer.invoke('get-mnemonic', { pin }),
    createMnemonicIdentity: (mnemonic: string, alias?: string, avatar?: string) => ipcRenderer.invoke('create-mnemonic-identity', { mnemonic, alias, avatar }),
    unlockSession: (mnemonic: string) => ipcRenderer.invoke('unlock-session', { mnemonic }),
    lockSession: () => ipcRenderer.invoke('lock-session'),
    setMyAlias: (alias: string) => ipcRenderer.invoke('set-my-alias', { alias }),
    setMyAvatar: (avatar: string) => ipcRenderer.invoke('set-my-avatar', { avatar }),
    getMyReputation: () => ipcRenderer.invoke('get-my-reputation'),
};

const contactApi = {
    addContact: (address: string, name: string) => ipcRenderer.invoke('add-contact', { address, name }),
    acceptContactRequest: (upeerId: string, publicKey: string) => ipcRenderer.invoke('accept-contact-request', { upeerId, publicKey }),
    deleteContact: (upeerId: string) => ipcRenderer.invoke('delete-contact', { upeerId }),
    blockContact: (upeerId: string) => ipcRenderer.invoke('block-contact', { upeerId }),
    unblockContact: (upeerId: string) => ipcRenderer.invoke('unblock-contact', { upeerId }),
    toggleFavoriteContact: (upeerId: string, isFavorite: boolean) => ipcRenderer.invoke('toggle-favorite-contact', { upeerId, isFavorite }),
    clearChat: (upeerId: string) => ipcRenderer.invoke('clear-chat', { upeerId }),
    getBlockedContacts: () => ipcRenderer.invoke('get-blocked-contacts'),
    getContacts: () => ipcRenderer.invoke('get-contacts'),
};

const messagingApi = {
    sendMessage: (upeerId: string, message: string, replyTo?: string, linkPreview?: LinkPreview | null, messageId?: string) => ipcRenderer.invoke('send-p2p-message', { upeerId, message, replyTo, linkPreview, messageId }),
    sendTypingIndicator: (upeerId: string) => ipcRenderer.invoke('send-typing-indicator', { upeerId }),
    sendReadReceipt: (upeerId: string, id: string) => ipcRenderer.invoke('send-read-receipt', { upeerId, id }),
    sendContactCard: (targetUpeerId: string, contact: ContactCardPayload) => ipcRenderer.invoke('send-contact-card', { targetUpeerId, contact }),
    sendChatReaction: (upeerId: string, msgId: string, emoji: string, remove: boolean) => ipcRenderer.invoke('send-chat-reaction', { upeerId, msgId, emoji, remove }),
    sendChatUpdate: (upeerId: string, msgId: string, newContent: string, linkPreview?: LinkPreview | null) => ipcRenderer.invoke('send-chat-update', { upeerId, msgId, newContent, linkPreview }),
    sendChatDelete: (upeerId: string, msgId: string) => ipcRenderer.invoke('send-chat-delete', { upeerId, msgId }),
    getMessages: (upeerId: string) => ipcRenderer.invoke('get-messages', upeerId),
    searchMessages: (query: string) => ipcRenderer.invoke('search-messages', { query }),
    getMessagesAround: (chatUpeerId: string, targetMsgId: string) => ipcRenderer.invoke('get-messages-around', { chatUpeerId, targetMsgId }),
};

const deviceApi = {
    getDevices: () => ipcRenderer.invoke('get-devices'),
    setDeviceTrust: (deviceId: string, isTrusted: boolean) => ipcRenderer.invoke('set-device-trust', { deviceId, isTrusted }),
    deleteDevice: (deviceId: string) => ipcRenderer.invoke('delete-device', { deviceId }),
    getMyDevices: () => ipcRenderer.invoke('get-my-devices'),
};

const groupApi = {
    getGroups: () => ipcRenderer.invoke('get-groups'),
    createGroup: (name: string, memberUpeerIds: string[], avatar?: string) => ipcRenderer.invoke('create-group', { name, memberUpeerIds, avatar }),
    updateGroupAvatar: (groupId: string, avatar: string) => ipcRenderer.invoke('update-group-avatar', { groupId, avatar }),
    sendGroupMessage: (groupId: string, message: string, replyTo?: string, linkPreview?: LinkPreview | null) => ipcRenderer.invoke('send-group-message', { groupId, message, replyTo, linkPreview }),
    inviteToGroup: (groupId: string, upeerId: string) => ipcRenderer.invoke('invite-to-group', { groupId, upeerId }),
    updateGroup: (groupId: string, fields: { name?: string; avatar?: string | null }) => ipcRenderer.invoke('update-group', { groupId, ...fields }),
    toggleFavoriteGroup: (groupId: string, isFavorite: boolean) => ipcRenderer.invoke('toggle-favorite-group', { groupId, isFavorite }),
    leaveGroup: (groupId: string) => ipcRenderer.invoke('leave-group', { groupId }),
};

const fileApi = {
    openFileDialog: (options?: FileDialogOptions) => ipcRenderer.invoke('open-file-dialog', options || {}),
    persistInternalAsset: (data: { filePath: string; fileName: string }) => ipcRenderer.invoke('persist-internal-asset', data),
    persistSelectedFile,
    readFileAsBase64: (filePath: string, maxSizeMB?: number) => ipcRenderer.invoke('read-file-as-base64', { filePath, maxSizeMB }),
    getPathForFile: (file: File) => webUtils.getPathForFile(file),
    saveBufferToTemp: (data: { base64: string; fileName: string }) => ipcRenderer.invoke('save-buffer-to-temp', data),
    showSaveDialog: (options: { defaultPath?: string; filters?: Array<{ name: string; extensions: string[] }> }) => ipcRenderer.invoke('show-save-dialog', options),
    openFile: (filePath: string) => ipcRenderer.invoke('open-file', { filePath }),
    openExternal: (url: string) => ipcRenderer.invoke('open-external', { url }),
    generateVideoThumbnail: (filePath: string) => ipcRenderer.invoke('generate-video-thumbnail', { filePath }),
};

const fileTransferApi = {
    startFileTransfer: (upeerId: string, filePath: string, thumbnail?: string, caption?: string, isVoiceNote?: boolean, fileName?: string) => ipcRenderer.invoke('start-file-transfer', { upeerId, filePath, thumbnail, caption, isVoiceNote, fileName }),
    cancelFileTransfer: (fileId: string, reason?: string) => ipcRenderer.invoke('cancel-file-transfer', { fileId, reason: reason || 'User cancelled' }),
    retryFileTransfer: (fileId: string) => ipcRenderer.invoke('retry-file-transfer', { fileId }),
    getFileTransfers: () => ipcRenderer.invoke('get-file-transfers'),
    saveTransferredFile: (fileId: string, destinationPath: string) => ipcRenderer.invoke('save-transferred-file', { fileId, destinationPath }),
};

const networkApi = {
    fetchOgPreview: (url: string) => ipcRenderer.invoke('fetch-og-preview', { url }),
    getNetworkStats: () => ipcRenderer.invoke('get-network-stats'),
    restartYggstack: () => ipcRenderer.invoke('restart-yggstack'),
};

const securityApi = {
    isPinEnabled: () => ipcRenderer.invoke('is-pin-enabled'),
    setPin: (args: { newPin: string; currentPin?: string }) => ipcRenderer.invoke('set-pin', args),
    disablePin: (args: { pin: string }) => ipcRenderer.invoke('disable-pin', args),
    verifyPin: (args: { pin: string }) => ipcRenderer.invoke('verify-pin', args),
};

const eventApi = {
    onGroupUpdated: (callback: (data: GroupUpdatedPayload) => void) => subscribe<[GroupUpdatedPayload]>('group-updated', callback),
    onGroupMessage: (callback: (data: IncomingGroupMessageEvent) => void) => subscribe<[IncomingGroupMessageEvent]>('receive-group-message', callback),
    onGroupInvite: (callback: (data: GroupInvitePayload) => void) => subscribe<[GroupInvitePayload]>('group-invite-received', callback),
    onGroupMessageDelivered: (callback: (data: GroupMessageDeliveredPayload) => void) => subscribe<[GroupMessageDeliveredPayload]>('group-message-delivered', callback),
    onReceive: (callback: (data: IncomingDirectMessageEvent) => void) => subscribe<[IncomingDirectMessageEvent]>('receive-p2p-message', callback),
    onPresence: (callback: (data: ContactPresencePayload) => void) => subscribe<[ContactPresencePayload]>('contact-presence', callback),
    onContactRequest: (callback: (data: IncomingContactRequestEvent) => void) => subscribe<[IncomingContactRequestEvent]>('contact-request-received', callback),
    onHandshakeFinished: (callback: (data: HandshakeFinishedPayload) => void) => subscribe<[HandshakeFinishedPayload]>('contact-handshake-finished', callback),
    onContactUntrustworthy: (callback: (data: ContactUntrustworthyPayload) => void) => subscribe<[ContactUntrustworthyPayload]>('contact-untrustworthy', callback),
    onReputationUpdated: (callback: () => void) => subscribe('reputation-updated', () => callback()),
    onKeyChangeAlert: (callback: (data: { upeerId: string; oldFingerprint: string; newFingerprint: string; alias: string }) => void) => subscribe('key-change-alert', (data) => callback(data)),
    onMessageDelivered: (callback: (data: { id: string; upeerId: string }) => void) => subscribe('message-delivered', (data) => callback(data)),
    onMessageRead: (callback: (data: { id: string; upeerId: string }) => void) => subscribe('message-read', (data) => callback(data)),
    onMessageReactionUpdated: (callback: (data: MessageReactionUpdatedPayload) => void) => subscribe<[MessageReactionUpdatedPayload]>('message-reaction-updated', callback),
    onMessageUpdated: (callback: (data: MessageUpdatedPayload) => void) => subscribe<[MessageUpdatedPayload]>('message-updated', callback),
    onMessageDeleted: (callback: (data: MessageDeletedPayload) => void) => subscribe<[MessageDeletedPayload]>('message-deleted', callback),
    onChatCleared: (callback: (data: { upeerId: string }) => void) => subscribe('chat-cleared', (data) => callback(data)),
    onMessageStatusUpdated: (callback: (data: { id: string; status: string }) => void) => subscribe('message-status-updated', (data) => callback(data)),
    onTyping: (callback: (data: { upeerId: string }) => void) => subscribe('peer-typing', (data) => callback(data)),
    onFocusConversation: (callback: (data: { upeerId?: string; groupId?: string }) => void) => subscribe('focus-conversation', (data) => callback(data)),
    onFileTransferStarted: (callback: (data: TransferMessageUpdates) => void) => subscribe<[TransferMessageUpdates]>('file-transfer-started', callback),
    onFileTransferProgress: (callback: (data: TransferMessageUpdates) => void) => subscribe<[TransferMessageUpdates]>('file-transfer-progress', callback),
    onFileTransferCompleted: (callback: (data: TransferMessageUpdates) => void) => subscribe<[TransferMessageUpdates]>('file-transfer-completed', callback),
    onFileTransferCancelled: (callback: (data: TransferMessageUpdates) => void) => subscribe<[TransferMessageUpdates]>('file-transfer-cancelled', callback),
    onFileTransferFailed: (callback: (data: TransferMessageUpdates) => void) => subscribe<[TransferMessageUpdates]>('file-transfer-failed', callback),
    onYggstackAddress: (callback: (address: string) => void) => subscribe('yggstack-address', (address: string) => callback(address)),
    onYggstackStatus: (callback: (status: string, address?: string) => void) => subscribe('yggstack-status', (status: string, address?: string) => callback(status, address)),
};

export const buildPreloadBridge = () => ({
    ...identityApi,
    ...contactApi,
    ...messagingApi,
    ...deviceApi,
    ...groupApi,
    ...fileApi,
    ...fileTransferApi,
    ...networkApi,
    ...securityApi,
    ...eventApi,
});