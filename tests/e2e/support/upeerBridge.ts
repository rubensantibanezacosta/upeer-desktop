import type { Page } from '@playwright/test';

type Contact = {
    upeerId: string;
    name: string;
    address: string;
    status: 'connected' | 'offline' | 'pending' | 'incoming' | 'blocked' | string;
    publicKey?: string;
    avatar?: string | null;
    isFavorite?: boolean;
    isConversationOnly?: boolean;
    lastMessage?: string | null;
    lastMessageTime?: string | null;
    lastSeen?: string | null;
    vouchScore?: number;
};

type Group = {
    groupId: string;
    name: string;
    adminUpeerId: string;
    members: string[];
    status: string;
    avatar?: string | null;
    isFavorite?: boolean;
    lastMessage?: string | null;
    lastMessageTime?: string | null;
};

type RawMessage = {
    id: string;
    upeerId: string;
    message: string;
    isMine: boolean;
    status: string;
    timestamp: number;
    replyTo?: string | null;
    groupId?: string;
    senderUpeerId?: string;
    senderName?: string;
    senderAvatar?: string;
    isEdited?: boolean;
    isDeleted?: boolean;
    reactions?: Array<{ emoji: string; users: string[] }>;
};

type PendingFile = {
    path: string;
    name: string;
    size: number;
    type: string;
    lastModified?: number;
};

type Transfer = {
    fileId: string;
    upeerId: string;
    chatUpeerId?: string;
    direction: 'sending' | 'receiving';
    state: string;
    progress: number;
    fileName: string;
    fileSize: number;
    mimeType: string;
    filePath?: string;
    savedPath?: string;
    isVoiceNote?: boolean;
};

type Scenario = {
    contacts?: Contact[];
    groups?: Group[];
    messagesByChat?: Record<string, RawMessage[]>;
    transfers?: Transfer[];
    linkPreviews?: Record<string, unknown>;
    fileDialogQueue?: Array<{ success: boolean; canceled?: boolean; files?: PendingFile[] }>;
    identityStatus?: { isLocked: boolean };
    myIdentity?: { upeerId: string; name: string; alias?: string; avatar?: string };
    myNetworkAddress?: string;
    networkStatus?: string;
};

type BridgeState = {
    contacts: Contact[];
    groups: Group[];
    messagesByChat: Record<string, RawMessage[]>;
    transfers: Transfer[];
};

export async function installUpeerBridge(page: Page, scenario: Scenario): Promise<void> {
    await page.addInitScript((input: Scenario) => {
        const deepClone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
        const nowIso = () => new Date().toISOString();
        const selfId = input.myIdentity?.upeerId ?? 'self-id';
        let messageCounter = 0;
        let groupCounter = 0;
        let fileCounter = 0;

        const state = {
            contacts: deepClone(input.contacts ?? []),
            groups: deepClone(input.groups ?? []),
            messagesByChat: deepClone(input.messagesByChat ?? {}),
            transfers: deepClone(input.transfers ?? []),
            linkPreviews: deepClone(input.linkPreviews ?? {}),
            fileDialogQueue: deepClone(input.fileDialogQueue ?? []),
            identityStatus: input.identityStatus ?? { isLocked: false },
            myIdentity: input.myIdentity ?? { upeerId: selfId, name: 'E2E User', alias: 'E2E User' },
            myNetworkAddress: input.myNetworkAddress ?? '200:1111:2222:3333:4444:5555:6666:7777',
            networkStatus: input.networkStatus ?? 'up',
        };

        const listeners = new Map<string, Set<(...args: unknown[]) => void>>();
        const register = (name: string) => (callback: (...args: unknown[]) => void) => {
            const set = listeners.get(name) ?? new Set<(...args: unknown[]) => void>();
            set.add(callback);
            listeners.set(name, set);
            return () => set.delete(callback);
        };
        const emit = (name: string, payload?: unknown) => {
            const set = listeners.get(name);
            if (!set) return;
            for (const callback of set) {
                callback(payload);
            }
        };
        const ensureMessages = (chatId: string) => {
            if (!state.messagesByChat[chatId]) {
                state.messagesByChat[chatId] = [];
            }
            return state.messagesByChat[chatId];
        };
        const serializeMessage = (text: string, linkPreview?: unknown) => {
            if (!linkPreview) return text;
            return JSON.stringify({ text, linkPreview });
        };
        const touchContact = (upeerId: string, message: string, timestamp: number) => {
            const contact = state.contacts.find((item) => item.upeerId === upeerId);
            if (!contact) return;
            contact.lastMessage = message;
            contact.lastMessageTime = new Date(timestamp).toISOString();
            if (contact.status === 'connected') {
                contact.lastSeen = new Date(timestamp).toISOString();
            }
        };
        const touchGroup = (groupId: string, message: string, timestamp: number) => {
            const group = state.groups.find((item) => item.groupId === groupId);
            if (!group) return;
            group.lastMessage = message;
            group.lastMessageTime = new Date(timestamp).toISOString();
        };
        const nextMessageId = () => `e2e-msg-${++messageCounter}`;
        const nextGroupId = () => `grp-e2e-${++groupCounter}`;
        const nextFileId = () => `file-e2e-${++fileCounter}`;
        const addOrUpdateContact = (contact: Contact) => {
            const index = state.contacts.findIndex((item) => item.upeerId === contact.upeerId);
            if (index >= 0) {
                state.contacts[index] = { ...state.contacts[index], ...contact };
                return;
            }
            state.contacts.unshift(contact);
        };
        const addOrUpdateGroup = (group: Group) => {
            const index = state.groups.findIndex((item) => item.groupId === group.groupId);
            if (index >= 0) {
                state.groups[index] = { ...state.groups[index], ...group };
                return;
            }
            state.groups.unshift(group);
        };
        const searchMessages = (query: string) => {
            const normalizedQuery = query.trim().toLowerCase();
            if (!normalizedQuery) {
                return [];
            }
            return Object.entries(state.messagesByChat)
                .flatMap(([chatId, messages]) => messages.map((message) => ({ chatId, message })))
                .filter(({ message }) => typeof message.message === 'string' && message.message.toLowerCase().includes(normalizedQuery))
                .map(({ chatId, message }) => ({
                    id: message.id,
                    chatUpeerId: chatId,
                    upeerId: message.upeerId,
                    isMine: message.isMine,
                    message: message.message,
                    status: message.status,
                    timestamp: message.timestamp,
                    replyTo: message.replyTo,
                    senderUpeerId: message.senderUpeerId,
                    senderName: message.senderName,
                    isEdited: message.isEdited,
                    isDeleted: message.isDeleted,
                    reactions: (message.reactions ?? []).flatMap((reaction) => reaction.users.map((upeerId) => ({ upeerId, emoji: reaction.emoji }))),
                }));
        };

        const bridge = {
            isPinEnabled: async () => false,
            identityStatus: async () => state.identityStatus,
            getMyNetworkAddress: async () => state.myNetworkAddress,
            getMyIdentity: async () => state.myIdentity,
            getContacts: async () => deepClone(state.contacts),
            getGroups: async () => deepClone(state.groups),
            getMessages: async (chatId: string) => deepClone(state.messagesByChat[chatId] ?? []),
            getMessagesAround: async (chatId: string) => deepClone(state.messagesByChat[chatId] ?? []),
            searchMessages: async (query: string) => deepClone(searchMessages(query)),
            getDevices: async () => [],
            getMyDevices: async () => [],
            getBlockedContacts: async () => state.contacts.filter((contact) => contact.status === 'blocked'),
            getNetworkStats: async () => ({}),
            getVaultStats: async () => ({}),
            getMyReputation: async () => ({ score: 0 }),
            getFileTransfers: async () => ({ success: true, transfers: deepClone(state.transfers) }),
            openFileDialog: async () => state.fileDialogQueue.shift() ?? { success: true, canceled: true, files: [] },
            fetchOgPreview: async (url: string) => state.linkPreviews[url] ?? null,
            getPathForFile: () => '',
            persistSelectedFile: async () => ({ success: false }),
            showSaveDialog: async () => ({ canceled: false, filePath: '/tmp/e2e-saved-file' }),
            saveTransferredFile: async (fileId: string, filePath: string) => {
                const transfer = state.transfers.find((item) => item.fileId === fileId);
                if (transfer) {
                    transfer.savedPath = filePath;
                }
                return { success: true };
            },
            openFile: async () => ({ success: true }),
            saveBufferToTemp: async () => ({ success: true, path: '/tmp/e2e-voice-note.webm' }),
            persistInternalAsset: async () => ({ success: true, path: '/tmp/e2e-voice-note.webm' }),
            sendMessage: async (upeerId: string, text: string, replyTo?: string | null, linkPreview?: unknown, reuseId?: string) => {
                const timestamp = Date.now();
                const message = {
                    id: reuseId ?? nextMessageId(),
                    upeerId,
                    message: serializeMessage(text, linkPreview),
                    isMine: true,
                    status: 'sent',
                    timestamp,
                    replyTo: replyTo ?? null,
                };
                ensureMessages(upeerId).push(message);
                touchContact(upeerId, message.message, timestamp);
                return { id: message.id, timestamp, savedMessage: message.message };
            },
            sendGroupMessage: async (groupId: string, text: string, replyTo?: string | null, linkPreview?: unknown) => {
                const timestamp = Date.now();
                const message = {
                    id: nextMessageId(),
                    upeerId: groupId,
                    groupId,
                    message: serializeMessage(text, linkPreview),
                    isMine: true,
                    status: 'sent',
                    timestamp,
                    replyTo: replyTo ?? null,
                    senderUpeerId: selfId,
                    senderName: state.myIdentity.alias ?? state.myIdentity.name,
                };
                ensureMessages(groupId).push(message);
                touchGroup(groupId, message.message, timestamp);
                return { id: message.id, timestamp, savedMessage: message.message };
            },
            sendReadReceipt: async () => ({ success: true }),
            sendTypingIndicator: async () => ({ success: true }),
            sendChatReaction: async () => ({ success: true }),
            sendChatUpdate: async () => ({ success: true }),
            sendChatDelete: async () => ({ success: true }),
            sendContactCard: async (targetUpeerId: string, contact: Record<string, unknown>) => {
                const timestamp = Date.now();
                const message = {
                    id: nextMessageId(),
                    upeerId: targetUpeerId,
                    message: JSON.stringify({ type: 'contact_card', text: 'Tarjeta de contacto', contact }),
                    isMine: true,
                    status: 'sent',
                    timestamp,
                };
                ensureMessages(targetUpeerId).push(message);
                touchContact(targetUpeerId, message.message, timestamp);
                return message.id;
            },
            createGroup: async (name: string, memberIds: string[]) => {
                const groupId = nextGroupId();
                state.groups.unshift({ groupId, name, adminUpeerId: selfId, members: [selfId, ...memberIds], status: 'active', lastMessage: null, lastMessageTime: null });
                ensureMessages(groupId);
                return { success: true, groupId };
            },
            updateGroupAvatar: async () => ({ success: true }),
            updateGroup: async (groupId: string, patch: Partial<Group>) => {
                const group = state.groups.find((item) => item.groupId === groupId);
                if (group) Object.assign(group, patch);
                return { success: true };
            },
            inviteToGroup: async (groupId: string, memberId: string) => {
                const group = state.groups.find((item) => item.groupId === groupId);
                if (group && !group.members.includes(memberId)) {
                    group.members.push(memberId);
                }
                return { success: true };
            },
            toggleFavoriteGroup: async (groupId: string, nextValue: boolean) => {
                const group = state.groups.find((item) => item.groupId === groupId);
                if (group) group.isFavorite = nextValue;
                return { success: true };
            },
            leaveGroup: async (groupId: string) => {
                state.groups = state.groups.filter((group) => group.groupId !== groupId);
                delete state.messagesByChat[groupId];
                return { success: true };
            },
            addContact: async (idAtAddress: string, name: string) => {
                const [upeerId, ...addressParts] = idAtAddress.split('@');
                const address = addressParts.join('@');
                addOrUpdateContact({ upeerId, name, address, status: 'connected', publicKey: `${upeerId}-pk`, lastSeen: nowIso(), lastMessage: '', lastMessageTime: null });
                ensureMessages(upeerId);
                return { success: true, upeerId };
            },
            acceptContactRequest: async (upeerId: string, publicKey: string) => {
                addOrUpdateContact({ ...(state.contacts.find((item) => item.upeerId === upeerId) ?? { upeerId, name: upeerId, address: '' }), status: 'connected', publicKey, lastSeen: nowIso() });
                return { success: true };
            },
            deleteContact: async (upeerId: string) => {
                state.contacts = state.contacts.filter((item) => item.upeerId !== upeerId);
                return { success: true };
            },
            blockContact: async (upeerId: string) => {
                const contact = state.contacts.find((item) => item.upeerId === upeerId);
                if (contact) contact.status = 'blocked';
                return { success: true };
            },
            unblockContact: async (upeerId: string) => {
                const contact = state.contacts.find((item) => item.upeerId === upeerId);
                if (contact) contact.status = 'connected';
                return { success: true };
            },
            toggleFavoriteContact: async (upeerId: string, nextValue: boolean) => {
                const contact = state.contacts.find((item) => item.upeerId === upeerId);
                if (contact) contact.isFavorite = nextValue;
                return { success: true };
            },
            clearChat: async (chatId: string) => {
                state.messagesByChat[chatId] = [];
                return { success: true };
            },
            startFileTransfer: async (upeerId: string, filePath: string, _thumbnail?: string, _caption?: string, isVoiceNote?: boolean, fileName?: string) => {
                const fileId = nextFileId();
                state.transfers.unshift({ fileId, upeerId, chatUpeerId: upeerId, direction: 'sending', state: 'completed', progress: 100, fileName: fileName ?? filePath.split('/').pop() ?? 'archivo', fileSize: 1024, mimeType: isVoiceNote ? 'audio/webm' : 'application/pdf', filePath, savedPath: filePath, isVoiceNote });
                emit('onFileTransferStarted', { fileId, direction: 'sending' });
                emit('onFileTransferCompleted', { fileId, direction: 'sending' });
                return { success: true, fileId };
            },
            cancelFileTransfer: async () => ({ success: true }),
            retryFileTransfer: async () => ({ success: true }),
            restartYggstack: async () => ({ success: true }),
            setPin: async () => ({ success: true }),
            disablePin: async () => ({ success: true }),
            verifyPin: async () => ({ success: true }),
            onGroupUpdated: register('onGroupUpdated'),
            onGroupMessage: register('onGroupMessage'),
            onGroupInvite: register('onGroupInvite'),
            onGroupMessageDelivered: register('onGroupMessageDelivered'),
            onReceive: register('onReceive'),
            onPresence: register('onPresence'),
            onContactRequest: register('onContactRequest'),
            onHandshakeFinished: register('onHandshakeFinished'),
            onContactUntrustworthy: register('onContactUntrustworthy'),
            onReputationUpdated: register('onReputationUpdated'),
            onKeyChangeAlert: register('onKeyChangeAlert'),
            onMessageDelivered: register('onMessageDelivered'),
            onMessageRead: register('onMessageRead'),
            onMessageReactionUpdated: register('onMessageReactionUpdated'),
            onMessageUpdated: register('onMessageUpdated'),
            onMessageDeleted: register('onMessageDeleted'),
            onChatCleared: register('onChatCleared'),
            onMessageStatusUpdated: register('onMessageStatusUpdated'),
            onTyping: register('onTyping'),
            onFocusConversation: register('onFocusConversation'),
            onFileTransferStarted: register('onFileTransferStarted'),
            onFileTransferProgress: register('onFileTransferProgress'),
            onFileTransferCompleted: register('onFileTransferCompleted'),
            onFileTransferCancelled: register('onFileTransferCancelled'),
            onFileTransferFailed: register('onFileTransferFailed'),
            onVaultRecoveryStatus: register('onVaultRecoveryStatus'),
            onYggstackAddress: register('onYggstackAddress'),
            onYggstackStatus: register('onYggstackStatus'),
        };

        Object.defineProperty(window, 'upeer', { configurable: true, writable: false, value: bridge });
        Object.defineProperty(window, '__e2eBridge', {
            configurable: true,
            writable: false,
            value: {
                emit,
                queueFileDialogResult: (result: { success: boolean; canceled?: boolean; files?: PendingFile[] }) => state.fileDialogQueue.push(result),
                patchContact: (upeerId: string, patch: Partial<Contact>) => addOrUpdateContact({ ...(state.contacts.find((item) => item.upeerId === upeerId) ?? { upeerId, name: upeerId, address: '', status: 'connected' }), ...patch }),
                patchGroup: (groupId: string, patch: Partial<Group>) => addOrUpdateGroup({ ...(state.groups.find((item) => item.groupId === groupId) ?? { groupId, name: groupId, adminUpeerId: selfId, members: [selfId], status: 'active' }), ...patch }),
                getState: (): BridgeState => deepClone({ contacts: state.contacts, groups: state.groups, messagesByChat: state.messagesByChat, transfers: state.transfers }),
            },
        });
    }, scenario);
}

export async function emitBridgeEvent(page: Page, eventName: string, payload?: unknown): Promise<void> {
    await page.evaluate(({ eventName: name, payload: data }) => {
        ((window as unknown) as Window & { __e2eBridge: { emit: (event: string, payload?: unknown) => void } }).__e2eBridge.emit(name, data);
    }, { eventName, payload });
}

export async function patchBridgeContact(page: Page, upeerId: string, patch: Record<string, unknown>): Promise<void> {
    await page.evaluate(({ upeerId: id, patch: nextPatch }) => {
        ((window as unknown) as Window & { __e2eBridge: { patchContact: (upeerId: string, patch: Record<string, unknown>) => void } }).__e2eBridge.patchContact(id, nextPatch);
    }, { upeerId, patch });
}

export async function patchBridgeGroup(page: Page, groupId: string, patch: Record<string, unknown>): Promise<void> {
    await page.evaluate(({ groupId: id, patch: nextPatch }) => {
        ((window as unknown) as Window & { __e2eBridge: { patchGroup: (groupId: string, patch: Record<string, unknown>) => void } }).__e2eBridge.patchGroup(id, nextPatch);
    }, { groupId, patch });
}

export async function queueFileDialogResult(page: Page, result: { success: boolean; canceled?: boolean; files?: PendingFile[] }): Promise<void> {
    await page.evaluate((nextResult) => {
        ((window as unknown) as Window & { __e2eBridge: { queueFileDialogResult: (result: { success: boolean; canceled?: boolean; files?: PendingFile[] }) => void } }).__e2eBridge.queueFileDialogResult(nextResult);
    }, result);
}

export async function readBridgeState(page: Page): Promise<BridgeState> {
    return page.evaluate(() => (
        ((window as unknown) as Window & { __e2eBridge: { getState: () => BridgeState } }).__e2eBridge.getState()
    ));
}
