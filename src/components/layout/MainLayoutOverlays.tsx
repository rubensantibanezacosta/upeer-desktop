import React from 'react';
import { AddContactModal } from '../ui/AddContactModal.js';
import { ShareContactModal } from '../ui/ShareContactModal.js';
import { InviteGroupMembersModal } from '../ui/InviteGroupMembersModal.js';
import { CreateGroupModal } from '../ui/CreateGroupModal.js';
import { ForwardModal } from '../../features/chat/message/ForwardModal.js';
import { MediaViewerOverlay } from '../../features/chat/media-viewer/MediaViewerOverlay.js';
import { YggstackSplash } from '../ui/YggstackSplash.js';
import type { MediaItem, ChatMessage } from '../../types/chat.js';
import type { ForwardTarget } from '../../features/chat/message/forwardMessage.js';
import type { MainLayoutProps } from './MainLayout.js';

interface MainLayoutOverlaysProps {
    navigation: MainLayoutProps['navigation'];
    chatStore: MainLayoutProps['chatStore'];
    appStore: MainLayoutProps['appStore'];
    targetUpeerId: string;
    activeGroupId: string;
    activeGroup: MainLayoutProps['activeGroup'];
    isInviteGroupMembersOpen: boolean;
    setIsInviteGroupMembersOpen: (open: boolean) => void;
    forwardingMsg: ChatMessage | null;
    setForwardingMsg: React.Dispatch<React.SetStateAction<ChatMessage | null>>;
    handleForward: (targets: ForwardTarget[]) => Promise<void>;
    handleReaction: (id: string, emoji: string, remove: boolean) => void;
    handleScrollToMessage: (id: string) => void;
    setReplyToMessage: (id: string, msg: ChatMessage | null) => void;
}

export const MainLayoutOverlays: React.FC<MainLayoutOverlaysProps> = ({
    navigation,
    chatStore,
    appStore,
    targetUpeerId,
    activeGroupId,
    activeGroup,
    isInviteGroupMembersOpen,
    setIsInviteGroupMembersOpen,
    forwardingMsg,
    setForwardingMsg,
    handleForward,
    handleReaction,
    handleScrollToMessage,
    setReplyToMessage,
}) => (
    <>
        <AddContactModal open={navigation.isAddModalOpen} onClose={() => navigation.setAddModalOpen(false)} onAdd={chatStore.handleAddContact} />
        <ShareContactModal open={navigation.isShareModalOpen} onClose={() => navigation.setShareModalOpen(false)} contacts={chatStore.contacts} onShare={chatStore.handleShareContact} />
        <InviteGroupMembersModal open={isInviteGroupMembersOpen} onClose={() => setIsInviteGroupMembersOpen(false)} contacts={chatStore.contacts} group={activeGroup || null} onInvite={chatStore.handleInviteGroupMembers} />
        <CreateGroupModal open={navigation.isCreateGroupModalOpen} onClose={() => navigation.setCreateGroupModalOpen(false)} contacts={chatStore.contacts} onCreate={chatStore.handleCreateGroup} />
        <ForwardModal open={!!forwardingMsg} onClose={() => setForwardingMsg(null)} contacts={chatStore.contacts} groups={chatStore.groups} onSend={handleForward} />
        {navigation.viewerMediaList.length > 0 && (
            <MediaViewerOverlay
                items={navigation.viewerMediaList}
                initialIndex={navigation.viewerInitialIndex}
                onClose={() => navigation.closeMediaViewer()}
                onDownload={async (item: MediaItem) => {
                    const result = await window.upeer.showSaveDialog({ defaultPath: item.fileName });
                    if (!result.canceled && result.filePath) {
                        await window.upeer.saveTransferredFile(item.fileId, result.filePath);
                    }
                }}
                onReply={(item: MediaItem) => {
                    const currentHistory = activeGroupId ? chatStore.groupChatHistory : chatStore.chatHistory;
                    const message = currentHistory.find((entry) => entry.id === item.messageId);
                    if (message) {
                        setReplyToMessage(activeGroupId || targetUpeerId, message);
                    }
                    navigation.closeMediaViewer();
                }}
                onReact={(item: MediaItem, emoji: string) => { if (item.messageId) handleReaction(item.messageId, emoji, false); }}
                onForward={() => undefined}
                onGoToMessage={(item: MediaItem) => {
                    if (item.messageId) {
                        navigation.closeMediaViewer();
                        setTimeout(() => handleScrollToMessage(item.messageId), 200);
                    }
                }}
            />
        )}
        {appStore.networkStatus !== 'up' && appStore.isFirstConnect && (
            <YggstackSplash networkStatus={appStore.networkStatus} isFirstConnect={appStore.isFirstConnect} address={appStore.yggAddress} />
        )}
    </>
);