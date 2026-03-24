import { create } from 'zustand';
import { ChatMessage, Contact, Group } from '../types/chat.js';
import { useNavigationStore } from './useNavigationStore.js';
import { useNotificationStore } from './useNotificationStore.js';
import { playNotificationSound } from '../utils/notificationSound.js';

let navGeneration = 0;

const formatMessageTimestamp = (timestamp?: number) => {
    const safeTimestamp = typeof timestamp === 'number' && Number.isFinite(timestamp)
        ? timestamp
        : Date.now();
    return new Intl.DateTimeFormat(undefined, {
        hour: '2-digit',
        minute: '2-digit'
    }).format(new Date(safeTimestamp));
};

interface ChatState {
    // Identity
    myIdentity: { address: string | null, upeerId: string, publicKey: string, alias?: string | null, name?: string | null, avatar?: string | null } | null;
    networkAddress: string;

    // Contacts & Groups
    contacts: Contact[];
    groups: Group[];
    targetUpeerId: string;
    activeGroupId: string;

    // Messaging
    chatHistory: ChatMessage[];
    groupChatHistory: ChatMessage[];
    searchResults: ChatMessage[]; // Mensajes encontrados en la búsqueda global
    isWindowedHistory: boolean; // true cuando el historial muestra una ventana alrededor de un mensaje antiguo
    messagesByConversation: Record<string, string>; // draft messages
    replyByConversation: Record<string, ChatMessage | null>;
    typingStatus: Record<string, NodeJS.Timeout>;

    // Requests & Alerts
    incomingRequests: Record<string, { publicKey: string, avatar?: string, receivedAt?: number, untrustworthy?: any, vouchScore?: number }>;
    untrustworthyAlert: any | null;
    untrustworthyAlerts: Record<string, any>;

    // File Transfer
    pendingFiles: { path: string; name: string; size: number; type: string; lastModified: number }[];
    isDragging: boolean;
}

interface ChatActions {
    // Identity
    setMyIdentity: (identity: any) => void;
    setNetworkAddress: (addr: string) => void;

    // Selection
    setTargetUpeerId: (id: string) => void;
    setActiveGroupId: (id: string) => void;

    // Messaging
    setMessage: (id: string, val: string) => void;
    setReplyToMessage: (id: string, val: ChatMessage | null) => void;
    setChatHistory: (history: ChatMessage[]) => void;
    setGroupChatHistory: (history: ChatMessage[]) => void;
    handleSearchGlobal: (query: string) => Promise<void>;
    loadHistoryAround: (targetMsgId: string) => Promise<void>;
    reloadLatestHistory: () => Promise<void>;

    // Data Refresh
    refreshContacts: () => Promise<void>;
    refreshGroups: () => Promise<void>;
    refreshData: () => Promise<void>;

    // Actions
    handleSend: () => Promise<void>;
    handleSendGroupMessage: (message: string) => Promise<void>;
    handleReaction: (msgId: string, emoji: string, remove: boolean) => void;
    handleUpdateMessage: (msgId: string, newContent: string) => void;
    handleDeleteMessage: (msgId: string) => void;
    handleTyping: () => void;

    // Group Mgmt
    handleCreateGroup: (name: string, memberIds: string[], avatar?: string) => Promise<{ success: boolean; groupId: string }>;
    handleUpdateGroup: (groupId: string, fields: { name?: string, avatar?: string | null }) => Promise<void>;
    handleLeaveGroup: (groupId: string) => Promise<void>;

    // Contact Mgmt
    handleAddContact: (idAtAddress: string, name: string) => void;
    handleAcceptContact: () => void;
    handleDeleteContact: (id?: string) => void;
    handleClearChat: (id?: string) => void;
    handleBlockContact: (id?: string) => void;
    handleUnblockContact: (id: string) => void;

    // Utilities
    clearUntrustworthyAlert: () => void;
    setPendingFiles: (files: any[]) => void;
    setIsDragging: (dragging: boolean) => void;

    // Actions extra
    handleRetryMessage: (msgId: string) => Promise<void>;

    // File Transfer Messages
    addFileTransferMessage: (upeerId: string, fileId: string, fileName: string, fileSize: number, mimeType: string, fileHash: string, thumbnail?: string, caption?: string, isMine?: boolean, filePath?: string, isVoiceNote?: boolean) => void;
    updateFileTransferMessage: (fileId: string, updates: any) => void;

    // IPC Listener Initialization
    initListeners: () => void;
}

export const useChatStore = create<ChatState & ChatActions>((set, get) => ({
    myIdentity: null,
    networkAddress: '',
    contacts: [],
    groups: [],
    targetUpeerId: '',
    activeGroupId: '',
    chatHistory: [],
    groupChatHistory: [],
    searchResults: [],
    isWindowedHistory: false,
    messagesByConversation: {},
    replyByConversation: {},
    typingStatus: {},
    incomingRequests: {},
    untrustworthyAlert: null,
    untrustworthyAlerts: {},
    pendingFiles: [],
    isDragging: false,

    setMyIdentity: (identity) => set({ myIdentity: identity }),
    setNetworkAddress: (addr) => set({ networkAddress: addr }),
    setTargetUpeerId: (id) => {
        set({ targetUpeerId: id, activeGroupId: '', isWindowedHistory: false });
        if (!id) return;
        const gen = ++navGeneration;
        const { pendingScrollMsgId } = useNavigationStore.getState();
        const mapContact = (m: any) => {
            if (!m.isMine && m.status !== 'read') {
                window.upeer.sendReadReceipt(id, m.id);
                m.status = 'read';
            }
            return {
                id: m.id, upeerId: m.chatUpeerId, isMine: !!m.isMine,
                message: m.message, status: m.status,
                timestamp: formatMessageTimestamp(m.timestamp),
                replyTo: m.replyTo, reactions: m.reactions,
                isEdited: !!m.isEdited, isDeleted: !!m.isDeleted, date: m.timestamp
            };
        };
        if (pendingScrollMsgId) {
            window.upeer.getMessagesAround(id, pendingScrollMsgId).then(msgs => {
                if (navGeneration !== gen) return;
                set({ chatHistory: msgs.map(mapContact), isWindowedHistory: true });
            });
        } else {
            window.upeer.getMessages(id).then(msgs => {
                if (navGeneration !== gen) return;
                set({ chatHistory: msgs.reverse().map(mapContact) });
            });
        }
    },
    setActiveGroupId: (id) => {
        set({ activeGroupId: id, targetUpeerId: '', isWindowedHistory: false });
        if (!id) return;
        const gen = ++navGeneration;
        const { pendingScrollMsgId } = useNavigationStore.getState();
        const mapGroup = (msgs: any[]) => {
            const contacts = get().contacts;
            const myIdentity = get().myIdentity;
            return msgs.map((m: any) => {
                if (!m.isMine && m.status !== 'read') {
                    window.upeer.sendReadReceipt(id, m.id);
                    m.status = 'read';
                }
                const sender = m.isMine ? myIdentity : (contacts as any[]).find((c: any) => c.upeerId === m.senderUpeerId);
                return {
                    id: m.id, upeerId: id, groupId: id, isMine: !!m.isMine,
                    message: m.message?.startsWith('__SYS__|') ? m.message.slice(8) : m.message,
                    isSystem: m.message?.startsWith('__SYS__|') || undefined,
                    status: m.status,
                    timestamp: formatMessageTimestamp(m.timestamp),
                    replyTo: m.replyTo, reactions: m.reactions,
                    isEdited: !!m.isEdited, isDeleted: !!m.isDeleted,
                    senderUpeerId: m.senderUpeerId,
                    senderName: (sender as any)?.name || (sender as any)?.alias || m.senderName || 'Usuario desconocido',
                    senderAvatar: (sender as any)?.avatar, date: m.timestamp
                };
            });
        };
        if (pendingScrollMsgId) {
            window.upeer.getMessagesAround(id, pendingScrollMsgId).then(msgs => {
                if (navGeneration !== gen) return;
                set({ groupChatHistory: mapGroup(msgs), isWindowedHistory: true });
            });
        } else {
            window.upeer.getMessages(id).then(async (msgs: any[]) => {
                if (navGeneration !== gen) return;
                set({ groupChatHistory: mapGroup(msgs.reverse()) });
            });
        }
    },

    setMessage: (id, val) => set(state => ({
        messagesByConversation: { ...state.messagesByConversation, [id]: val }
    })),
    setReplyToMessage: (id, val) => set(state => ({
        replyByConversation: { ...state.replyByConversation, [id]: val }
    })),
    setChatHistory: (history) => set({ chatHistory: history }),
    setGroupChatHistory: (history) => set({ groupChatHistory: history }),

    handleSearchGlobal: async (query: string) => {
        if (!query.trim()) {
            set({ searchResults: [] });
            return;
        }

        const { contacts, groups } = get();
        const raw = await window.upeer.searchMessages(query);

        set({
            searchResults: raw
                .filter((m: any) => !m.message?.startsWith('{'))
                .map((m: any) => {
                    const isGroup = m.chatUpeerId?.startsWith('grp-');
                    const group = isGroup ? groups.find((g: any) => g.groupId === m.chatUpeerId) : undefined;
                    const contact = !isGroup ? contacts.find((c: any) => c.upeerId === m.chatUpeerId) : undefined;
                    const senderContact = contacts.find((c: any) => c.upeerId === m.senderUpeerId);
                    const conversationName = group?.name || contact?.name || m.chatUpeerId;
                    const senderName = m.isMine
                        ? 'Tú'
                        : (senderContact?.name || contact?.name || 'Desconocido');
                    return {
                        id: m.id,
                        upeerId: m.chatUpeerId,
                        groupId: isGroup ? m.chatUpeerId : undefined,
                        isMine: !!m.isMine,
                        message: m.message,
                        status: m.status,
                        timestamp: formatMessageTimestamp(m.timestamp),
                        senderName: conversationName,
                        senderAvatar: (isGroup ? group?.avatar : contact?.avatar) ?? undefined,
                        senderDisplayName: senderName,
                        date: m.timestamp
                    };
                })
        });
    },

    loadHistoryAround: async (targetMsgId: string) => {
        const { targetUpeerId, activeGroupId, contacts, myIdentity } = get();
        const chatId = activeGroupId || targetUpeerId;
        if (!chatId) return;

        const raw = await window.upeer.getMessagesAround(chatId, targetMsgId);
        const isGroup = !!activeGroupId;

        if (isGroup) {
            set({
                groupChatHistory: raw.map((m: any) => {
                    const sender = m.isMine ? myIdentity : (contacts as any[]).find((c: any) => c.upeerId === m.senderUpeerId);
                    return {
                        id: m.id, upeerId: chatId, groupId: chatId, isMine: !!m.isMine,
                        message: m.message?.startsWith('__SYS__|') ? m.message.slice(8) : m.message,
                        isSystem: m.message?.startsWith('__SYS__|') || undefined,
                        status: m.status,
                        timestamp: formatMessageTimestamp(m.timestamp),
                        replyTo: m.replyTo, reactions: m.reactions, isEdited: !!m.isEdited, isDeleted: !!m.isDeleted,
                        senderUpeerId: m.senderUpeerId,
                        senderName: (sender as any)?.name || (sender as any)?.alias || m.senderName || 'Usuario desconocido',
                        senderAvatar: (sender as any)?.avatar ?? undefined, date: m.timestamp
                    };
                }),
                isWindowedHistory: true
            });
        } else {
            set({
                chatHistory: raw.map((m: any) => ({
                    id: m.id, upeerId: m.chatUpeerId, isMine: !!m.isMine,
                    message: m.message, status: m.status,
                    timestamp: formatMessageTimestamp(m.timestamp),
                    replyTo: m.replyTo, reactions: m.reactions,
                    isEdited: !!m.isEdited, isDeleted: !!m.isDeleted, date: m.timestamp
                })),
                isWindowedHistory: true
            });
        }
    },

    reloadLatestHistory: async () => {
        const { targetUpeerId, activeGroupId, contacts, myIdentity } = get();
        const chatId = activeGroupId || targetUpeerId;
        if (!chatId) return;

        const raw = await window.upeer.getMessages(chatId);
        const isGroup = !!activeGroupId;

        if (isGroup) {
            set({
                groupChatHistory: raw.reverse().map((m: any) => {
                    const sender = m.isMine ? myIdentity : (contacts as any[]).find((c: any) => c.upeerId === m.senderUpeerId);
                    return {
                        id: m.id, upeerId: chatId, groupId: chatId, isMine: !!m.isMine,
                        message: m.message?.startsWith('__SYS__|') ? m.message.slice(8) : m.message,
                        isSystem: m.message?.startsWith('__SYS__|') || undefined,
                        status: m.status,
                        timestamp: formatMessageTimestamp(m.timestamp),
                        replyTo: m.replyTo, reactions: m.reactions, isEdited: !!m.isEdited, isDeleted: !!m.isDeleted,
                        senderUpeerId: m.senderUpeerId,
                        senderName: (sender as any)?.name || (sender as any)?.alias || m.senderName || 'Usuario desconocido',
                        senderAvatar: (sender as any)?.avatar ?? undefined, date: m.timestamp
                    };
                }),
                isWindowedHistory: false
            });
        } else {
            set({
                chatHistory: raw.reverse().map((m: any) => ({
                    id: m.id, upeerId: m.chatUpeerId, isMine: !!m.isMine,
                    message: m.message, status: m.status,
                    timestamp: formatMessageTimestamp(m.timestamp),
                    replyTo: m.replyTo, reactions: m.reactions,
                    isEdited: !!m.isEdited, isDeleted: !!m.isDeleted, date: m.timestamp
                })),
                isWindowedHistory: false
            });
        }
    },

    refreshContacts: async () => {
        const loaded = await window.upeer.getContacts();
        set({ contacts: loaded });
    },
    refreshGroups: async () => {
        const raw = await window.upeer.getGroups();
        set({
            groups: raw.map((g: any) => ({
                ...g,
                avatar: g.avatar || undefined,
                members: Array.isArray(g.members) ? g.members : JSON.parse(g.members || '[]')
            }))
        });
    },
    refreshData: async () => {
        const addr = await window.upeer.getMyNetworkAddress();
        const identity = await window.upeer.getMyIdentity();
        set({
            networkAddress: addr,
            myIdentity: identity,
            targetUpeerId: '',
            activeGroupId: '',
            chatHistory: [],
            groupChatHistory: [],
            incomingRequests: {}
        });
        get().refreshContacts();
        get().refreshGroups();
    },

    handleTyping: () => {
        const { targetUpeerId } = get();
        if (!targetUpeerId) return;
        window.upeer.sendTypingIndicator(targetUpeerId);
    },

    handleCreateGroup: async (name, memberIds, avatar) => {
        const response = await window.upeer.createGroup(name, memberIds, avatar);
        if (response && response.success) {
            get().refreshGroups();
            get().setActiveGroupId(response.groupId);
            return response;
        }
        return response || { success: false, groupId: '' };
    },

    handleUpdateGroup: async (groupId, fields) => {
        await window.upeer.updateGroup(groupId, fields);
        get().refreshGroups();
    },

    handleLeaveGroup: async (groupId) => {
        await window.upeer.leaveGroup(groupId);
        get().refreshGroups();
        if (get().activeGroupId === groupId) set({ activeGroupId: '', groupChatHistory: [], isWindowedHistory: false });
    },

    handleSend: async () => {
        const { targetUpeerId, activeGroupId, messagesByConversation, replyByConversation, myIdentity } = get();
        const effectiveId = targetUpeerId || activeGroupId;
        if (!effectiveId) return;

        const msg = messagesByConversation[effectiveId];
        const replyTo = replyByConversation[effectiveId];

        if (!msg) return;

        if (activeGroupId) {
            await get().handleSendGroupMessage(msg);
            return;
        }

        const sendResult = await window.upeer.sendMessage(targetUpeerId, msg, replyTo?.id);

        if (sendResult) {
            set(state => ({
                chatHistory: [...state.chatHistory, {
                    id: sendResult.id,
                    upeerId: targetUpeerId,
                    isMine: true,
                    message: sendResult.savedMessage,
                    status: targetUpeerId === myIdentity?.upeerId ? 'read' : 'sent',
                    timestamp: formatMessageTimestamp(sendResult.timestamp),
                    replyTo: replyTo?.id,
                    date: sendResult.timestamp
                }],
                messagesByConversation: { ...state.messagesByConversation, [targetUpeerId]: '' },
                replyByConversation: { ...state.replyByConversation, [targetUpeerId]: null }
            }));
        }
        get().refreshContacts();
    },

    handleSendGroupMessage: async (msg: string) => {
        const { activeGroupId, myIdentity, replyByConversation } = get();
        if (!activeGroupId || !msg) return;

        const replyTo = replyByConversation[activeGroupId];
        const sendResult = await window.upeer.sendGroupMessage(activeGroupId, msg, replyTo?.id);
        if (sendResult) {
            set(state => ({
                groupChatHistory: [...state.groupChatHistory, {
                    id: sendResult.id,
                    upeerId: activeGroupId,
                    groupId: activeGroupId,
                    isMine: true,
                    message: msg,
                    status: 'sent',
                    timestamp: formatMessageTimestamp(sendResult.timestamp),
                    replyTo: replyTo?.id,
                    senderUpeerId: myIdentity?.upeerId,
                    senderName: myIdentity?.alias || myIdentity?.name || 'Yo',
                    senderAvatar: myIdentity?.avatar ?? undefined,
                    date: sendResult.timestamp
                }],
                messagesByConversation: { ...state.messagesByConversation, [activeGroupId]: '' },
                replyByConversation: { ...state.replyByConversation, [activeGroupId]: null }
            }));
        }
        get().refreshGroups();
    },

    handleReaction: (msgId, emoji, remove) => {
        const { targetUpeerId, activeGroupId, myIdentity } = get();
        const effectiveId = targetUpeerId || activeGroupId;
        if (!effectiveId) return;

        window.upeer.sendChatReaction(effectiveId, msgId, emoji, remove);

        const myId = myIdentity?.upeerId || 'me';
        const updateFn = (msg: any) => {
            if (msg.id === msgId) {
                const reactions = msg.reactions || [];
                if (remove) {
                    return { ...msg, reactions: reactions.filter((r: any) => !(r.upeerId === myId && r.emoji === emoji)) };
                } else {
                    if (reactions.some((r: any) => r.upeerId === myId && r.emoji === emoji)) return msg;
                    return { ...msg, reactions: [...reactions, { upeerId: myId, emoji }] };
                }
            }
            return msg;
        };

        set(state => ({
            chatHistory: state.chatHistory.map(updateFn),
            groupChatHistory: state.groupChatHistory.map(updateFn)
        }));
    },

    handleUpdateMessage: (msgId, newContent) => {
        const { targetUpeerId, activeGroupId, chatHistory, groupChatHistory } = get();
        const effectiveId = targetUpeerId || activeGroupId;
        if (!effectiveId) return;

        const existing = [...chatHistory, ...groupChatHistory].find(m => m.id === msgId);
        let savedContent = newContent;
        if (existing) {
            const raw = existing.message;
            if (raw.startsWith('{') && raw.endsWith('}')) {
                try {
                    const parsed = JSON.parse(raw);
                    if (parsed.type === 'file') {
                        savedContent = JSON.stringify({ ...parsed, caption: newContent });
                    }
                } catch { /* ignore */ }
            }
        }

        window.upeer.sendChatUpdate(effectiveId, msgId, savedContent);

        const updateFn = (msg: any) => msg.id === msgId ? { ...msg, message: savedContent, isEdited: true } : msg;

        set(state => ({
            chatHistory: state.chatHistory.map(updateFn),
            groupChatHistory: state.groupChatHistory.map(updateFn)
        }));
    },

    handleDeleteMessage: (msgId) => {
        const { targetUpeerId, activeGroupId } = get();
        const effectiveId = targetUpeerId || activeGroupId;
        if (!effectiveId) return;

        window.upeer.sendChatDelete(effectiveId, msgId);

        const updateFn = (msg: any) => msg.id === msgId ? { ...msg, message: "Mensaje eliminado", isDeleted: true } : msg;

        set(state => ({
            chatHistory: state.chatHistory.map(updateFn),
            groupChatHistory: state.groupChatHistory.map(updateFn)
        }));
    },

    handleAddContact: (idAtAddress, name) => {
        window.upeer.addContact(idAtAddress, name).then((res: any) => {
            get().refreshContacts();
            if (res.upeerId) get().setTargetUpeerId(res.upeerId);
        });
    },

    handleAcceptContact: () => {
        const { targetUpeerId, incomingRequests, contacts } = get();
        if (!targetUpeerId) return;

        const request = incomingRequests[targetUpeerId];
        const contact = contacts.find(c => c.upeerId === targetUpeerId);
        const publicKey = request?.publicKey || contact?.publicKey;

        if (!publicKey) return;

        window.upeer.acceptContactRequest(targetUpeerId, publicKey).then(() => {
            get().refreshContacts();
            set(state => {
                const newRequests = { ...state.incomingRequests };
                delete newRequests[targetUpeerId];
                const newAlerts = { ...state.untrustworthyAlerts };
                delete newAlerts[targetUpeerId];
                return {
                    incomingRequests: newRequests,
                    untrustworthyAlerts: newAlerts,
                    untrustworthyAlert: state.untrustworthyAlert?.upeerId === targetUpeerId ? null : state.untrustworthyAlert
                };
            });
        });
    },

    handleDeleteContact: (id) => {
        const { targetUpeerId } = get();
        const targetId = id || targetUpeerId;
        if (!targetId) return;

        window.upeer.deleteContact(targetId).then(() => {
            get().refreshContacts();
            if (targetId === targetUpeerId) set({ targetUpeerId: '' });
        });
    },

    handleClearChat: (id) => {
        const { targetUpeerId, activeGroupId } = get();
        const targetId = id || activeGroupId || targetUpeerId;
        if (!targetId) return;

        window.upeer.clearChat(targetId).then(() => {
            // Limpiar historial de mensajes en el estado local inmediatamente
            if (targetId === targetUpeerId) {
                set({ chatHistory: [] });
            }
            // Si es un grupo el que se vació
            if (targetId === get().activeGroupId) {
                set({ groupChatHistory: [] });
            }

            // Actualizar el estado de los contactos para limpiar la última vista previa del mensaje en el sidebar
            get().refreshContacts();
        });
    },

    handleBlockContact: (id) => {
        const { targetUpeerId } = get();
        const targetId = id || targetUpeerId;
        if (!targetId) return;

        window.upeer.blockContact(targetId).then(() => {
            get().refreshContacts();
            if (targetId === targetUpeerId) set({ targetUpeerId: '' });
        });
    },

    handleUnblockContact: (id) => {
        if (!id) return;

        window.upeer.unblockContact(id).then(() => {
            get().refreshContacts();
        });
    },

    handleRetryMessage: async (msgId: string) => {
        const { chatHistory, targetUpeerId } = get();
        const msg = chatHistory.find(m => m.id === msgId);
        if (!msg || !msg.isMine || !targetUpeerId) return;

        // Intentar reenviar el mensaje
        const retryResult = await window.upeer.sendMessage(targetUpeerId, msg.message, msg.replyTo);
        if (retryResult) {
            set(state => ({
                chatHistory: state.chatHistory.map(m =>
                    m.id === msgId ? { ...m, status: 'sent', date: Date.now() } : m
                )
            }));
        }
    },

    clearUntrustworthyAlert: () => set({ untrustworthyAlert: null }),
    setPendingFiles: (files) => set({ pendingFiles: files }),
    setIsDragging: (dragging) => set({ isDragging: dragging }),

    addFileTransferMessage: (upeerId, fileId, fileName, fileSize, mimeType, fileHash, thumbnail, caption, isMine = true, filePath, isVoiceNote) => {
        const fileMessage = {
            type: 'file',
            transferId: fileId,
            fileName,
            fileSize,
            mimeType,
            fileHash,
            thumbnail: thumbnail || '',
            caption: caption || '',
            direction: isMine ? 'sending' : 'receiving',
            filePath: isMine ? filePath : undefined,
            isVoiceNote
        };
        const messageContent = JSON.stringify(fileMessage);
        const { replyByConversation, activeGroupId, myIdentity } = get();
        const replyTo = replyByConversation[upeerId];
        const isGroup = activeGroupId === upeerId;

        set(state => {
            if (isGroup) {
                return {
                    groupChatHistory: [...state.groupChatHistory, {
                        id: fileId,
                        upeerId: upeerId,
                        groupId: upeerId,
                        isMine,
                        message: messageContent,
                        status: 'sent',
                        timestamp: formatMessageTimestamp(Date.now()),
                        replyTo: replyTo?.id,
                        senderUpeerId: isMine ? myIdentity?.upeerId : undefined,
                        senderName: isMine ? ((myIdentity as any)?.alias || (myIdentity as any)?.name || 'Yo') : undefined,
                        senderAvatar: isMine ? (myIdentity?.avatar ?? undefined) : undefined,
                        date: Date.now()
                    }],
                    replyByConversation: { ...state.replyByConversation, [upeerId]: null }
                };
            } else {
                return {
                    chatHistory: [...state.chatHistory, {
                        id: fileId,
                        upeerId: upeerId,
                        isMine,
                        message: messageContent,
                        status: (isMine && upeerId === get().myIdentity?.upeerId) ? 'read' : 'sent',
                        timestamp: formatMessageTimestamp(Date.now()),
                        replyTo: replyTo?.id,
                        date: Date.now()
                    }],
                    replyByConversation: { ...state.replyByConversation, [upeerId]: null }
                };
            }
        });
    },

    updateFileTransferMessage: (fileId, updates) => {
        set(state => {
            const updateMsg = (msg: any) => {
                if (msg.message.startsWith('{') && msg.message.endsWith('}')) {
                    try {
                        const parsed = JSON.parse(msg.message);
                        if (parsed.type === 'file' && (parsed.transferId === fileId || parsed.fileId === fileId)) {
                            const updated = { ...parsed, ...updates };
                            return { ...msg, message: JSON.stringify(updated) };
                        }
                    } catch {
                        // Si falla el parseo, simplemente devolvemos el mensaje sin cambios
                        return msg;
                    }
                }
                return msg;
            };

            return {
                chatHistory: state.chatHistory.map(updateMsg),
                groupChatHistory: state.groupChatHistory.map(updateMsg)
            };
        });
    },

    initListeners: () => {
        // Prevent double initialization
        if ((window as any).__chat_listeners_initialized) return;
        (window as any).__chat_listeners_initialized = true;

        window.upeer.onReceive((data: any) => {
            get().refreshContacts();
            const { targetUpeerId } = get();
            if (data.upeerId === targetUpeerId) {
                set(state => {
                    if (data.id && state.chatHistory.some(m => m.id === data.id)) return state;
                    if (data.id) window.upeer.sendReadReceipt(targetUpeerId, data.id);
                    return {
                        chatHistory: [...state.chatHistory, {
                            ...data,
                            status: 'read',
                            timestamp: formatMessageTimestamp(data.timestamp),
                            date: data.timestamp || Date.now()
                        }]
                    };
                });
            } else {
                const { msgNotif, sound } = useNotificationStore.getState();
                if (msgNotif && sound && !document.hidden) playNotificationSound();
            }
        });

        window.upeer.onContactRequest(async (data: any) => {
            const currentContacts = await window.upeer.getContacts();
            const existingContact = currentContacts.find((c: any) => c.upeerId === data.upeerId);
            if (!existingContact || existingContact.status !== 'connected') {
                set(state => ({
                    incomingRequests: {
                        ...state.incomingRequests,
                        [data.upeerId]: {
                            publicKey: data.publicKey,
                            avatar: data.avatar || state.incomingRequests[data.upeerId]?.avatar || undefined,
                            receivedAt: state.incomingRequests[data.upeerId]?.receivedAt ?? Date.now(),
                            untrustworthy: null,
                            vouchScore: data.vouchScore ?? state.incomingRequests[data.upeerId]?.vouchScore,
                        }
                    }
                }));
                const { reqNotif, sound } = useNotificationStore.getState();
                if (reqNotif && sound && !document.hidden) playNotificationSound();
            }
            get().refreshContacts();
        });

        window.upeer.onHandshakeFinished((data: any) => {
            get().refreshContacts();
            const { targetUpeerId } = get();
            if (targetUpeerId.startsWith('pending-')) {
                get().setTargetUpeerId(data.upeerId);
            }
        });

        window.upeer.onTyping((data: any) => {
            const { upeerId } = data;
            set(state => {
                if (state.typingStatus[upeerId]) clearTimeout(state.typingStatus[upeerId]);
                const timeout = setTimeout(() => {
                    set(curr => {
                        const newState = { ...curr.typingStatus };
                        delete newState[upeerId];
                        return { typingStatus: newState };
                    });
                }, 3000);
                return { typingStatus: { ...state.typingStatus, [upeerId]: timeout } };
            });
        });

        window.upeer.onGroupMessage((data: any) => {
            get().refreshGroups();
            const { activeGroupId, contacts, myIdentity } = get();
            if (data.groupId !== activeGroupId) {
                const { msgNotif, sound } = useNotificationStore.getState();
                if (msgNotif && sound && !document.hidden) playNotificationSound();
            }
            if (data.groupId === activeGroupId) {
                set(state => {
                    if (data.id && state.groupChatHistory.some(m => m.id === data.id)) return state;
                    const sender = data.isMine ? myIdentity : contacts.find((c: any) => c.upeerId === data.senderUpeerId);
                    return {
                        groupChatHistory: [...state.groupChatHistory, {
                            id: data.id,
                            upeerId: data.groupId,
                            groupId: data.groupId,
                            isMine: !!data.isMine,
                            message: data.message,
                            isSystem: data.isSystem || undefined,
                            status: data.status || 'delivered',
                            timestamp: formatMessageTimestamp(data.timestamp),
                            replyTo: data.replyTo,
                            senderUpeerId: data.senderUpeerId,
                            senderName: (sender as any)?.name || (sender as any)?.alias || data.senderName || 'Usuario desconocido',
                            senderAvatar: sender?.avatar ?? undefined,
                            date: data.timestamp || Date.now()
                        }]
                    };
                });
            }
        });

        window.upeer.onGroupInvite(() => get().refreshGroups());
        window.upeer.onGroupUpdated(() => get().refreshGroups());

        window.upeer.onMessageDelivered((data: any) => {
            get().refreshContacts();
            set(state => ({
                chatHistory: state.chatHistory.map(msg =>
                    msg.id === data.id && msg.status !== 'read' ? { ...msg, status: 'delivered' } : msg
                )
            }));
        });

        window.upeer.onMessageRead((data: any) => {
            get().refreshContacts();
            set(state => ({
                chatHistory: state.chatHistory.map(msg =>
                    msg.id === data.id ? { ...msg, status: 'read' } : msg
                )
            }));
        });

        window.upeer.onMessageStatusUpdated((data: { id: string, status: string }) => {
            set(state => ({
                chatHistory: state.chatHistory.map(msg =>
                    msg.id === data.id ? { ...msg, status: data.status } : msg
                ),
                groupChatHistory: state.groupChatHistory.map(msg =>
                    msg.id === data.id ? { ...msg, status: data.status } : msg
                )
            }));
            get().refreshContacts();
        });

        window.upeer.onGroupMessageDelivered((data: any) => {
            const { activeGroupId } = get();
            if (data.groupId === activeGroupId) {
                set(state => ({
                    groupChatHistory: state.groupChatHistory.map(msg =>
                        msg.id === data.id ? { ...msg, status: 'read' } : msg
                    )
                }));
            }
        });

        window.upeer.onMessageDeleted && window.upeer.onMessageDeleted((data: { id: string, upeerId: string, chatUpeerId: string }) => {
            const { targetUpeerId, activeGroupId } = get();
            const updateFn = (msg: any) => msg.id === data.id ? { ...msg, message: "Mensaje eliminado", isDeleted: true } : msg;

            if (data.chatUpeerId === targetUpeerId) {
                set(state => ({
                    chatHistory: state.chatHistory.map(updateFn)
                }));
            }
            if (data.chatUpeerId === activeGroupId) {
                set(state => ({
                    groupChatHistory: state.groupChatHistory.map(updateFn)
                }));
            }
        });


        window.upeer.onChatCleared && window.upeer.onChatCleared((data: { upeerId: string }) => {
            const { targetUpeerId, activeGroupId } = get();
            if (data.upeerId === targetUpeerId) {
                set({ chatHistory: [] });
            }
            if (data.upeerId === activeGroupId) {
                set({ groupChatHistory: [] });
            }
            get().refreshContacts();
        });

        window.upeer.onMessageReactionUpdated((data: { msgId: string, upeerId: string, chatUpeerId: string, emoji: string, remove: boolean }) => {
            const { targetUpeerId, activeGroupId } = get();
            if (data.chatUpeerId === targetUpeerId || data.chatUpeerId === activeGroupId) {
                const updateFn = (msg: any) => {
                    if (msg.id === data.msgId) {
                        const reactions = msg.reactions || [];
                        if (data.remove) {
                            return { ...msg, reactions: reactions.filter((r: any) => !(r.upeerId === data.upeerId && r.emoji === data.emoji)) };
                        } else {
                            if (reactions.some((r: any) => r.upeerId === data.upeerId && r.emoji === data.emoji)) return msg;
                            return { ...msg, reactions: [...reactions, { upeerId: data.upeerId, emoji: data.emoji }] };
                        }
                    }
                    return msg;
                };

                set(state => ({
                    chatHistory: state.chatHistory.map(updateFn),
                    groupChatHistory: state.groupChatHistory.map(updateFn)
                }));
            }
        });

        window.upeer.onMessageUpdated((data: { id: string, upeerId: string, chatUpeerId: string, content: string }) => {
            const { targetUpeerId, activeGroupId } = get();
            if (data.chatUpeerId === targetUpeerId || data.chatUpeerId === activeGroupId) {
                const updateFn = (msg: any) => msg.id === data.id ? { ...msg, message: data.content, isEdited: true } : msg;
                set(state => ({
                    chatHistory: state.chatHistory.map(updateFn),
                    groupChatHistory: state.groupChatHistory.map(updateFn)
                }));
            }
        });

        window.upeer.onFocusConversation && window.upeer.onFocusConversation((data: { upeerId?: string; groupId?: string }) => {
            useNavigationStore.getState().goToChat();
            if (data.groupId) {
                get().setActiveGroupId(data.groupId);
            } else if (data.upeerId) {
                get().setTargetUpeerId(data.upeerId);
            }
        });

        window.upeer.onReputationUpdated?.(() => {
            get().refreshContacts();
        });
    }
}));
