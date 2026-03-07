/// <reference types="vite/client" />

declare global {
    interface Window {
        revelnest: {
            getMyNetworkAddress: () => Promise<string>;
            getMessages: (revelnestId: string) => Promise<any[]>;
            getContacts: () => Promise<any[]>;
            addContact: (address: string, name: string) => Promise<{ success: boolean, revelnestId: string }>;
            acceptContactRequest: (revelnestId: string, publicKey: string) => Promise<{ success: boolean }>;
            deleteContact: (revelnestId: string) => Promise<any>;
            sendMessage: (revelnestId: string, message: string, replyTo?: string) => Promise<string>;
            sendTypingIndicator: (revelnestId: string) => Promise<void>;
            sendReadReceipt: (revelnestId: string, id: string) => Promise<void>;
            sendContactCard: (targetRevelnestId: string, contact: any) => Promise<string>;
            sendChatReaction: (revelnestId: string, msgId: string, emoji: string, remove: boolean) => Promise<void>;
            sendChatUpdate: (revelnestId: string, msgId: string, newContent: string) => Promise<void>;
            sendChatDelete: (revelnestId: string, msgId: string) => Promise<void>;
            getMyIdentity: () => Promise<{ address: string | null, revelnestId: string, publicKey: string }>;
            onReceive: (callback: (data: any) => void) => void;
            onMessageDelivered: (callback: (data: { id: string, revelnestId: string }) => void) => void;
            onMessageRead: (callback: (data: { id: string, revelnestId: string }) => void) => void;
            onMessageReactionUpdated: (callback: (data: { msgId: string, revelnestId: string, emoji: string, remove: boolean }) => void) => void;
            onMessageUpdated: (callback: (data: { id: string, revelnestId: string, content: string }) => void) => void;
            onMessageDeleted: (callback: (data: { id: string, revelnestId: string }) => void) => void;
            onPresence: (callback: (data: { revelnestId: string, lastSeen: string }) => void) => void;
            onContactRequest: (callback: (data: { revelnestId: string, address: string, alias?: string, publicKey: string }) => void) => void;
            onHandshakeFinished: (callback: (data: { revelnestId: string }) => void) => void;
            onContactUntrustworthy: (callback: (data: { revelnestId: string, address: string, alias?: string, reason: string }) => void) => void;
            onTyping: (callback: (data: { revelnestId: string }) => void) => void;
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
            startFileTransfer: (revelnestId: string, filePath: string, thumbnail?: string) => Promise<{success: boolean; fileId?: string; error?: string}>;
            cancelFileTransfer: (fileId: string, reason?: string) => Promise<{success: boolean; error?: string}>;
            getFileTransfers: () => Promise<{success: boolean; transfers?: any[]; error?: string}>;
            saveTransferredFile: (fileId: string, destinationPath: string) => Promise<{success: boolean; error?: string}>;
            onFileTransferStarted: (callback: (data: any) => void) => void;
            onFileTransferProgress: (callback: (data: any) => void) => void;
            onFileTransferCompleted: (callback: (data: any) => void) => void;
            onFileTransferCancelled: (callback: (data: any) => void) => void;
            onFileTransferFailed: (callback: (data: any) => void) => void;
        }
    }
}