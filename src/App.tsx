import React, { useState, useEffect } from 'react';
import { CssVarsProvider } from '@mui/joy';
import { useNavigationStore } from './store/useNavigationStore.js';
import { useAppStore } from './store/useAppStore.js';
import { useChatStore } from './store/useChatStore.js';
import { useFileTransfer } from './hooks/useFileTransfer.js';
import { useFilePersistence } from './hooks/useFilePersistence.js';
import type { YggNetworkStatus } from './components/ui/YggstackSplash.js';
import { parseMessage } from './features/chat/message/messageItemSupport.js';
import { MainLayout } from './components/layout/MainLayout.js';
import { StartupRecoveryOverlay, VaultRecoverySnackbar } from './components/layout/mainLayoutHelpers.js';
import type { PreviewableMedia } from './components/layout/MainLayout.js';
import type { ChatMessage, LinkPreview, MediaItem } from './types/chat.js';
import { isPreviewableFile } from './utils/fileUtils.js';

const YGGSTACK_STATUSES: YggNetworkStatus[] = ['connecting', 'up', 'down', 'reconnecting'];

const isYggNetworkStatus = (status: string): status is YggNetworkStatus => YGGSTACK_STATUSES.includes(status as YggNetworkStatus);

export function shouldReloadHistoryForIncomingTransfer(
    transfer: { direction?: 'sending' | 'receiving'; upeerId?: string; chatUpeerId?: string },
    activeGroupId: string,
    targetUpeerId: string,
) {
    if (transfer.direction !== 'receiving') {
        return false;
    }

    const isActiveGroupTransfer = !!transfer.chatUpeerId && transfer.chatUpeerId === activeGroupId;
    const isActiveDirectTransfer = !!targetUpeerId
        && transfer.chatUpeerId === targetUpeerId
        && !transfer.chatUpeerId.startsWith('grp-');

    return isActiveGroupTransfer || isActiveDirectTransfer;
}

export default function App() {
    const navigation = useNavigationStore();
    const appStore = useAppStore();
    const chatStore = useChatStore();
    const [editingMessage, setEditingMessage] = useState<ChatMessage | null>(null);
    const [isAppLocked, setIsAppLocked] = useState<boolean | null>(null);
    const [isStartupRecoveryOpen, setIsStartupRecoveryOpen] = useState(false);
    const [startupRecoveryMessage, setStartupRecoveryMessage] = useState('Recuperando conversaciones…');
    const [isVaultRecoverySnackbarOpen, setIsVaultRecoverySnackbarOpen] = useState(false);
    const [vaultRecoveryMessage, setVaultRecoveryMessage] = useState('Recuperando mensajes vaulted…');
    const { checkAuth, setYggAddress, setNetworkStatus, setFirstConnect } = appStore;
    const {
        activeGroupId,
        initListeners,
        refreshData,
        refreshContacts,
        refreshGroups,
        reloadLatestHistory,
        targetUpeerId,
    } = chatStore;

    const handleIncomingTransferStarted = React.useCallback((transfer: { direction?: 'sending' | 'receiving'; upeerId?: string; chatUpeerId?: string }) => {
        if (!shouldReloadHistoryForIncomingTransfer(transfer, activeGroupId, targetUpeerId)) {
            return;
        }

        void reloadLatestHistory();
    }, [activeGroupId, reloadLatestHistory, targetUpeerId]);

    const fileTransfer = useFileTransfer(chatStore.updateFileTransferMessage, handleIncomingTransferStarted);

    const {
        handleAttachFile, handleFileSubmit, handleDrop, handleDragOver, handleDragLeave, handleSendVoiceNote
    } = useFilePersistence(fileTransfer);

    const hydrateInitialShell = React.useCallback(async () => {
        const startedAt = Date.now();
        setStartupRecoveryMessage('Recuperando conversaciones…');
        setIsStartupRecoveryOpen(true);
        try {
            await refreshData();
            setStartupRecoveryMessage('Recuperando contactos y mensajes…');
            await refreshContacts();
            setStartupRecoveryMessage('Sincronizando grupos…');
            await refreshGroups();
        } finally {
            const remainingMs = Math.max(0, 450 - (Date.now() - startedAt));
            if (remainingMs > 0) {
                await new Promise((resolve) => window.setTimeout(resolve, remainingMs));
            }
            setIsStartupRecoveryOpen(false);
        }
    }, [refreshContacts, refreshData, refreshGroups]);

    useEffect(() => {
        initListeners();

        let cancelled = false;
        const bootstrap = async () => {
            const pinEnabled = await window.upeer.isPinEnabled().catch(() => false);
            if (cancelled) {
                return;
            }
            setIsAppLocked((current) => current === false ? false : pinEnabled);

            const authenticated = await checkAuth();
            if (cancelled || !authenticated) {
                return;
            }

            await hydrateInitialShell();
        };

        void bootstrap();

        window.upeer.getMyNetworkAddress().then((addr: string) => {
            if (addr && addr !== 'No detectado') {
                setYggAddress(addr);
                setNetworkStatus('up');
                setFirstConnect(false);
            }
        });
        const unsubscribeAddress = window.upeer.onYggstackAddress(setYggAddress) || (() => undefined);
        const unsubscribeStatus = window.upeer.onYggstackStatus((status: string, _addr?: string) => {
            if (!isYggNetworkStatus(status)) {
                return;
            }
            setNetworkStatus(status);
            if (status === 'up') {
                setFirstConnect(false);
                if (_addr) setYggAddress(_addr);
            }
        }) || (() => undefined);
        const unsubscribeVaultRecovery = window.upeer.onVaultRecoveryStatus((payload) => {
            if (payload.startupActive) {
                setVaultRecoveryMessage(payload.message);
                setIsVaultRecoverySnackbarOpen(true);
                return;
            }

            setIsVaultRecoverySnackbarOpen(false);
        }) || (() => undefined);

        return () => {
            cancelled = true;
            unsubscribeAddress();
            unsubscribeStatus();
            unsubscribeVaultRecovery();
        };
    }, [checkAuth, hydrateInitialShell, initListeners, setFirstConnect, setNetworkStatus, setYggAddress]);

    const handleMediaClick = (media: PreviewableMedia) => {
        const history = chatStore.activeGroupId ? chatStore.groupChatHistory : chatStore.chatHistory;
        const transfers = fileTransfer.allTransfers.filter(t => chatStore.activeGroupId ? t.chatUpeerId === chatStore.activeGroupId : t.upeerId === chatStore.targetUpeerId);
        const activeContact = chatStore.contacts.find(c => c.upeerId === chatStore.targetUpeerId);
        const activeContactAvatar = activeContact?.avatar || chatStore.incomingRequests[chatStore.targetUpeerId]?.avatar;
        const allMedia = history.reduce<MediaItem[]>((items, msg) => {
            const { fileData } = parseMessage(msg.message, msg.isMine, transfers);
            if (!fileData || fileData.isVoiceNote || !isPreviewableFile(fileData.mimeType, fileData.fileName)) {
                return items;
            }

            const url = fileData.savedPath || '';
            if (!url) {
                return items;
            }

            const senderName = msg.isMine
                ? 'Tú'
                : (chatStore.activeGroupId
                    ? (chatStore.contacts.find(c => c.upeerId === msg.senderUpeerId)?.name || msg.senderName)
                    : activeContact?.name);
            const senderAvatar = (msg.isMine
                ? chatStore.myIdentity?.avatar
                : (chatStore.activeGroupId
                    ? chatStore.contacts.find(c => c.upeerId === msg.senderUpeerId)?.avatar
                    : activeContactAvatar)) ?? undefined;

            items.push({
                url,
                fileName: fileData.fileName,
                mimeType: fileData.mimeType,
                fileId: fileData.fileId,
                messageId: msg.id,
                thumbnail: fileData.thumbnail,
                senderName,
                senderAvatar,
                timestamp: msg.timestamp,
            });
            return items;
        }, []);

        const initialIndex = allMedia.findIndex(m => m.fileId === media.fileId);
        if (initialIndex !== -1) {
            navigation.openMediaViewer(allMedia, initialIndex);
        } else if (allMedia.length > 0) {
            const clickedMedia: MediaItem = { url: media.url, fileName: media.name, mimeType: media.mimeType, fileId: media.fileId, senderName: 'Tú', senderAvatar: chatStore.myIdentity?.avatar ?? undefined };
            navigation.openMediaViewer([clickedMedia, ...allMedia], 0);
        } else {
            navigation.openMediaViewer([{ url: media.url, fileName: media.name, mimeType: media.mimeType, fileId: media.fileId, senderName: 'Tú', senderAvatar: chatStore.myIdentity?.avatar ?? undefined }], 0);
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
    const activeContact = chatStore.contacts.find((contact) => contact.upeerId === chatStore.targetUpeerId);
    const activeGroup = chatStore.groups.find((group) => group.groupId === chatStore.activeGroupId);

    return (
        <CssVarsProvider defaultMode="dark">
            <div data-testid="app-shell">
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
                    handleSend={(linkPreview?: LinkPreview | null) => chatStore.handleSend(linkPreview)}
                    handleSendGroupMessage={(linkPreview?: LinkPreview | null) => chatStore.handleSendGroupMessage(message, linkPreview)}
                    handleAttachFile={handleAttachFile}
                    handleTyping={handleTyping}
                    handleScrollToMessage={handleScrollToMessage}
                    currentReplyToMessage={chatStore.activeGroupId ? (chatStore.replyByConversation[chatStore.activeGroupId] || null) : (chatStore.replyByConversation[chatStore.targetUpeerId] || null)}
                    setReplyToMessage={chatStore.setReplyToMessage}
                    handleAcceptContact={chatStore.handleAcceptContact}
                    handleDeleteContact={chatStore.handleDeleteContact}
                    handleToggleFavorite={chatStore.handleToggleFavorite}
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
                    handleSendVoiceNote={handleSendVoiceNote}
                    fileTransfer={fileTransfer}
                    isPreparingAttachments={navigation.isPreparingAttachments}
                    editingMessage={editingMessage}
                    setEditingMessage={setEditingMessage}
                />
                <StartupRecoveryOverlay open={!isAppLocked && appStore.isAuthenticated === true && isStartupRecoveryOpen} message={startupRecoveryMessage} />
                <VaultRecoverySnackbar open={!isAppLocked && appStore.isAuthenticated === true && isVaultRecoverySnackbarOpen} message={vaultRecoveryMessage} />
            </div>
        </CssVarsProvider>
    );
}

