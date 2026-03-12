/// <reference types="vite/client" />
declare module 'react-simple-maps';
declare module 'world-atlas/countries-110m.json' {
    const value: object;
    export default value;
}

declare global {
    interface Window {
        upeer: {
            getMyNetworkAddress: () => Promise<string>;
            getMessages: (upeerId: string) => Promise<any[]>;
            getContacts: () => Promise<any[]>;
            addContact: (address: string, name: string) => Promise<{ success: boolean, upeerId: string }>;
            acceptContactRequest: (upeerId: string, publicKey: string) => Promise<{ success: boolean }>;
            deleteContact: (upeerId: string) => Promise<any>;
            sendMessage: (upeerId: string, message: string, replyTo?: string) => Promise<string>;
            sendTypingIndicator: (upeerId: string) => Promise<void>;
            sendReadReceipt: (upeerId: string, id: string) => Promise<void>;
            sendContactCard: (targetUpeerId: string, contact: any) => Promise<string>;
            sendChatReaction: (upeerId: string, msgId: string, emoji: string, remove: boolean) => Promise<void>;
            sendChatUpdate: (upeerId: string, msgId: string, newContent: string) => Promise<void>;
            sendChatDelete: (upeerId: string, msgId: string) => Promise<void>;
            getMyIdentity: () => Promise<{ address: string | null, upeerId: string, publicKey: string }>;
            onReceive: (callback: (data: any) => void) => void;
            onMessageDelivered: (callback: (data: { id: string, upeerId: string }) => void) => void;
            onMessageRead: (callback: (data: { id: string, upeerId: string }) => void) => void;
            onMessageReactionUpdated: (callback: (data: { msgId: string, upeerId: string, emoji: string, remove: boolean }) => void) => void;
            onMessageUpdated: (callback: (data: { id: string, upeerId: string, content: string }) => void) => void;
            onMessageDeleted: (callback: (data: { id: string, upeerId: string }) => void) => void;
            onPresence: (callback: (data: { upeerId: string, lastSeen: string }) => void) => void;
            onContactRequest: (callback: (data: { upeerId: string, address: string, alias?: string, publicKey: string }) => void) => void;
            onHandshakeFinished: (callback: (data: { upeerId: string }) => void) => void;
            onContactUntrustworthy: (callback: (data: { upeerId: string, address: string, alias?: string, reason: string }) => void) => void;
            onTyping: (callback: (data: { upeerId: string }) => void) => void;
            // File transfer API (Phase 16)
            openFileDialog: (options?: { title?: string; filters?: any[]; defaultPath?: string; multiSelect?: boolean }) => Promise<{
                success: boolean;
                canceled?: boolean;
                files?: Array<{
                    path: string;
                    name: string;
                    size: number;
                    type: string;
                    lastModified: number;
                }>;
                error?: string
            }>;
            startFileTransfer: (upeerId: string, filePath: string, thumbnail?: string) => Promise<{ success: boolean; fileId?: string; error?: string }>;
            cancelFileTransfer: (fileId: string, reason?: string) => Promise<{ success: boolean; error?: string }>;
            getFileTransfers: () => Promise<{ success: boolean; transfers?: any[]; error?: string }>;
            saveTransferredFile: (fileId: string, destinationPath: string) => Promise<{ success: boolean; error?: string }>;
            onFileTransferStarted: (callback: (data: any) => void) => void;
            onFileTransferProgress: (callback: (data: any) => void) => void;
            onFileTransferCompleted: (callback: (data: any) => void) => void;
            onFileTransferCancelled: (callback: (data: any) => void) => void;
            onFileTransferFailed: (callback: (data: any) => void) => void;
        }
    }
}