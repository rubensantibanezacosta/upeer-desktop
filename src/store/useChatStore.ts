import { create } from 'zustand';
import { ChatMessage, Contact, Group, MediaItem } from '../types/chat.js';

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

    // Utilities
    clearUntrustworthyAlert: () => void;
    setPendingFiles: (files: any[]) => void;
    setIsDragging: (dragging: boolean) => void;

    // Actions extra
    handleRetryMessage: (msgId: string) => Promise<void>;

    // File Transfer Messages
    addFileTransferMessage: (upeerId: string, fileId: string, fileName: string, fileSize: number, mimeType: string, fileHash: string, thumbnail?: string, caption?: string, isMine?: boolean) => void;
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
        set({ targetUpeerId: id, activeGroupId: '' });
        if (id) {
            window.upeer.getMessages(id).then(msgs => {
                set({
                    chatHistory: msgs.reverse().map((m: any) => {
                        if (!m.isMine && m.status !== 'read') {
                            window.upeer.sendReadReceipt(id, m.id);
                            m.status = 'read';
                        }
                        return {
                            id: m.id,
                            upeerId: m.chatUpeerId,
                            isMine: !!m.isMine,
                            message: m.message,
                            status: m.status,
                            timestamp: new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                            replyTo: m.replyTo,
                            reactions: m.reactions,
                            isEdited: !!m.isEdited,
                            isDeleted: !!m.isDeleted,
                            date: m.timestamp
                        };
                    })
                });
            });
        }
    },
    setActiveGroupId: (id) => {
        set({ activeGroupId: id, targetUpeerId: '' });
        if (id) {
            window.upeer.getMessages(id).then(async (msgs: any[]) => {
                const contacts = get().contacts;
                const myIdentity = get().myIdentity;

                set({
                    groupChatHistory: msgs.reverse().map((m: any) => {
                        if (!m.isMine && m.status !== 'read') {
                            window.upeer.sendReadReceipt(id, m.id);
                            m.status = 'read';
                        }
                        const sender = m.isMine ? myIdentity : (contacts as any[]).find((c: any) => c.upeerId === m.senderUpeerId);
                        return {
                            id: m.id,
                            upeerId: id,
                            groupId: id,
                            isMine: !!m.isMine,
                            message: m.message?.startsWith('__SYS__|') ? m.message.slice(8) : m.message,
                            isSystem: m.message?.startsWith('__SYS__|') || undefined,
                            status: m.status,
                            timestamp: new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                            replyTo: m.replyTo,
                            reactions: m.reactions,
                            isEdited: !!m.isEdited,
                            isDeleted: !!m.isDeleted,
                            senderUpeerId: m.senderUpeerId,
                            senderName: (sender as any)?.name || (sender as any)?.alias || m.senderName || 'Usuario desconocido',
                            senderAvatar: (sender as any)?.avatar,
                            date: m.timestamp
                        };
                    })
                });
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
        if (get().activeGroupId === groupId) set({ activeGroupId: '' });
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

        const sentMessageId = await window.upeer.sendMessage(targetUpeerId, msg, replyTo?.id);

        if (sentMessageId) {
            set(state => ({
                chatHistory: [...state.chatHistory, {
                    id: sentMessageId,
                    upeerId: targetUpeerId,
                    isMine: true,
                    message: msg,
                    status: targetUpeerId === myIdentity?.upeerId ? 'read' : 'sent',
                    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                    replyTo: replyTo?.id,
                    date: Date.now()
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

        const sentId = await window.upeer.sendGroupMessage(activeGroupId, msg);
        if (sentId) {
            set(state => ({
                groupChatHistory: [...state.groupChatHistory, {
                    id: sentId,
                    upeerId: activeGroupId,
                    groupId: activeGroupId,
                    isMine: true,
                    message: msg,
                    status: 'sent',
                    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                    senderUpeerId: myIdentity?.upeerId,
                    senderName: myIdentity?.alias || myIdentity?.name || 'Yo',
                    senderAvatar: myIdentity?.avatar,
                    date: Date.now()
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
        const { targetUpeerId, activeGroupId } = get();
        const effectiveId = targetUpeerId || activeGroupId;
        if (!effectiveId) return;
        
        window.upeer.sendChatUpdate(effectiveId, msgId, newContent);
        
        const updateFn = (msg: any) => msg.id === msgId ? { ...msg, message: newContent, isEdited: true } : msg;
        
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
        const { targetUpeerId, incomingRequests } = get();
        const request = incomingRequests[targetUpeerId];
        if (request?.publicKey) {
            window.upeer.acceptContactRequest(targetUpeerId, request.publicKey).then(() => {
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
        }
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
        const { targetUpeerId } = get();
        const targetId = id || targetUpeerId;
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

    handleRetryMessage: async (msgId: string) => {
        const { chatHistory, targetUpeerId } = get();
        const msg = chatHistory.find(m => m.id === msgId);
        if (!msg || !msg.isMine || !targetUpeerId) return;

        // Intentar reenviar el mensaje
        const sentId = await window.upeer.sendMessage(targetUpeerId, msg.message, msg.replyTo);
        if (sentId) {
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

    addFileTransferMessage: (upeerId, fileId, fileName, fileSize, mimeType, fileHash, thumbnail, caption, isMine = true) => {
        const fileMessage = {
            type: 'file',
            transferId: fileId,
            fileName,
            fileSize,
            mimeType,
            fileHash,
            thumbnail: thumbnail || '',
            caption: caption || '',
            direction: isMine ? 'sending' : 'receiving'
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
                        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                        replyTo: replyTo?.id,
                        senderUpeerId: isMine ? myIdentity?.upeerId : undefined,
                        senderName: isMine ? ((myIdentity as any)?.alias || (myIdentity as any)?.name || 'Yo') : undefined,
                        senderAvatar: isMine ? myIdentity?.avatar : undefined,
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
                        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
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
                    } catch (e) { /* ignore */ }
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
                            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                            date: data.timestamp || Date.now()
                        }]
                    };
                });
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
                            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                            replyTo: data.replyTo,
                            senderUpeerId: data.senderUpeerId,
                            senderName: (sender as any)?.name || (sender as any)?.alias || data.senderName || 'Usuario desconocido',
                            senderAvatar: sender?.avatar,
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

        // @ts-ignore
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

        // Add other listeners as needed (deletions, etc.)
    }
}));
