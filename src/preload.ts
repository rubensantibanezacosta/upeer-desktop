import { contextBridge, ipcRenderer } from 'electron';

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
    getMyIdentity: () => ipcRenderer.invoke('get-my-identity'),
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
    onMessageDelivered: (callback: (data: { id: string, revelnestId: string }) => void) => {
        ipcRenderer.on('message-delivered', (event, data) => callback(data));
    },
    onMessageRead: (callback: (data: { id: string, revelnestId: string }) => void) => {
        ipcRenderer.on('message-read', (event, data) => callback(data));
    },
    onTyping: (callback: (data: { revelnestId: string }) => void) => {
        ipcRenderer.on('peer-typing', (event, data) => callback(data));
    }
});
