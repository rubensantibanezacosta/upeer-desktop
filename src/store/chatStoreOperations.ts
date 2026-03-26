import { applyReactionUpdate, formatMessageTimestamp } from './chatStoreSupport.js';
import type { ChatGet, ChatSet } from './chatStoreTypes.js';

export const createChatOperationActions = (set: ChatSet, get: ChatGet) => ({
    handleTyping: () => {
        const { targetUpeerId } = get();
        if (targetUpeerId) {
            window.upeer.sendTypingIndicator(targetUpeerId);
        }
    },

    handleCreateGroup: async (name: string, memberIds: string[], avatar?: string) => {
        const response = await window.upeer.createGroup(name, memberIds, avatar);
        if (response?.success) {
            get().refreshGroups();
            get().setActiveGroupId(response.groupId);
            return response;
        }
        return response || { success: false, groupId: '' };
    },

    handleUpdateGroup: async (groupId: string, fields: { name?: string; avatar?: string | null }) => {
        await window.upeer.updateGroup(groupId, fields);
        get().refreshGroups();
    },

    handleInviteGroupMembers: async (groupId: string, memberIds: string[]) => {
        for (const memberId of memberIds) {
            await window.upeer.inviteToGroup(groupId, memberId);
        }
        await get().refreshGroups();
    },

    handleToggleFavoriteGroup: async (groupId: string) => {
        const group = get().groups.find((item) => item.groupId === groupId);
        if (!group) {
            return;
        }
        await window.upeer.toggleFavoriteGroup(groupId, !group.isFavorite);
        await get().refreshGroups();
    },

    handleLeaveGroup: async (groupId: string) => {
        await window.upeer.leaveGroup(groupId);
        get().refreshGroups();
        if (get().activeGroupId === groupId) {
            set({ activeGroupId: '', groupChatHistory: [], isWindowedHistory: false });
        }
    },

    handleSend: async (linkPreview?: any) => {
        const { targetUpeerId, activeGroupId, messagesByConversation, replyByConversation, myIdentity } = get();
        const effectiveId = targetUpeerId || activeGroupId;
        if (!effectiveId) {
            return;
        }
        const message = messagesByConversation[effectiveId];
        const replyTo = replyByConversation[effectiveId];
        if (!message) {
            return;
        }
        if (activeGroupId) {
            await get().handleSendGroupMessage(message, linkPreview);
            return;
        }
        const sendResult = await window.upeer.sendMessage(targetUpeerId, message, replyTo?.id, linkPreview ?? undefined);
        if (sendResult) {
            set((state) => ({
                chatHistory: [...state.chatHistory, {
                    id: sendResult.id,
                    upeerId: targetUpeerId,
                    isMine: true,
                    message: sendResult.savedMessage,
                    status: targetUpeerId === myIdentity?.upeerId ? 'read' : 'sent',
                    timestamp: formatMessageTimestamp(sendResult.timestamp),
                    replyTo: replyTo?.id,
                    date: sendResult.timestamp,
                }],
                messagesByConversation: { ...state.messagesByConversation, [targetUpeerId]: '' },
                replyByConversation: { ...state.replyByConversation, [targetUpeerId]: null },
            }));
        }
        get().refreshContacts();
    },

    handleShareContact: async (contact: { name: string; address: string; upeerId?: string; publicKey?: string; avatar?: string }) => {
        const { targetUpeerId, activeGroupId } = get();
        if (!targetUpeerId || activeGroupId) {
            return;
        }

        const msgId = await window.upeer.sendContactCard(targetUpeerId, contact);
        if (!msgId) {
            return;
        }

        await get().reloadLatestHistory();
        await get().refreshContacts();
    },

    handleSendGroupMessage: async (message: string, linkPreview?: any) => {
        const { activeGroupId, myIdentity, replyByConversation } = get();
        if (!activeGroupId || !message) {
            return;
        }
        const replyTo = replyByConversation[activeGroupId];
        const sendResult = await window.upeer.sendGroupMessage(activeGroupId, message, replyTo?.id, linkPreview ?? undefined);
        if (sendResult) {
            set((state) => ({
                groupChatHistory: [...state.groupChatHistory, {
                    id: sendResult.id,
                    upeerId: activeGroupId,
                    groupId: activeGroupId,
                    isMine: true,
                    message: sendResult.savedMessage ?? message,
                    status: 'sent',
                    timestamp: formatMessageTimestamp(sendResult.timestamp),
                    replyTo: replyTo?.id,
                    senderUpeerId: myIdentity?.upeerId,
                    senderName: myIdentity?.alias || myIdentity?.name || 'Yo',
                    senderAvatar: myIdentity?.avatar ?? undefined,
                    date: sendResult.timestamp,
                }],
                messagesByConversation: { ...state.messagesByConversation, [activeGroupId]: '' },
                replyByConversation: { ...state.replyByConversation, [activeGroupId]: null },
            }));
        }
        get().refreshGroups();
    },

    handleReaction: (msgId: string, emoji: string, remove: boolean) => {
        const { targetUpeerId, activeGroupId, myIdentity } = get();
        const effectiveId = targetUpeerId || activeGroupId;
        if (!effectiveId) {
            return;
        }
        window.upeer.sendChatReaction(effectiveId, msgId, emoji, remove);
        const myId = myIdentity?.upeerId || 'me';
        set((state) => ({
            chatHistory: state.chatHistory.map((message: any) => message.id === msgId ? applyReactionUpdate(message, myId, emoji, remove) : message),
            groupChatHistory: state.groupChatHistory.map((message: any) => message.id === msgId ? applyReactionUpdate(message, myId, emoji, remove) : message),
        }));
    },

    handleUpdateMessage: (msgId: string, newContent: string, linkPreview?: any) => {
        const { targetUpeerId, activeGroupId, chatHistory, groupChatHistory } = get();
        const effectiveId = targetUpeerId || activeGroupId;
        if (!effectiveId) {
            return;
        }
        const existing = [...chatHistory, ...groupChatHistory].find((message) => message.id === msgId);
        let savedContent = newContent;
        if (existing) {
            const raw = existing.message;
            if (raw.startsWith('{') && raw.endsWith('}')) {
                try {
                    const parsed = JSON.parse(raw);
                    if (parsed.type === 'file') {
                        savedContent = JSON.stringify({ ...parsed, caption: newContent });
                    } else if (linkPreview) {
                        savedContent = JSON.stringify({ text: newContent, linkPreview });
                    } else if (parsed.linkPreview && typeof parsed.text === 'string') {
                        savedContent = newContent;
                    }
                } catch {
                    savedContent = newContent;
                }
            }
        } else if (linkPreview) {
            savedContent = JSON.stringify({ text: newContent, linkPreview });
        }
        window.upeer.sendChatUpdate(effectiveId, msgId, newContent, linkPreview ?? undefined);
        set((state) => ({
            chatHistory: state.chatHistory.map((message: any) => message.id === msgId ? { ...message, message: savedContent, isEdited: true } : message),
            groupChatHistory: state.groupChatHistory.map((message: any) => message.id === msgId ? { ...message, message: savedContent, isEdited: true } : message),
        }));
    },

    handleDeleteMessage: (msgId: string) => {
        const { targetUpeerId, activeGroupId } = get();
        const effectiveId = targetUpeerId || activeGroupId;
        if (!effectiveId) {
            return;
        }
        window.upeer.sendChatDelete(effectiveId, msgId);
        set((state) => ({
            chatHistory: state.chatHistory.map((message: any) => message.id === msgId ? { ...message, message: 'Mensaje eliminado', isDeleted: true } : message),
            groupChatHistory: state.groupChatHistory.map((message: any) => message.id === msgId ? { ...message, message: 'Mensaje eliminado', isDeleted: true } : message),
        }));
    },

    handleAddContact: (idAtAddress: string, name: string) => {
        window.upeer.addContact(idAtAddress, name).then((result: any) => {
            get().refreshContacts();
            if (result.upeerId) {
                get().setTargetUpeerId(result.upeerId);
            }
        });
    },

    handleAcceptContact: () => {
        const { targetUpeerId, incomingRequests, contacts } = get();
        if (!targetUpeerId) {
            return;
        }
        const request = incomingRequests[targetUpeerId];
        const contact = contacts.find((item) => item.upeerId === targetUpeerId);
        const publicKey = request?.publicKey || contact?.publicKey;
        if (!publicKey) {
            return;
        }
        window.upeer.acceptContactRequest(targetUpeerId, publicKey).then(() => {
            get().refreshContacts();
            set((state) => {
                const incomingRequestsState = { ...state.incomingRequests };
                const untrustworthyAlerts = { ...state.untrustworthyAlerts };
                delete incomingRequestsState[targetUpeerId];
                delete untrustworthyAlerts[targetUpeerId];
                return {
                    incomingRequests: incomingRequestsState,
                    untrustworthyAlerts,
                    untrustworthyAlert: state.untrustworthyAlert?.upeerId === targetUpeerId ? null : state.untrustworthyAlert,
                };
            });
        });
    },

    handleDeleteContact: (id?: string) => {
        const { targetUpeerId } = get();
        const targetId = id || targetUpeerId;
        if (!targetId) {
            return;
        }
        window.upeer.deleteContact(targetId).then(() => {
            get().refreshContacts();
            if (targetId === targetUpeerId) {
                set({ targetUpeerId: '' });
            }
        });
    },

    handleToggleFavorite: async (id?: string) => {
        const { targetUpeerId, contacts } = get();
        const targetId = id || targetUpeerId;
        if (!targetId) {
            return;
        }
        const contact = contacts.find((item) => item.upeerId === targetId);
        if (!contact || contact.isConversationOnly) {
            return;
        }
        await window.upeer.toggleFavoriteContact(targetId, !contact.isFavorite);
        await get().refreshContacts();
    },

    handleClearChat: async (id?: string) => {
        const { targetUpeerId, activeGroupId } = get();
        const targetId = id || activeGroupId || targetUpeerId;
        if (!targetId) {
            return;
        }
        const result = await window.upeer.clearChat(targetId);
        if (!result?.success) {
            await get().reloadLatestHistory();
            if (typeof window !== 'undefined' && typeof window.alert === 'function') {
                window.alert(result?.error || 'No se pudo vaciar el chat.');
            }
            return;
        }
        if (targetId === targetUpeerId) {
            set({ chatHistory: [] });
        }
        if (targetId === get().activeGroupId) {
            set({ groupChatHistory: [] });
        }
        get().refreshContacts();
    },

    handleBlockContact: (id?: string) => {
        const { targetUpeerId } = get();
        const targetId = id || targetUpeerId;
        if (!targetId) {
            return;
        }
        window.upeer.blockContact(targetId).then(() => {
            get().refreshContacts();
            if (targetId === targetUpeerId) {
                set({ targetUpeerId: '' });
            }
        });
    },

    handleUnblockContact: (id: string) => {
        if (!id) {
            return;
        }
        window.upeer.unblockContact(id).then(() => {
            get().refreshContacts();
        });
    },

});
