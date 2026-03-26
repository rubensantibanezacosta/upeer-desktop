import React from 'react';
import { AddContactModal } from '../ui/AddContactModal.js';
import { ShareContactModal } from '../ui/ShareContactModal.js';
import { InviteGroupMembersModal } from '../ui/InviteGroupMembersModal.js';
import { CreateGroupModal } from '../ui/CreateGroupModal.js';
import { ForwardModal } from '../../features/chat/message/ForwardModal.js';
import { MediaViewerOverlay } from '../../features/chat/media-viewer/MediaViewerOverlay.js';
import { YggstackSplash } from '../ui/YggstackSplash.js';

interface MainLayoutOverlaysProps {
    navigation: any;
    chatStore: any;
    appStore: any;
    targetUpeerId: string;
    activeGroupId: string;
    activeGroup: any;
    isInviteGroupMembersOpen: boolean;
    setIsInviteGroupMembersOpen: (open: boolean) => void;
    forwardingMsg: any;
    setForwardingMsg: (message: any) => void;
    handleForward: (targets: { id: string; isGroup: boolean }[]) => Promise<void>;
    handleReaction: (id: string, emoji: string, isGroup: boolean) => void;
    handleScrollToMessage: (id: string) => void;
    setReplyToMessage: (id: string, msg: any) => void;
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
                onDownload={async (item: any) => {
                    const result = await window.upeer.showSaveDialog({ defaultPath: item.fileName });
                    if (!result.canceled && result.filePath) {
                        await window.upeer.saveTransferredFile(item.fileId, result.filePath);
                    }
                }}
                onReply={(item: any) => {
                    const currentHistory = activeGroupId ? chatStore.groupChatHistory : chatStore.chatHistory;
                    const message = currentHistory.find((entry: any) => entry.id === item.messageId);
                    if (message) {
                        setReplyToMessage(activeGroupId || targetUpeerId, message);
                    }
                    navigation.closeMediaViewer();
                }}
                onReact={(item: any, emoji: string) => { if (item.messageId) handleReaction(item.messageId, emoji, false); }}
                onForward={() => undefined}
                onGoToMessage={(item: any) => {
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