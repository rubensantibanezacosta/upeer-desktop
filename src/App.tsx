import React, { useState, useEffect } from 'react';
import { CssVarsProvider } from '@mui/joy';
import { useNavigationStore } from './store/useNavigationStore.js';
import { useAppStore } from './store/useAppStore.js';
import { useChatStore } from './store/useChatStore.js';
import { useFileTransfer } from './hooks/useFileTransfer.js';
import { useFilePersistence } from './hooks/useFilePersistence.js';
import { parseMessage } from './features/chat/message/MessageItem.js';
import { MainLayout } from './components/layout/MainLayout.js';

export default function App() {
    const navigation = useNavigationStore();
    const appStore = useAppStore();
    const chatStore = useChatStore();
    const [editingMessage, setEditingMessage] = useState<any>(null);
    const [isAppLocked, setIsAppLocked] = useState<boolean | null>(null);

    const fileTransfer = useFileTransfer(chatStore.updateFileTransferMessage);

    const { 
        handleAttachFile, handleFileSubmit, handleDrop, handleDragOver, handleDragLeave 
    } = useFilePersistence(fileTransfer);

    useEffect(() => {
        window.upeer.isPinEnabled().then((enabled: boolean) => setIsAppLocked(enabled));
        appStore.checkAuth();
        chatStore.initListeners();
        chatStore.refreshData();
        chatStore.refreshGroups();

        window.upeer.getMyNetworkAddress().then((addr: string) => {
            if (addr && addr !== 'No detectado') {
                appStore.setYggAddress(addr);
                appStore.setNetworkStatus('up');
                appStore.setFirstConnect(false);
            }
        });
        window.upeer.onYggstackAddress(appStore.setYggAddress);
        window.upeer.onYggstackStatus((status: string, _addr?: string) => {
            appStore.setNetworkStatus(status as any);
            if (status === 'up') {
                appStore.setFirstConnect(false);
                if (_addr) appStore.setYggAddress(_addr);
            }
        });
    }, []);

    const handleMediaClick = (media: any) => {
        const history = chatStore.activeGroupId ? chatStore.groupChatHistory : chatStore.chatHistory;
        const transfers = chatStore.activeGroupId ? [] : fileTransfer.allTransfers.filter(t => t.upeerId === chatStore.targetUpeerId);
        const isMediaFile = (f: any) => {
            if (!f) return false;
            const mime = f.mimeType?.toLowerCase() || '';
            const ext = f.fileName?.split('.').pop()?.toLowerCase() || '';
            const isImage = mime.startsWith('image/') || ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'].includes(ext);
            const isVideo = mime.startsWith('video/') || ['mp4', 'webm', 'mkv', 'avi', 'mov', 'wmv', 'flv', 'm4v', '3gp', 'ts', 'mts', 'ogg'].includes(ext);
            return isImage || isVideo;
        };
        const allMedia = history.map(msg => {
            const { fileData } = parseMessage(msg.message, msg.isMine, transfers);
            if (!fileData) return null;
            const activeContact = chatStore.contacts.find(c => c.upeerId === chatStore.targetUpeerId);
            const activeContactAvatar = activeContact?.avatar || chatStore.incomingRequests[chatStore.targetUpeerId]?.avatar;
            const senderName = msg.isMine ? 'Tú' : (chatStore.activeGroupId ? (chatStore.contacts.find(c => c.upeerId === msg.senderUpeerId)?.name || msg.senderName) : activeContact?.name);
            const senderAvatar = msg.isMine ? chatStore.myIdentity?.avatar : (chatStore.activeGroupId ? chatStore.contacts.find(c => c.upeerId === msg.senderUpeerId)?.avatar : activeContactAvatar);
            return { ...fileData, messageId: msg.id, senderName, senderAvatar, timestamp: msg.timestamp };
        }).filter(isMediaFile)
            .map(f => ({ url: f.savedPath || f.filePath || '', fileName: f.fileName, mimeType: f.mimeType, fileId: f.fileId, messageId: f.messageId, thumbnail: f.thumbnail, senderName: f.senderName, senderAvatar: f.senderAvatar, timestamp: f.timestamp }));

        const initialIndex = allMedia.findIndex(m => m.fileId === media.fileId);
        if (initialIndex !== -1) {
            navigation.openMediaViewer(allMedia, initialIndex);
        } else if (allMedia.length > 0) {
            const clickedMedia = { url: media.url, fileName: media.name, mimeType: media.mimeType, fileId: media.fileId, senderName: 'Tú', senderAvatar: chatStore.myIdentity?.avatar || undefined };
            navigation.openMediaViewer([clickedMedia, ...allMedia], 0);
        } else {
            navigation.openMediaViewer([{ url: media.url, fileName: media.name, mimeType: media.mimeType, fileId: media.fileId, senderName: 'Tú', senderAvatar: chatStore.myIdentity?.avatar || undefined }], 0);
        }
    };

    const handleTyping = () => { if (chatStore.targetUpeerId) window.upeer.sendTypingIndicator(chatStore.targetUpeerId); };

    const handleScrollToMessage = (msgId: string) => {
        const element = document.getElementById(`msg-${msgId}`);
        if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
            const bubble = element.querySelector('.MuiSheet-root') as HTMLElement;
            if (bubble) {
                const originalOutline = bubble.style.outline;
                bubble.style.outline = '2px solid var(--joy-palette-primary-500)';
                bubble.style.outlineOffset = '2px';
                setTimeout(() => { bubble.style.outline = originalOutline; }, 1500);
            }
        }
    };

    const message = chatStore.activeGroupId ? (chatStore.messagesByConversation[chatStore.activeGroupId] || '') : (chatStore.messagesByConversation[chatStore.targetUpeerId] || '');
    const activeContact = chatStore.contacts.find((c: any) => c.upeerId === chatStore.targetUpeerId);
    const activeGroup = chatStore.groups.find((g: any) => g.groupId === chatStore.activeGroupId);

    return (
        <CssVarsProvider defaultMode="dark">
            <MainLayout 
                isAppLocked={isAppLocked}
                setIsAppLocked={setIsAppLocked}
                isAuthenticated={appStore.isAuthenticated}
                setAuthenticated={appStore.setAuthenticated}
                isDragging={chatStore.isDragging}
                handleDragOver={handleDragOver}
                handleDragLeave={handleDragLeave}
                handleDrop={handleDrop}
                activeContact={activeContact}
                activeGroup={activeGroup}
                isIncomingRequest={activeContact?.status === 'incoming'}
                targetUpeerId={chatStore.targetUpeerId}
                activeGroupId={chatStore.activeGroupId}
                message={message}
                setMessage={(val: string) => chatStore.setMessage(chatStore.activeGroupId || chatStore.targetUpeerId, val)}
                handleSend={chatStore.handleSend}
                handleSendGroupMessage={() => chatStore.handleSendGroupMessage(message)}
                handleAttachFile={handleAttachFile}
                handleTyping={handleTyping}
                handleScrollToMessage={handleScrollToMessage}
                currentReplyToMessage={chatStore.activeGroupId ? (chatStore.replyByConversation[chatStore.activeGroupId] || null) : (chatStore.replyByConversation[chatStore.targetUpeerId] || null)}
                setReplyToMessage={chatStore.setReplyToMessage}
                handleAcceptContact={chatStore.handleAcceptContact}
                handleDeleteContact={chatStore.handleDeleteContact}
                handleClearChat={chatStore.handleClearChat}
                handleBlockContact={chatStore.handleBlockContact}
                handleReaction={chatStore.handleReaction}
                handleUpdateMessage={chatStore.handleUpdateMessage}
                handleDeleteMessage={chatStore.handleDeleteMessage}
                handleMediaClick={handleMediaClick}
                navigation={navigation}
                appStore={appStore}
                chatStore={chatStore}
                isFilePickerOpen={navigation.isFilePickerOpen}
                setFilePickerOpen={navigation.setFilePickerOpen}
                pendingFiles={chatStore.pendingFiles}
                setPendingFiles={chatStore.setPendingFiles}
                handleFileSubmit={handleFileSubmit}
                fileTransfer={fileTransfer}
                editingMessage={editingMessage}
                setEditingMessage={setEditingMessage}
            />
        </CssVarsProvider>
    );
}

