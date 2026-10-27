import { formatMessageTimestamp, insertMessageChronologically } from './chatStoreSupport.js';
import type { ChatGet, ChatSet } from './chatStoreTypes.js';
import type { LinkPreview } from '../types/chat.js';

export const createChatSendActions = (set: ChatSet, get: ChatGet) => ({
    handleSend: async (linkPreview?: LinkPreview | null) => {
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
        const messageId = window.crypto.randomUUID();
        const timestamp = Date.now();
        set((state) => ({
            chatHistory: state.targetUpeerId === targetUpeerId
                ? insertMessageChronologically(state.chatHistory, {
                    id: messageId,
                    upeerId: targetUpeerId,
                    isMine: true,
                    message,
                    status: targetUpeerId === myIdentity?.upeerId ? 'read' : 'sending',
                    timestamp: formatMessageTimestamp(timestamp),
                    replyTo: replyTo?.id,
                    date: timestamp,
                })
                : state.chatHistory,
            messagesByConversation: { ...state.messagesByConversation, [targetUpeerId]: '' },
            replyByConversation: { ...state.replyByConversation, [targetUpeerId]: null },
        }));

        try {
            const sendResult = await window.upeer.sendMessage(targetUpeerId, message, replyTo?.id, linkPreview ?? undefined, messageId);
            set((state) => ({
                chatHistory: sendResult
                    ? insertMessageChronologically(
                        state.chatHistory.filter((item) => item.id !== messageId),
                        {
                            id: messageId,
                            upeerId: targetUpeerId,
                            isMine: true,
                            message: sendResult.savedMessage,
                            status: targetUpeerId === myIdentity?.upeerId ? 'read' : 'sent',
                            replyTo: replyTo?.id,
                            date: sendResult.timestamp,
                            timestamp: formatMessageTimestamp(sendResult.timestamp),
                        },
                    )
                    : state.chatHistory.map((item) => item.id === messageId ? { ...item, status: 'failed' } : item),
            }));
        } catch (sendError: unknown) {
            console.warn('No se pudo enviar el mensaje:', sendError);
            set((state) => ({
                chatHistory: state.chatHistory.map((item) => item.id === messageId ? { ...item, status: 'failed' } : item),
            }));
        }
        get().refreshContacts();
    },

    handleSendGroupMessage: async (message: string, linkPreview?: LinkPreview | null) => {
        const { activeGroupId, myIdentity, replyByConversation } = get();
        if (!activeGroupId || !message) {
            return;
        }
        const replyTo = replyByConversation[activeGroupId];
        const messageId = window.crypto.randomUUID();
        const timestamp = Date.now();
        set((state) => ({
            groupChatHistory: insertMessageChronologically(state.groupChatHistory, {
                id: messageId,
                upeerId: activeGroupId,
                groupId: activeGroupId,
                isMine: true,
                message,
                status: 'sending',
                timestamp: formatMessageTimestamp(timestamp),
                replyTo: replyTo?.id,
                senderUpeerId: myIdentity?.upeerId,
                senderName: myIdentity?.alias || myIdentity?.name || 'Yo',
                senderAvatar: myIdentity?.avatar ?? undefined,
                date: timestamp,
            }),
            messagesByConversation: { ...state.messagesByConversation, [activeGroupId]: '' },
            replyByConversation: { ...state.replyByConversation, [activeGroupId]: null },
        }));
        try {
            const sendResult = await window.upeer.sendGroupMessage(activeGroupId, message, replyTo?.id, linkPreview ?? undefined);
            set((state) => {
                if (state.activeGroupId !== activeGroupId) {
                    return state;
                }
                if (!sendResult) {
                    return {
                        groupChatHistory: state.groupChatHistory.map((item) => item.id === messageId ? { ...item, status: 'failed' } : item),
                    };
                }
                return {
                    groupChatHistory: insertMessageChronologically(
                        state.groupChatHistory.filter((item) => item.id !== messageId),
                        {
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
                        },
                    ),
                };
            });
        } catch (sendError: unknown) {
            console.warn('No se pudo enviar el mensaje de grupo:', sendError);
            set((state) => ({
                groupChatHistory: state.groupChatHistory.map((item) => item.id === messageId ? { ...item, status: 'failed' } : item),
            }));
        }
        get().refreshGroups();
    },
});
