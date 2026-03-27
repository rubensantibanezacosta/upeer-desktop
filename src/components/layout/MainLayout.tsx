import React, { useEffect, useState } from 'react';
import { Box } from '@mui/joy';
import { AttachmentType } from '../../features/chat/input/AttachmentButton.js';
import type { LinkPreview } from '../../types/chat.js';
import type { ChatMessage, Contact, Group, PendingFile } from '../../types/chat.js';
import { AppLock } from '../ui/AppLock.js';
import { LoginScreen } from '../ui/LoginScreen.js';
import { forwardMessageToTargets, type ForwardTarget } from '../../features/chat/message/forwardMessage.js';
import type { FileTransferController } from '../../hooks/useFileTransfer.js';
import type { AppStore } from '../../store/useAppStore.js';
import type { ChatStore } from '../../store/chatStoreTypes.js';
import type { NavigationStore } from '../../store/useNavigationStore.js';
import { MainLayoutContent } from './MainLayoutContent.js';
import { LayoutLoader } from './mainLayoutHelpers.js';
import { MainLayoutOverlays } from './MainLayoutOverlays.js';

export interface PreviewableMedia {
    url: string;
    name: string;
    mimeType: string;
    fileId: string;
}

export interface MainLayoutProps {
    isAppLocked: boolean | null;
    setIsAppLocked: React.Dispatch<React.SetStateAction<boolean | null>>;
    isAuthenticated: boolean | null;
    setAuthenticated: AppStore['setAuthenticated'];
    isDragging: boolean;
    handleDragOver: (e: React.DragEvent) => void;
    handleDragLeave: (e: React.DragEvent) => void;
    handleDrop: (e: React.DragEvent) => void;
    activeContact?: Contact;
    activeGroup?: Group;
    isIncomingRequest: boolean;
    targetUpeerId: string;
    activeGroupId: string;
    message: string;
    setMessage: (val: string) => void;
    handleSend: (linkPreview?: LinkPreview | null) => void | Promise<void>;
    handleSendGroupMessage: (linkPreview?: LinkPreview | null) => void | Promise<void>;
    handleAttachFile: (type: AttachmentType) => void | Promise<void>;
    handleTyping: () => void;
    handleScrollToMessage: (id: string) => void;
    currentReplyToMessage: ChatMessage | null;
    setReplyToMessage: (id: string, msg: ChatMessage | null) => void;
    handleAcceptContact: () => void;
    handleDeleteContact: (id: string) => void;
    handleToggleFavorite: (id: string) => Promise<void>;
    handleClearChat: (id: string) => void;
    handleBlockContact: () => void;
    handleReaction: (id: string, emoji: string, remove: boolean) => void;
    handleUpdateMessage: (id: string, msg: string, linkPreview?: LinkPreview | null) => void;
    handleDeleteMessage: (id: string) => void;
    handleMediaClick: (media: PreviewableMedia) => void;
    navigation: NavigationStore;
    appStore: AppStore;
    chatStore: ChatStore;
    isFilePickerOpen: boolean;
    isPreparingAttachments: boolean;
    setFilePickerOpen: (open: boolean) => void;
    pendingFiles: PendingFile[];
    setPendingFiles: (files: PendingFile[]) => void;
    handleFileSubmit: (files: PendingFile[], thumbnails?: (string | undefined)[], captions?: string[]) => void | Promise<void>;
    handleSendVoiceNote: (file: File) => Promise<void>;
    fileTransfer: FileTransferController;
    editingMessage: ChatMessage | null;
    setEditingMessage: React.Dispatch<React.SetStateAction<ChatMessage | null>>;
}

export const MainLayout: React.FC<MainLayoutProps> = ({
    isAppLocked, setIsAppLocked, isAuthenticated, setAuthenticated,
    isDragging, handleDragOver, handleDragLeave, handleDrop,
    activeContact, activeGroup, isIncomingRequest,
    targetUpeerId, activeGroupId, message, setMessage,
    handleSend, handleSendGroupMessage, handleAttachFile, handleTyping, handleScrollToMessage,
    currentReplyToMessage, setReplyToMessage,
    handleAcceptContact, handleDeleteContact, handleToggleFavorite, handleClearChat, handleBlockContact,
    handleReaction, handleUpdateMessage, handleDeleteMessage, handleMediaClick,
    navigation, appStore, chatStore,
    isFilePickerOpen, isPreparingAttachments, setFilePickerOpen, pendingFiles, setPendingFiles, handleFileSubmit, handleSendVoiceNote,
    fileTransfer, editingMessage, setEditingMessage
}) => {
    const [forwardingMsg, setForwardingMsg] = useState<ChatMessage | null>(null);
    const [isContactInfoOpen, setIsContactInfoOpen] = useState(false);
    const [isInviteGroupMembersOpen, setIsInviteGroupMembersOpen] = useState(false);

    useEffect(() => {
        if (activeGroupId || !targetUpeerId) {
            setIsContactInfoOpen(false);
        }
    }, [activeGroupId, targetUpeerId]);

    useEffect(() => {
        if (!activeGroupId) {
            setIsInviteGroupMembersOpen(false);
        }
    }, [activeGroupId]);

    if (isAppLocked === null) {
        return <LayoutLoader />;
    }

    if (isAppLocked) {
        return (
            <AppLock
                onUnlock={() => setIsAppLocked(false)}
                onTooManyAttempts={() => {
                    setIsAppLocked(false);
                    setAuthenticated(false);
                    navigation.goToChat();
                }}
            />
        );
    }

    if (isAuthenticated === null) {
        return <LayoutLoader />;
    }

    if (isAuthenticated === false) {
        return <LoginScreen onUnlocked={() => { setAuthenticated(true); chatStore.refreshData(); chatStore.refreshGroups(); }} />;
    }

    const handleForward = async (targets: ForwardTarget[]) => {
        if (!forwardingMsg) return;
        await forwardMessageToTargets(forwardingMsg.message, targets);
        chatStore.refreshContacts();
        chatStore.refreshGroups();
    };

    return (
        <Box sx={{ display: 'flex', height: '100vh', bgcolor: 'background.body', overflow: 'hidden' }}>
            <MainLayoutContent
                navigation={navigation}
                appStore={appStore}
                chatStore={chatStore}
                isDragging={isDragging}
                handleDragOver={handleDragOver}
                handleDragLeave={handleDragLeave}
                handleDrop={handleDrop}
                activeContact={activeContact}
                activeGroup={activeGroup}
                isIncomingRequest={isIncomingRequest}
                targetUpeerId={targetUpeerId}
                activeGroupId={activeGroupId}
                message={message}
                setMessage={setMessage}
                handleSend={handleSend}
                handleSendGroupMessage={handleSendGroupMessage}
                handleAttachFile={handleAttachFile}
                handleTyping={handleTyping}
                handleScrollToMessage={handleScrollToMessage}
                currentReplyToMessage={currentReplyToMessage}
                setReplyToMessage={setReplyToMessage}
                handleAcceptContact={handleAcceptContact}
                handleDeleteContact={handleDeleteContact}
                handleToggleFavorite={handleToggleFavorite}
                handleClearChat={handleClearChat}
                handleBlockContact={handleBlockContact}
                handleReaction={handleReaction}
                handleUpdateMessage={handleUpdateMessage}
                handleDeleteMessage={handleDeleteMessage}
                handleMediaClick={handleMediaClick}
                setForwardingMsg={setForwardingMsg}
                onLockSession={() => { setAuthenticated(false); navigation.goToChat(); }}
                isFilePickerOpen={isFilePickerOpen}
                isPreparingAttachments={isPreparingAttachments}
                setFilePickerOpen={setFilePickerOpen}
                pendingFiles={pendingFiles}
                setPendingFiles={setPendingFiles}
                handleFileSubmit={handleFileSubmit}
                handleSendVoiceNote={handleSendVoiceNote}
                fileTransfer={fileTransfer}
                editingMessage={editingMessage}
                setEditingMessage={setEditingMessage}
                setIsContactInfoOpen={setIsContactInfoOpen}
                isContactInfoOpen={isContactInfoOpen}
                setIsInviteGroupMembersOpen={setIsInviteGroupMembersOpen}
            />
            <MainLayoutOverlays
                navigation={navigation}
                chatStore={chatStore}
                appStore={appStore}
                targetUpeerId={targetUpeerId}
                activeGroupId={activeGroupId}
                activeGroup={activeGroup}
                isInviteGroupMembersOpen={isInviteGroupMembersOpen}
                setIsInviteGroupMembersOpen={setIsInviteGroupMembersOpen}
                forwardingMsg={forwardingMsg}
                setForwardingMsg={setForwardingMsg}
                handleForward={handleForward}
                handleReaction={handleReaction}
                handleScrollToMessage={handleScrollToMessage}
                setReplyToMessage={setReplyToMessage}
            />
        </Box>
    );
};

