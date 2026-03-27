declare global {
    type UpeerUnsubscribe = () => void;

    type UpeerChatMessage = import('./types/chat.js').RawChatMessage;
    type UpeerIncomingDirectMessage = import('./types/chat.js').IncomingDirectMessageEvent;
    type UpeerIncomingGroupMessage = import('./types/chat.js').IncomingGroupMessageEvent;
    type UpeerContact = import('./types/chat.js').Contact;
    type UpeerGroup = import('./types/chat.js').GroupRecord;
    type UpeerTransfer = import('./hooks/fileTransferTypes.js').FileTransfer;
    type UpeerTransferUpdate = import('./hooks/fileTransferTypes.js').TransferProgress & {
        fileId: string;
        direction: 'sending' | 'receiving';
        messageId?: string;
        fileHash?: string;
        tempPath?: string;
        error?: string;
        reason?: string;
    };
    type UpeerIncomingRequest = import('./types/chat.js').IncomingRequest;
    type UpeerPendingFile = import('./types/chat.js').PendingFile;
    type UpeerDevice = import('./store/useDeviceStore.js').Device;

    interface Window {
        upeer: {
            getMyNetworkAddress: () => Promise<string>;
            getMessages: (upeerId: string) => Promise<UpeerChatMessage[]>;
            searchMessages: (query: string) => Promise<UpeerChatMessage[]>;
            getMessagesAround: (chatUpeerId: string, targetMsgId: string) => Promise<UpeerChatMessage[]>;
            getContacts: () => Promise<UpeerContact[]>;
            addContact: (address: string, name: string) => Promise<{ success: boolean, upeerId: string }>;
            acceptContactRequest: (upeerId: string, publicKey: string) => Promise<{ success: boolean }>;
            deleteContact: (upeerId: string) => Promise<boolean>;
            blockContact: (upeerId: string) => Promise<boolean>;
            unblockContact: (upeerId: string) => Promise<boolean>;
            toggleFavoriteContact: (upeerId: string, isFavorite: boolean) => Promise<{ success: boolean; error?: string }>;
            clearChat: (upeerId: string) => Promise<{ success: boolean; error?: string }>;
            getBlockedContacts: () => Promise<UpeerContact[]>;
            sendMessage: (upeerId: string, message: string, replyTo?: string, linkPreview?: import('./types/chat.js').LinkPreview | null, messageId?: string) => Promise<{ id: string; savedMessage: string; timestamp: number } | undefined>;
            sendTypingIndicator: (upeerId: string) => Promise<void>;
            sendReadReceipt: (upeerId: string, id: string) => Promise<void>;
            sendContactCard: (targetUpeerId: string, contact: { name: string; address: string; upeerId?: string; publicKey?: string; avatar?: string }) => Promise<string>;
            sendChatReaction: (upeerId: string, msgId: string, emoji: string, remove: boolean) => Promise<void>;
            sendChatUpdate: (upeerId: string, msgId: string, newContent: string, linkPreview?: import('./types/chat.js').LinkPreview | null) => Promise<void>;
            sendChatDelete: (upeerId: string, msgId: string) => Promise<void>;
            getMyIdentity: () => Promise<{ address: string | null, upeerId: string, publicKey: string, alias?: string | null, avatar?: string | null }>;
            getMyReputation: () => Promise<{ vouchScore: number; connectionCount: number } | null>;
            getVaultStats: () => Promise<{ count: number, sizeBytes: number }>;
            setMyAlias: (alias: string) => Promise<{ success: boolean }>;
            setMyAvatar: (dataUrl: string) => Promise<{ success: boolean }>;
            // Identity / Wallet Auth
            identityStatus: () => Promise<{ isMnemonicMode: boolean; isLocked: boolean; upeerId: string | null }>;
            generateMnemonic: () => Promise<{ mnemonic: string }>;
            createMnemonicIdentity: (mnemonic: string, alias?: string, avatar?: string) => Promise<{ success: boolean; upeerId?: string; error?: string }>;
            unlockSession: (mnemonic: string) => Promise<{ success: boolean; upeerId?: string; error?: string }>;
            lockSession: () => Promise<{ success: boolean }>;
            // Group API
            getGroups: () => Promise<UpeerGroup[]>;
            createGroup: (name: string, memberUpeerIds: string[], avatar?: string) => Promise<{ success: boolean; groupId: string }>;
            updateGroupAvatar: (groupId: string, avatar: string) => Promise<void>;
            sendGroupMessage: (groupId: string, message: string, replyTo?: string, linkPreview?: import('./types/chat.js').LinkPreview | null) => Promise<{ id: string; timestamp: number; savedMessage: string } | undefined>;
            inviteToGroup: (groupId: string, upeerId: string) => Promise<{ success: boolean }>;
            updateGroup: (groupId: string, fields: { name?: string; avatar?: string | null }) => Promise<{ success: boolean }>;
            toggleFavoriteGroup: (groupId: string, isFavorite: boolean) => Promise<{ success: boolean; error?: string }>;
            leaveGroup: (groupId: string) => Promise<{ success: boolean }>;
            onChatCleared: (callback: (data: { upeerId: string }) => void) => UpeerUnsubscribe;
            onGroupMessage: (callback: (data: UpeerIncomingGroupMessage) => void) => UpeerUnsubscribe;
            onGroupInvite: (callback: (data: { groupId: string }) => void) => UpeerUnsubscribe;
            onGroupUpdated: (callback: (data: { groupId: string; members?: string[] }) => void) => UpeerUnsubscribe;
            onGroupMessageDelivered: (callback: (data: { id: string, groupId: string, upeerId: string }) => void) => UpeerUnsubscribe;

            onReceive: (callback: (data: UpeerIncomingDirectMessage) => void) => UpeerUnsubscribe;
            onMessageDelivered: (callback: (data: { id: string, upeerId: string }) => void) => UpeerUnsubscribe;
            onMessageRead: (callback: (data: { id: string, upeerId: string }) => void) => UpeerUnsubscribe;
            onMessageReactionUpdated: (callback: (data: { msgId: string, upeerId: string, chatUpeerId: string, emoji: string, remove: boolean }) => void) => UpeerUnsubscribe;
            onMessageUpdated: (callback: (data: { id: string, upeerId: string, chatUpeerId: string, content: string }) => void) => UpeerUnsubscribe;
            onMessageDeleted: (callback: (data: { id: string, upeerId: string, chatUpeerId: string }) => void) => UpeerUnsubscribe;
            onMessageStatusUpdated: (callback: (data: { id: string, status: string }) => void) => UpeerUnsubscribe;
            onPresence: (callback: (data: { upeerId: string, lastSeen: string }) => void) => UpeerUnsubscribe;
            onContactRequest: (callback: (data: import('./types/chat.js').IncomingContactRequestEvent) => void) => UpeerUnsubscribe;
            onHandshakeFinished: (callback: (data: { upeerId: string }) => void) => UpeerUnsubscribe;
            onContactUntrustworthy: (callback: (data: { upeerId: string, address: string, alias?: string, reason: string }) => void) => UpeerUnsubscribe;
            onTyping: (callback: (data: { upeerId: string, groupId?: string }) => void) => UpeerUnsubscribe;
            onFocusConversation: (callback: (data: { upeerId?: string; groupId?: string }) => void) => UpeerUnsubscribe;
            onReputationUpdated: (callback: () => void) => UpeerUnsubscribe;
            // File transfer API (Phase 16)
            openFileDialog: (options?: { title?: string; filters?: Array<{ name: string; extensions: string[] }>; defaultPath?: string; multiSelect?: boolean }) => Promise<{
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
            readFileAsBase64: (filePath: string, maxSizeMB?: number) => Promise<{
                success: boolean;
                dataUrl?: string;
                mimeType?: string;
                size?: number;
                error?: string;
            }>;
            persistSelectedFile: (file: File) => Promise<{ success: boolean; path?: string; error?: string }>;
            getPathForFile: (file: File) => string;
            startFileTransfer: (upeerId: string, filePath: string, thumbnail?: string, caption?: string, isVoiceNote?: boolean, fileName?: string) => Promise<{ success: boolean; fileId?: string; error?: string }>;
            cancelFileTransfer: (fileId: string, reason?: string) => Promise<{ success: boolean; error?: string }>;
            retryFileTransfer: (fileId: string) => Promise<{ success: boolean; error?: string }>;
            getFileTransfers: () => Promise<{ success: boolean; transfers?: UpeerTransfer[] | Record<string, UpeerTransfer>; error?: string }>;
            saveTransferredFile: (fileId: string, destinationPath: string) => Promise<{ success: boolean; error?: string }>;
            // BUG EC fix: nuevos métodos para descargar y abrir archivos recibidos
            showSaveDialog: (options: { defaultPath?: string; filters?: Array<{ name: string; extensions: string[] }> }) => Promise<{ canceled: boolean; filePath?: string }>;
            openFile: (filePath: string) => Promise<{ success: boolean; error?: string }>;
            openExternal: (url: string) => Promise<{ success: boolean; error?: string }>;
            fetchOgPreview: (url: string) => Promise<{ url: string; title?: string; description?: string; imageBase64?: string; domain?: string } | null>;
            onFileTransferStarted: (callback: (data: UpeerTransferUpdate) => void) => UpeerUnsubscribe;
            onFileTransferProgress: (callback: (data: UpeerTransferUpdate) => void) => UpeerUnsubscribe;
            onFileTransferCompleted: (callback: (data: UpeerTransferUpdate) => void) => UpeerUnsubscribe;
            onFileTransferCancelled: (callback: (data: UpeerTransferUpdate) => void) => UpeerUnsubscribe;
            onFileTransferFailed: (callback: (data: UpeerTransferUpdate) => void) => UpeerUnsubscribe;
            /** Estadísticas de red: peers activos, latencias, reintentos */
            getNetworkStats: () => Promise<{
                peerCount: number;
                peers: Array<{
                    host: string;
                    country: string;
                    latencyMs: number | null;
                    score: number;
                    alive: boolean;
                    lat: number | null;
                    lon: number | null;
                }>;
                restartAttempts: number;
                maxRestartAttempts: number;
                selfLat: number | null;
                selfLon: number | null;
            }>;
            /** Fuerza un reinicio de yggstack desde la UI */
            restartYggstack: () => Promise<void>;
            /** Callback cuando yggstack reporta su dirección IPv6 Yggdrasil asignada */
            onYggstackAddress: (callback: (address: string) => void) => UpeerUnsubscribe;
            /** Callback para cambios de estado de la red: 'connecting'|'up'|'down'|'reconnecting' */
            onYggstackStatus: (callback: (status: string, address?: string) => void) => UpeerUnsubscribe;
            /** Obtiene la lista de dispositivos (nodos) activos ligados a esta Identidad */
            getDevices: () => Promise<UpeerDevice[]>;
            setDeviceTrust: (deviceId: string, isTrusted: boolean) => Promise<{ success: boolean; error?: string }>;
            deleteDevice: (deviceId: string) => Promise<{ success: boolean; error?: string }>;
            getMyDevices: () => Promise<Array<{
                deviceId: string;
                isCurrent: boolean;
                lastSeen: number;
                address: string;
            }>>;
            /** PIN y seguridad local */
            isPinEnabled: () => Promise<boolean>;
            setPin: (args: { newPin: string; currentPin?: string }) => Promise<{ success: boolean; error?: string }>;
            disablePin: (args: { pin: string }) => Promise<{ success: boolean; error?: string }>;
            verifyPin: (args: { pin: string }) => Promise<boolean>;
            getMnemonic: (pin: string) => Promise<{ success: boolean; mnemonic?: string; error?: string }>;
            /** Assets internos */
            persistInternalAsset: (args: { filePath: string; fileName: string }) => Promise<{ success: boolean; path?: string; error?: string }>;
            generateVideoThumbnail: (filePath: string) => Promise<{ success: boolean; dataUrl?: string; error?: string }>;
            /** Eliminar identidad */
            deleteIdentity: () => Promise<{ success: boolean; error?: string }>;
            /** Persistir un buffer a un archivo temporal */
            saveBufferToTemp: (data: { base64: string; fileName: string }) => Promise<{ success: boolean; path?: string; error?: string }>;
            /** Mantenimiento de la red */
            isPinEnabled: () => Promise<boolean>;
            onYggstackAddress: (callback: (addr: string) => void) => UpeerUnsubscribe;
            onYggstackStatus: (callback: (status: string, addr?: string) => void) => UpeerUnsubscribe;
            persistInternalAsset: (data: { filePath: string; fileName: string }) => Promise<{ success: boolean; path?: string; error?: string }>;
            generateVideoThumbnail: (filePath: string) => Promise<{ success: boolean; dataUrl?: string; error?: string }>;
        }
    }
}

export { };
