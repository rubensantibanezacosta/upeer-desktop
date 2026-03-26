import { useNavigationStore } from './useNavigationStore.js';
import { useNotificationStore } from './useNotificationStore.js';
import { playNotificationSound } from '../utils/notificationSound.js';
import type { ChatGet, ChatSet } from './chatStoreTypes.js';
import { applyReactionUpdate, formatMessageTimestamp } from './chatStoreSupport.js';

export const createChatListenerActions = (set: ChatSet, get: ChatGet) => ({
    initListeners: () => {
        if ((window as any).__chat_listeners_initialized) {
            return;
        }
        (window as any).__chat_listeners_initialized = true;

        window.upeer.onReceive((data: any) => {
            get().refreshContacts();
            const { targetUpeerId } = get();
            if (data.upeerId === targetUpeerId) {
                set((state) => {
                    if (data.id && state.chatHistory.some((message) => message.id === data.id)) {
                        return state;
                    }
                    if (data.id) {
                        window.upeer.sendReadReceipt(targetUpeerId, data.id);
                    }
                    return {
                        chatHistory: [...state.chatHistory, {
                            ...data,
                            status: 'read',
                            timestamp: formatMessageTimestamp(data.timestamp),
                            date: data.timestamp || Date.now(),
                        }],
                    };
                });
                return;
            }
            const { msgNotif, sound } = useNotificationStore.getState();
            if (msgNotif && sound && !document.hidden) {
                playNotificationSound();
            }
        });

        window.upeer.onContactRequest(async (data: any) => {
            const currentContacts = await window.upeer.getContacts();
            const existingContact = currentContacts.find((contact: any) => contact.upeerId === data.upeerId);
            if (!existingContact || existingContact.status !== 'connected') {
                set((state) => ({
                    incomingRequests: {
                        ...state.incomingRequests,
                        [data.upeerId]: {
                            publicKey: data.publicKey,
                            avatar: data.avatar || state.incomingRequests[data.upeerId]?.avatar || undefined,
                            receivedAt: state.incomingRequests[data.upeerId]?.receivedAt ?? Date.now(),
                            untrustworthy: null,
                            vouchScore: data.vouchScore ?? state.incomingRequests[data.upeerId]?.vouchScore,
                        },
                    },
                }));
                const { reqNotif, sound } = useNotificationStore.getState();
                if (reqNotif && sound && !document.hidden) {
                    playNotificationSound();
                }
            }
            get().refreshContacts();
        });

        window.upeer.onHandshakeFinished((data: any) => {
            get().refreshContacts();
            if (get().targetUpeerId.startsWith('pending-')) {
                get().setTargetUpeerId(data.upeerId);
            }
        });

        window.upeer.onTyping((data: any) => {
            const { upeerId } = data;
            set((state) => {
                if (state.typingStatus[upeerId]) {
                    clearTimeout(state.typingStatus[upeerId]);
                }
                const timeout = setTimeout(() => {
                    set((currentState) => {
                        const typingStatus = { ...currentState.typingStatus };
                        delete typingStatus[upeerId];
                        return { typingStatus };
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
                if (msgNotif && sound && !document.hidden) {
                    playNotificationSound();
                }
            }
            if (data.groupId === activeGroupId) {
                set((state) => {
                    if (data.id && state.groupChatHistory.some((message) => message.id === data.id)) {
                        return state;
                    }
                    const sender = data.isMine ? myIdentity : contacts.find((contact: any) => contact.upeerId === data.senderUpeerId);
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
                            date: data.timestamp || Date.now(),
                        }],
                    };
                });
            }
        });

        window.upeer.onGroupInvite(() => get().refreshGroups());
        window.upeer.onGroupUpdated(() => get().refreshGroups());

        window.upeer.onMessageDelivered((data: any) => {
            get().refreshContacts();
            set((state) => ({
                chatHistory: state.chatHistory.map((message) => message.id === data.id && message.status !== 'read' ? { ...message, status: 'delivered' } : message),
            }));
        });

        window.upeer.onMessageRead((data: any) => {
            get().refreshContacts();
            set((state) => ({
                chatHistory: state.chatHistory.map((message) => message.id === data.id ? { ...message, status: 'read' } : message),
            }));
        });

        window.upeer.onMessageStatusUpdated((data: { id: string; status: string }) => {
            set((state) => ({
                chatHistory: state.chatHistory.map((message) => message.id === data.id ? { ...message, status: data.status } : message),
                groupChatHistory: state.groupChatHistory.map((message) => message.id === data.id ? { ...message, status: data.status } : message),
            }));
            get().refreshContacts();
        });

        window.upeer.onGroupMessageDelivered((data: any) => {
            if (data.groupId === get().activeGroupId) {
                set((state) => ({
                    groupChatHistory: state.groupChatHistory.map((message) => message.id === data.id ? { ...message, status: 'read' } : message),
                }));
            }
        });

        if (window.upeer.onMessageDeleted) {
            window.upeer.onMessageDeleted((data: { id: string; chatUpeerId: string }) => {
                const { targetUpeerId, activeGroupId } = get();
                const updateDeletedMessage = (message: any) => message.id === data.id ? { ...message, message: 'Mensaje eliminado', isDeleted: true } : message;
                if (data.chatUpeerId === targetUpeerId) {
                    set((state) => ({ chatHistory: state.chatHistory.map(updateDeletedMessage) }));
                }
                if (data.chatUpeerId === activeGroupId) {
                    set((state) => ({ groupChatHistory: state.groupChatHistory.map(updateDeletedMessage) }));
                }
            });
        }

        if (window.upeer.onChatCleared) {
            window.upeer.onChatCleared((data: { upeerId: string }) => {
                const { targetUpeerId, activeGroupId } = get();
                if (data.upeerId === targetUpeerId) {
                    set({ chatHistory: [] });
                }
                if (data.upeerId === activeGroupId) {
                    set({ groupChatHistory: [] });
                }
                get().refreshContacts();
            });
        }

        window.upeer.onMessageReactionUpdated((data: { msgId: string; upeerId: string; chatUpeerId: string; emoji: string; remove: boolean }) => {
            const { targetUpeerId, activeGroupId } = get();
            if (data.chatUpeerId === targetUpeerId || data.chatUpeerId === activeGroupId) {
                set((state) => ({
                    chatHistory: state.chatHistory.map((message: any) => message.id === data.msgId ? applyReactionUpdate(message, data.upeerId, data.emoji, data.remove) : message),
                    groupChatHistory: state.groupChatHistory.map((message: any) => message.id === data.msgId ? applyReactionUpdate(message, data.upeerId, data.emoji, data.remove) : message),
                }));
            }
        });

        window.upeer.onMessageUpdated((data: { id: string; chatUpeerId: string; content: string }) => {
            const { targetUpeerId, activeGroupId } = get();
            if (data.chatUpeerId === targetUpeerId || data.chatUpeerId === activeGroupId) {
                set((state) => ({
                    chatHistory: state.chatHistory.map((message: any) => message.id === data.id ? { ...message, message: data.content, isEdited: true } : message),
                    groupChatHistory: state.groupChatHistory.map((message: any) => message.id === data.id ? { ...message, message: data.content, isEdited: true } : message),
                }));
            }
        });

        if (window.upeer.onFocusConversation) {
            window.upeer.onFocusConversation((data: { upeerId?: string; groupId?: string }) => {
                useNavigationStore.getState().goToChat();
                if (data.groupId) {
                    get().setActiveGroupId(data.groupId);
                } else if (data.upeerId) {
                    get().setTargetUpeerId(data.upeerId);
                }
            });
        }

        window.upeer.onReputationUpdated?.(() => {
            get().refreshContacts();
        });
    },
});
