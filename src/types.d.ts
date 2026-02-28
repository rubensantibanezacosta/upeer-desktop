export { };

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
            getMyIdentity: () => Promise<{ address: string | null, revelnestId: string, publicKey: string }>;
            onReceive: (callback: (data: any) => void) => void;
            onMessageDelivered: (callback: (data: { id: string, revelnestId: string }) => void) => void;
            onMessageRead: (callback: (data: { id: string, revelnestId: string }) => void) => void;
            onPresence: (callback: (data: { revelnestId: string, lastSeen: string }) => void) => void;
            onContactRequest: (callback: (data: { revelnestId: string, address: string, alias?: string, publicKey: string }) => void) => void;
            onHandshakeFinished: (callback: (data: { revelnestId: string }) => void) => void;
            onTyping: (callback: (data: { revelnestId: string }) => void) => void;
        }
    }
}
