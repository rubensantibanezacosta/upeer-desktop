import type { ChatGet, ChatSet } from './chatStoreTypes.js';
import { formatMessageTimestamp, insertMessageChronologically, updateTransferMessageContent } from './chatStoreSupport.js';
import type { LinkPreview, PendingFile, TransferMessageUpdates } from '../types/chat.js';

export const createChatTransferActions = (set: ChatSet, get: ChatGet) => ({
    clearUntrustworthyAlert: () => set({ untrustworthyAlert: null }),
    clearKeyChangeAlert: (upeerId?: string) => set((state) => {
        if (!upeerId) {
            return { keyChangeAlerts: {} };
        }
        const keyChangeAlerts = { ...state.keyChangeAlerts };
        delete keyChangeAlerts[upeerId];
        return { keyChangeAlerts };
    }),
    setPendingFiles: (files: PendingFile[]) => set({ pendingFiles: files }),
    setIsDragging: (dragging: boolean) => set({ isDragging: dragging }),

    handleRetryMessage: async (msgId: string) => {
        const { chatHistory, targetUpeerId } = get();
        const message = chatHistory.find((item) => item.id === msgId);
        if (!message || !message.isMine || !targetUpeerId) {
            return;
        }
        let retryMessage = message.message;
        let retryLinkPreview: LinkPreview | undefined;
        if (retryMessage.startsWith('{') && retryMessage.endsWith('}')) {
            try {
                const parsed = JSON.parse(retryMessage);
                if (typeof parsed?.text === 'string') {
                    retryMessage = parsed.text;
                    retryLinkPreview = parsed.linkPreview ?? undefined;
                }
            } catch {
                retryLinkPreview = undefined;
            }
        }
        const retryResult = await window.upeer.sendMessage(targetUpeerId, retryMessage, message.replyTo, retryLinkPreview, msgId);
        if (retryResult) {
            set((state) => ({
                chatHistory: state.chatHistory.map((item) => item.id === msgId ? { ...item, status: 'sent', date: retryResult.timestamp || Date.now() } : item),
            }));
        }
    },

    addFileTransferMessage: (
        upeerId: string,
        fileId: string,
        fileName: string,
        fileSize: number,
        mimeType: string,
        fileHash: string,
        thumbnail?: string,
        caption?: string,
        isMine = true,
        filePath?: string,
        isVoiceNote?: boolean,
    ) => {
        const timestamp = Date.now();
        const messageContent = JSON.stringify({
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
            isVoiceNote,
        });
        const { replyByConversation, activeGroupId, myIdentity } = get();
        const replyTo = replyByConversation[upeerId];
        const isGroup = activeGroupId === upeerId;
        set((state) => isGroup ? {
            groupChatHistory: insertMessageChronologically(state.groupChatHistory, {
                id: fileId,
                upeerId,
                groupId: upeerId,
                isMine,
                message: messageContent,
                status: 'sent',
                timestamp: formatMessageTimestamp(timestamp),
                replyTo: replyTo?.id,
                senderUpeerId: isMine ? myIdentity?.upeerId : undefined,
                senderName: isMine ? (myIdentity?.alias || myIdentity?.name || 'Yo') : undefined,
                senderAvatar: isMine ? (myIdentity?.avatar ?? undefined) : undefined,
                date: timestamp,
            }),
            replyByConversation: { ...state.replyByConversation, [upeerId]: null },
        } : {
            chatHistory: insertMessageChronologically(state.chatHistory, {
                id: fileId,
                upeerId,
                isMine,
                message: messageContent,
                status: isMine && upeerId === get().myIdentity?.upeerId ? 'read' : 'sent',
                timestamp: formatMessageTimestamp(timestamp),
                replyTo: replyTo?.id,
                date: timestamp,
            }),
            replyByConversation: { ...state.replyByConversation, [upeerId]: null },
        });
    },

    updateFileTransferMessage: (fileId: string, updates: TransferMessageUpdates) => {
        let matched = false;
        set((state) => {
            const nextChat = state.chatHistory.map((message) => {
                const next = updateTransferMessageContent(message, fileId, updates);
                if (next !== message) matched = true;
                return next;
            });
            const nextGroup = state.groupChatHistory.map((message) => {
                const next = updateTransferMessageContent(message, fileId, updates);
                if (next !== message) matched = true;
                return next;
            });
            return { chatHistory: nextChat, groupChatHistory: nextGroup };
        });

        // Si un 'completed' no encontró el adjunto en el historial activo, el mensaje pudo
        // haberse procesado del vault en un chat no abierto (no está en el store). Recargamos
        // el historial desde la DB para que el adjunto aparezca al estar en el chat correcto.
        if (updates.transferState === 'completed' && !matched) {
            get().reloadLatestHistory?.();
        }
    },
});
