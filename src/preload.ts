import { contextBridge, ipcRenderer, webUtils } from 'electron';

contextBridge.exposeInMainWorld('upeer', {
    getMyNetworkAddress: () => ipcRenderer.invoke('get-ygg-ip'),
    getMyIdentity: () => ipcRenderer.invoke('get-my-identity'),
    getVaultStats: () => ipcRenderer.invoke('get-vault-stats'),
    // Identity / Wallet Auth
    identityStatus: () => ipcRenderer.invoke('identity-status'),
    generateMnemonic: () => ipcRenderer.invoke('generate-mnemonic'),
    createMnemonicIdentity: (mnemonic: string, alias?: string, avatar?: string) => ipcRenderer.invoke('create-mnemonic-identity', { mnemonic, alias, avatar }),
    unlockSession: (mnemonic: string) => ipcRenderer.invoke('unlock-session', { mnemonic }),
    lockSession: () => ipcRenderer.invoke('lock-session'),
    setMyAlias: (alias: string) => ipcRenderer.invoke('set-my-alias', { alias }),
    setMyAvatar: (avatar: string) => ipcRenderer.invoke('set-my-avatar', { avatar }),
    getMyReputation: () => ipcRenderer.invoke('get-my-reputation'),
    addContact: (address: string, name: string) => ipcRenderer.invoke('add-contact', { address, name }),
    acceptContactRequest: (upeerId: string, publicKey: string) => ipcRenderer.invoke('accept-contact-request', { upeerId, publicKey }),
    deleteContact: (upeerId: string) => ipcRenderer.invoke('delete-contact', { upeerId }),
    blockContact: (upeerId: string) => ipcRenderer.invoke('block-contact', { upeerId }),
    unblockContact: (upeerId: string) => ipcRenderer.invoke('unblock-contact', { upeerId }),
    getBlockedContacts: () => ipcRenderer.invoke('get-blocked-contacts'),
    sendMessage: (upeerId: string, message: string, replyTo?: string) => ipcRenderer.invoke('send-p2p-message', { upeerId, message, replyTo }),
    sendTypingIndicator: (upeerId: string) => ipcRenderer.invoke('send-typing-indicator', { upeerId }),
    sendReadReceipt: (upeerId: string, id: string) => ipcRenderer.invoke('send-read-receipt', { upeerId, id }),
    sendContactCard: (targetUpeerId: string, contact: any) => ipcRenderer.invoke('send-contact-card', { targetUpeerId, contact }),
    sendChatReaction: (upeerId: string, msgId: string, emoji: string, remove: boolean) => ipcRenderer.invoke('send-chat-reaction', { upeerId, msgId, emoji, remove }),
    sendChatUpdate: (upeerId: string, msgId: string, newContent: string) => ipcRenderer.invoke('send-chat-update', { upeerId, msgId, newContent }),
    sendChatDelete: (upeerId: string, msgId: string) => ipcRenderer.invoke('send-chat-delete', { upeerId, msgId }),
    getMessages: (upeerId: string) => ipcRenderer.invoke('get-messages', upeerId),
    getContacts: () => ipcRenderer.invoke('get-contacts'),
    // Group API
    getGroups: () => ipcRenderer.invoke('get-groups'),
    createGroup: (name: string, memberUpeerIds: string[], avatar?: string) => ipcRenderer.invoke('create-group', { name, memberUpeerIds, avatar }),
    updateGroupAvatar: (groupId: string, avatar: string) => ipcRenderer.invoke('update-group-avatar', { groupId, avatar }),
    sendGroupMessage: (groupId: string, message: string, replyTo?: string) => ipcRenderer.invoke('send-group-message', { groupId, message, replyTo }),
    inviteToGroup: (groupId: string, upeerId: string) => ipcRenderer.invoke('invite-to-group', { groupId, upeerId }),
    updateGroup: (groupId: string, fields: { name?: string; avatar?: string | null }) => ipcRenderer.invoke('update-group', { groupId, ...fields }),
    leaveGroup: (groupId: string) => ipcRenderer.invoke('leave-group', { groupId }),
    onGroupUpdated: (callback: (data: any) => void) => {
        ipcRenderer.removeAllListeners('group-updated');
        ipcRenderer.on('group-updated', (event, data) => callback(data));
    },
    onGroupMessage: (callback: (data: any) => void) => {
        ipcRenderer.removeAllListeners('receive-group-message');
        ipcRenderer.on('receive-group-message', (event, data) => callback(data));
    },
    onGroupInvite: (callback: (data: any) => void) => {
        ipcRenderer.removeAllListeners('group-invite-received');
        ipcRenderer.on('group-invite-received', (event, data) => callback(data));
    },
    onGroupMessageDelivered: (callback: (data: { id: string, groupId: string, upeerId: string }) => void) => {
        ipcRenderer.removeAllListeners('group-message-delivered');
        ipcRenderer.on('group-message-delivered', (event, data) => callback(data));
    },
    openFileDialog: (options?: { title?: string; filters?: any[]; defaultPath?: string; multiSelect?: boolean }) => ipcRenderer.invoke('open-file-dialog', options || {}),
    readFileAsBase64: (filePath: string, maxSizeMB?: number) => ipcRenderer.invoke('read-file-as-base64', { filePath, maxSizeMB }),
    getPathForFile: (file: File) => webUtils.getPathForFile(file),
    onReceive: (callback: (data: any) => void) => {
        ipcRenderer.removeAllListeners('receive-p2p-message');
        ipcRenderer.on('receive-p2p-message', (event, data) => callback(data));
    },
    onPresence: (callback: (data: any) => void) => {
        ipcRenderer.removeAllListeners('contact-presence');
        ipcRenderer.on('contact-presence', (event, data) => callback(data));
    },
    onContactRequest: (callback: (data: any) => void) => {
        ipcRenderer.removeAllListeners('contact-request-received');
        ipcRenderer.on('contact-request-received', (event, data) => callback(data));
    },
    onHandshakeFinished: (callback: (data: any) => void) => {
        ipcRenderer.removeAllListeners('contact-handshake-finished');
        ipcRenderer.on('contact-handshake-finished', (event, data) => callback(data));
    },
    onContactUntrustworthy: (callback: (data: any) => void) => {
        ipcRenderer.removeAllListeners('contact-untrustworthy');
        ipcRenderer.on('contact-untrustworthy', (event, data) => callback(data));
    },
    /** ⚠️ TOFU: la clave criptográfica estática de un contacto cambió.
     *  El UI debe mostrar una alerta prominente para que el usuario verifique
     *  la nueva huella digital por un canal alternativo (llamada, señal física, etc.).
     *  data: { upeerId, oldFingerprint, newFingerprint, alias }
     */
    onKeyChangeAlert: (callback: (data: { upeerId: string; oldFingerprint: string; newFingerprint: string; alias: string }) => void) => {
        ipcRenderer.removeAllListeners('key-change-alert');
        ipcRenderer.on('key-change-alert', (event, data) => callback(data));
    },
    onMessageDelivered: (callback: (data: { id: string, upeerId: string }) => void) => {
        ipcRenderer.removeAllListeners('message-delivered');
        ipcRenderer.on('message-delivered', (event, data) => callback(data));
    },
    onMessageRead: (callback: (data: { id: string, upeerId: string }) => void) => {
        ipcRenderer.removeAllListeners('message-read');
        ipcRenderer.on('message-read', (event, data) => callback(data));
    },
    onMessageReactionUpdated: (callback: (data: any) => void) => {
        ipcRenderer.removeAllListeners('message-reaction-updated');
        ipcRenderer.on('message-reaction-updated', (event, data) => callback(data));
    },
    onMessageUpdated: (callback: (data: any) => void) => {
        ipcRenderer.removeAllListeners('message-updated');
        ipcRenderer.on('message-updated', (event, data) => callback(data));
    },
    onMessageDeleted: (callback: (data: any) => void) => {
        ipcRenderer.removeAllListeners('message-deleted');
        ipcRenderer.on('message-deleted', (event, data) => callback(data));
    },
    onMessageStatusUpdated: (callback: (data: { id: string, status: string }) => void) => {
        ipcRenderer.removeAllListeners('message-status-updated');
        ipcRenderer.on('message-status-updated', (event, data) => callback(data));
    },
    onTyping: (callback: (data: { upeerId: string }) => void) => {
        ipcRenderer.removeAllListeners('peer-typing');
        ipcRenderer.on('peer-typing', (event, data) => callback(data));
    },
    // File transfer API (Phase 16)
    startFileTransfer: (upeerId: string, filePath: string, thumbnail?: string) => ipcRenderer.invoke('start-file-transfer', { upeerId, filePath, thumbnail }),
    cancelFileTransfer: (fileId: string, reason?: string) => ipcRenderer.invoke('cancel-file-transfer', { fileId, reason: reason || 'User cancelled' }),
    getFileTransfers: () => ipcRenderer.invoke('get-file-transfers'),
    saveTransferredFile: (fileId: string, destinationPath: string) => ipcRenderer.invoke('save-transferred-file', { fileId, destinationPath }),
    onFileTransferStarted: (callback: (data: any) => void) => {
        ipcRenderer.removeAllListeners('file-transfer-started');
        ipcRenderer.on('file-transfer-started', (event, data) => callback(data));
    },
    onFileTransferProgress: (callback: (data: any) => void) => {
        ipcRenderer.removeAllListeners('file-transfer-progress');
        ipcRenderer.on('file-transfer-progress', (event, data) => callback(data));
    },
    onFileTransferCompleted: (callback: (data: any) => void) => {
        ipcRenderer.removeAllListeners('file-transfer-completed');
        ipcRenderer.on('file-transfer-completed', (event, data) => callback(data));
    },
    onFileTransferCancelled: (callback: (data: any) => void) => {
        ipcRenderer.removeAllListeners('file-transfer-cancelled');
        ipcRenderer.on('file-transfer-cancelled', (event, data) => callback(data));
    },
    onFileTransferFailed: (callback: (data: any) => void) => {
        ipcRenderer.removeAllListeners('file-transfer-failed');
        ipcRenderer.on('file-transfer-failed', (event, data) => callback(data));
    },
    /**
     * Se invoca cuando el sidecar yggstack detecta y comunica la dirección
     * IPv6 asignada en la red Yggdrasil (rango 200::/7). El renderer puede
     * mostrarla como "ID de chat" o dirección de conexión del usuario.
     * El evento se emite una sola vez por sesión (cuando yggstack arranca).
     */
    getNetworkStats: () => ipcRenderer.invoke('get-network-stats'),
    restartYggstack: () => ipcRenderer.invoke('restart-yggstack'),
    // BUG EC fix: diálogo nativo "Guardar como" para que el renderer pueda
    // pedir al usuario dónde guardar un archivo recibido.
    showSaveDialog: (options: { defaultPath?: string; filters?: Array<{ name: string; extensions: string[] }> }) =>
        ipcRenderer.invoke('show-save-dialog', options),
    // BUG EC fix: abrir un archivo ya guardado con la app predeterminada del SO.
    openFile: (filePath: string) => ipcRenderer.invoke('open-file', { filePath }),
    onYggstackAddress: (callback: (address: string) => void) => {
        ipcRenderer.removeAllListeners('yggstack-address');
        ipcRenderer.on('yggstack-address', (_event, address: string) => callback(address));
    },
    /** Callback para cambios de estado de la red Yggdrasil: 'connecting'|'up'|'down'|'reconnecting' */
    onYggstackStatus: (callback: (status: string, address?: string) => void) => {
        ipcRenderer.removeAllListeners('yggstack-status');
        ipcRenderer.on('yggstack-status', (_event, status: string, address?: string) => callback(status, address));
    },
});
