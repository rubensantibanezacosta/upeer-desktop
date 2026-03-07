import { contextBridge, ipcRenderer, webUtils } from 'electron';

contextBridge.exposeInMainWorld('revelnest', {
    getMyNetworkAddress: () => ipcRenderer.invoke('get-ygg-ip'),
    getMessages: (revelnestId: string) => ipcRenderer.invoke('get-messages', revelnestId),
    getContacts: () => ipcRenderer.invoke('get-contacts'),
    addContact: (address: string, name: string) => ipcRenderer.invoke('add-contact', { address, name }),
    acceptContactRequest: (revelnestId: string, publicKey: string) => ipcRenderer.invoke('accept-contact-request', { revelnestId, publicKey }),
    deleteContact: (revelnestId: string) => ipcRenderer.invoke('delete-contact', { revelnestId }),
    sendMessage: (revelnestId: string, message: string, replyTo?: string) => ipcRenderer.invoke('send-p2p-message', { revelnestId, message, replyTo }),
    sendTypingIndicator: (revelnestId: string) => ipcRenderer.invoke('send-typing-indicator', { revelnestId }),
    sendReadReceipt: (revelnestId: string, id: string) => ipcRenderer.invoke('send-read-receipt', { revelnestId, id }),
    sendContactCard: (targetRevelnestId: string, contact: any) => ipcRenderer.invoke('send-contact-card', { targetRevelnestId, contact }),
    sendChatReaction: (revelnestId: string, msgId: string, emoji: string, remove: boolean) => ipcRenderer.invoke('send-chat-reaction', { revelnestId, msgId, emoji, remove }),
    sendChatUpdate: (revelnestId: string, msgId: string, newContent: string) => ipcRenderer.invoke('send-chat-update', { revelnestId, msgId, newContent }),
    sendChatDelete: (revelnestId: string, msgId: string) => ipcRenderer.invoke('send-chat-delete', { revelnestId, msgId }),
    getMyIdentity: () => ipcRenderer.invoke('get-my-identity'),
    openFileDialog: (options?: { title?: string; filters?: any[]; defaultPath?: string; multiSelect?: boolean }) => ipcRenderer.invoke('open-file-dialog', options || {}),
    readFileAsBase64: (filePath: string, maxSizeMB?: number) => ipcRenderer.invoke('read-file-as-base64', { filePath, maxSizeMB }),
    getPathForFile: (file: File) => webUtils.getPathForFile(file),
    onReceive: (callback: (data: any) => void) => {
        ipcRenderer.removeAllListeners('receive-p2p-message');
        ipcRenderer.on('receive-p2p-message', (event, data) => callback(data));
    },
    onPresence: (callback: (data: any) => void) => {
        ipcRenderer.on('contact-presence', (event, data) => callback(data));
    },
    onContactRequest: (callback: (data: any) => void) => {
        ipcRenderer.on('contact-request-received', (event, data) => callback(data));
    },
    onHandshakeFinished: (callback: (data: any) => void) => {
        ipcRenderer.on('contact-handshake-finished', (event, data) => callback(data));
    },
    onContactUntrustworthy: (callback: (data: any) => void) => {
        ipcRenderer.on('contact-untrustworthy', (event, data) => callback(data));
    },
    onMessageDelivered: (callback: (data: { id: string, revelnestId: string }) => void) => {
        ipcRenderer.on('message-delivered', (event, data) => callback(data));
    },
    onMessageRead: (callback: (data: { id: string, revelnestId: string }) => void) => {
        ipcRenderer.on('message-read', (event, data) => callback(data));
    },
    onMessageReactionUpdated: (callback: (data: any) => void) => {
        ipcRenderer.on('message-reaction-updated', (event, data) => callback(data));
    },
    onMessageUpdated: (callback: (data: any) => void) => {
        ipcRenderer.on('message-updated', (event, data) => callback(data));
    },
    onMessageDeleted: (callback: (data: any) => void) => {
        ipcRenderer.on('message-deleted', (event, data) => callback(data));
    },
    onTyping: (callback: (data: { revelnestId: string }) => void) => {
        ipcRenderer.on('peer-typing', (event, data) => callback(data));
    },
    // File transfer API (Phase 16)
    startFileTransfer: (revelnestId: string, filePath: string, thumbnail?: string) => ipcRenderer.invoke('start-file-transfer', { revelnestId, filePath, thumbnail }),
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
    }
});
