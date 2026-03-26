import React, { useEffect, useState } from 'react';
import { Box } from '@mui/joy';
import type { LinkPreview } from '../../types/chat.js';
import { AppLock } from '../ui/AppLock.js';
import { LoginScreen } from '../ui/LoginScreen.js';
import { forwardMessageToTargets } from '../../features/chat/message/forwardMessage.js';
import { MainLayoutContent } from './MainLayoutContent.js';
import { LayoutLoader } from './mainLayoutHelpers.js';
import { MainLayoutOverlays } from './MainLayoutOverlays.js';

interface MainLayoutProps {
    isAppLocked: boolean | null;
    setIsAppLocked: (locked: boolean) => void;
    isAuthenticated: boolean | null;
    setAuthenticated: (auth: boolean) => void;
    isDragging: boolean;
    handleDragOver: (e: React.DragEvent) => void;
    handleDragLeave: (e: React.DragEvent) => void;
    handleDrop: (e: React.DragEvent) => void;
    activeContact: any;
    activeGroup: any;
    isIncomingRequest: boolean;
    targetUpeerId: string;
    activeGroupId: string;
    message: string;
    setMessage: (val: string) => void;
    handleSend: (linkPreview?: LinkPreview | null) => void;
    handleSendGroupMessage: (linkPreview?: LinkPreview | null) => void;
    handleAttachFile: (type: any) => void;
    handleTyping: () => void;
    handleScrollToMessage: (id: string) => void;
    currentReplyToMessage: any;
    setReplyToMessage: (id: string, msg: any) => void;
    handleAcceptContact: (id: string) => void;
    handleDeleteContact: (id: string) => void;
    handleToggleFavorite: (id: string) => Promise<void>;
    handleClearChat: (id: string) => void;
    handleBlockContact: () => void;
    handleReaction: (id: string, emoji: string, isGroup: boolean) => void;
    handleUpdateMessage: (id: string, msg: string, linkPreview?: LinkPreview | null) => void;
    handleDeleteMessage: (id: string) => void;
    handleMediaClick: (media: any) => void;
    navigation: any;
    appStore: any;
    chatStore: any;
    isFilePickerOpen: boolean;
    isPreparingAttachments: boolean;
    setFilePickerOpen: (open: boolean) => void;
    pendingFiles: any[];
    setPendingFiles: (files: any[]) => void;
    handleFileSubmit: (files: any[], thumbnails?: any[], captions?: any[]) => void;
    handleSendVoiceNote: (file: File) => Promise<void>;
    fileTransfer: any;
    editingMessage: any;
    setEditingMessage: (msg: any) => void;
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
    const [forwardingMsg, setForwardingMsg] = useState<any>(null);
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

    if (isAppLocked) return <AppLock onUnlock={() => setIsAppLocked(false)} />;

    if (isAuthenticated === null) {
        return <LayoutLoader />;
    }

    if (isAuthenticated === false) {
        return <LoginScreen onUnlocked={() => { setAuthenticated(true); chatStore.refreshData(); chatStore.refreshGroups(); }} />;
    }

    const handleForward = async (targets: { id: string; isGroup: boolean }[]) => {
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

