import React, { useState } from 'react';
import { Box } from '@mui/joy';
import { Sidebar } from './Sidebar.js';
import { ChatArea } from '../../features/chat/ChatArea.js';
import { ChatSearchBar } from '../../features/chat/ChatSearchBar.js';
import { IncomingRequestChat } from '../../features/chat/IncomingRequestChat.js';
import { TopHeader } from './TopHeader.js';
import { InputArea } from '../../features/chat/input/InputArea.js';
import type { LinkPreview } from '../../types/chat.js';
import type { ChatMessage, PendingFile } from '../../types/chat.js';
import type { FileTransfer } from '../../hooks/fileTransferTypes.js';
import { NavigationRail } from './NavigationRail.js';
import { FilePreviewOverlay } from '../../features/chat/file-preview/FilePreviewOverlay.js';
import { useCall } from '../../features/call/useCall.js';
import { useCallStore } from '../../features/call/useCallStore.js';
import { useChatActionsStore } from '../../store/useChatActionsStore.js';
import { useSharedMediaItems } from './contactInfoPanelSupport.js';
import { ContactInfoPanel } from './ContactInfoPanel.js';
import { GroupInfoPanel } from './GroupInfoPanel.js';
import { KeyChangeAlertBanner } from './KeyChangeAlertBanner.js';
import { DragOverlay, WelcomePlaceholder, getEditableMessageText } from './mainLayoutHelpers.js';
import { MainLayoutPanels } from './MainLayoutPanels.js';
import type { MainLayoutProps, PreviewableMedia } from './MainLayout.js';

interface MainLayoutContentProps {
    navigation: MainLayoutProps['navigation'];
    appStore: MainLayoutProps['appStore'];
    chatStore: MainLayoutProps['chatStore'];
    isDragging: boolean;
    handleDragOver: (e: React.DragEvent) => void;
    handleDragLeave: (e: React.DragEvent) => void;
    handleDrop: (e: React.DragEvent) => void;
    activeContact: MainLayoutProps['activeContact'];
    activeGroup: MainLayoutProps['activeGroup'];
    isIncomingRequest: boolean;
    targetUpeerId: string;
    activeGroupId: string;
    message: string;
    setMessage: (val: string) => void;
    handleSend: (linkPreview?: LinkPreview | null) => void | Promise<void>;
    handleSendGroupMessage: (linkPreview?: LinkPreview | null) => void | Promise<void>;
    handleAttachFile: MainLayoutProps['handleAttachFile'];
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
    setForwardingMsg: React.Dispatch<React.SetStateAction<ChatMessage | null>>;
    onLockSession: () => void;
    isFilePickerOpen: boolean;
    isPreparingAttachments: boolean;
    setFilePickerOpen: (open: boolean) => void;
    pendingFiles: PendingFile[];
    setPendingFiles: (files: PendingFile[]) => void;
    handleFileSubmit: (files: PendingFile[], thumbnails?: (string | undefined)[], captions?: string[]) => void | Promise<void>;
    handleSendVoiceNote: (file: File) => Promise<void>;
    fileTransfer: MainLayoutProps['fileTransfer'];
    editingMessage: ChatMessage | null;
    setEditingMessage: React.Dispatch<React.SetStateAction<ChatMessage | null>>;
    setIsContactInfoOpen: React.Dispatch<React.SetStateAction<boolean>>;
    isContactInfoOpen: boolean;
    setIsGroupInfoOpen: React.Dispatch<React.SetStateAction<boolean>>;
    isGroupInfoOpen: boolean;
    setIsInviteGroupMembersOpen: React.Dispatch<React.SetStateAction<boolean>>;
}

export const MainLayoutContent: React.FC<MainLayoutContentProps> = ({
    navigation,
    appStore,
    chatStore,
    isDragging,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    activeContact,
    activeGroup,
    isIncomingRequest,
    targetUpeerId,
    activeGroupId,
    message,
    setMessage,
    handleSend,
    handleSendGroupMessage,
    handleAttachFile,
    handleTyping,
    handleScrollToMessage,
    currentReplyToMessage,
    setReplyToMessage,
    handleAcceptContact,
    handleDeleteContact,
    handleToggleFavorite,
    handleClearChat,
    handleBlockContact,
    handleReaction,
    handleUpdateMessage,
    handleDeleteMessage,
    handleMediaClick,
    setForwardingMsg,
    onLockSession,
    isFilePickerOpen,
    isPreparingAttachments,
    setFilePickerOpen,
    pendingFiles,
    setPendingFiles,
    handleFileSubmit,
    handleSendVoiceNote,
    fileTransfer,
    editingMessage,
    setEditingMessage,
    setIsContactInfoOpen,
    isContactInfoOpen,
    setIsGroupInfoOpen,
    isGroupInfoOpen,
    setIsInviteGroupMembersOpen,
}) => {
    const { startCall } = useCall(chatStore.myIdentity?.upeerId);
    const activeCallKind = useCallStore((state) => Object.values(state.calls).find((call) => call.phase !== 'ended')?.kind);
    const callsUnavailable = useCallStore((state) => state.isStartingCall || Object.keys(state.calls).length > 0);
    const contactPrefs = useChatActionsStore((state) => state.contactPrefs);
    const groupPrefs = useChatActionsStore((state) => state.groupPrefs);
    const groupMedia = useSharedMediaItems(
        chatStore.groupChatHistory,
        fileTransfer.allTransfers.filter((transfer: FileTransfer) => transfer.chatUpeerId === activeGroupId),
    );
    const unreadChatCount = chatStore.contacts.filter((contact) =>
        contact.status !== 'blocked' && (
            contactPrefs[contact.upeerId]?.unread ||
            (!contact.lastMessageIsMine && !!contact.lastMessage && contact.lastMessageStatus !== 'read')
        )
    ).length + chatStore.groups.filter((group) =>
        groupPrefs[group.groupId]?.unread ||
        (!group.lastMessageIsMine && !!group.lastMessage && group.lastMessageStatus !== 'read')
    ).length;
    const activeContactAvatar = activeContact?.avatar || chatStore.incomingRequests[targetUpeerId]?.avatar;
    const incomingRequest = chatStore.incomingRequests[targetUpeerId];
    const effectiveVouchScore = activeContact?.vouchScore ?? incomingRequest?.vouchScore;
    const untrustworthyInfo = chatStore.untrustworthyAlerts[targetUpeerId] || incomingRequest?.untrustworthy;
    const keyChangeAlert = chatStore.keyChangeAlerts[targetUpeerId];
    const [isChatSearchOpen, setIsChatSearchOpen] = useState(false);

    return (
        <Box sx={{ display: 'flex', flexGrow: 1, minWidth: 0, width: '100%', height: '100vh', bgcolor: 'background.body', overflow: 'hidden' }} onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}>
            <DragOverlay isDragging={isDragging} />
            <NavigationRail
                myIp={chatStore.networkAddress}
                myAvatar={chatStore.myIdentity?.avatar}
                myInitial={(chatStore.myIdentity?.alias || chatStore.myIdentity?.upeerId || '?').charAt(0).toUpperCase()}
                activeView={navigation.appView}
                activeCallKind={activeCallKind}
                unreadChatCount={unreadChatCount}
                onOpenChats={() => navigation.goToChat()}
                onOpenContacts={() => navigation.goToContacts()}
                onOpenCalls={() => navigation.goToCalls()}
                onOpenSettings={() => navigation.toggleSettings()}
                onOpenIdentity={() => navigation.goToSettings('perfil')}
                onOpenDevices={() => navigation.goToSettings('dispositivos')}
            />

            {navigation.appView === 'settings' || navigation.appView === 'contacts' || navigation.appView === 'calls' ? (
                <MainLayoutPanels navigation={navigation} appStore={appStore} chatStore={chatStore} onLockSession={onLockSession} />
            ) : (
                <>
                    <Sidebar
                        contacts={chatStore.contacts}
                        groups={chatStore.groups}
                        onSelectContact={chatStore.setTargetUpeerId}
                        onSelectGroup={chatStore.setActiveGroupId}
                        onToggleFavorite={chatStore.handleToggleFavorite}
                        onToggleFavoriteGroup={chatStore.handleToggleFavoriteGroup}
                        onClearChat={chatStore.handleClearChat}
                        selectedId={chatStore.targetUpeerId}
                        selectedGroupId={chatStore.activeGroupId}
                        onAddContact={chatStore.handleAddContact}
                        onCreateGroup={chatStore.handleCreateGroup}
                        onLeaveGroup={chatStore.handleLeaveGroup}
                        typingStatus={chatStore.typingStatus}
                    />

                    <Box sx={{ flexGrow: 1, display: 'flex', height: '100%', minWidth: 0, backgroundColor: 'background.body', position: 'relative', overflow: 'hidden' }}>
                        {(targetUpeerId || activeGroupId) ? (
                            <>
                                <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', minWidth: 0, height: '100%', position: 'relative', overflow: 'hidden' }}>
                                    {activeGroupId ? (
                                        <TopHeader
                                            contactName={activeGroup?.name}
                                            isGroup={true}
                                            avatar={activeGroup?.avatar || undefined}
                                            memberCount={activeGroup?.members.length}
                                            isAdmin={activeGroup?.adminUpeerId === chatStore.myIdentity?.upeerId}
                                            groupId={activeGroupId}
                                            onUpdateGroup={(fields) => chatStore.handleUpdateGroup(activeGroupId, fields)}
                                            onInviteMembers={() => setIsInviteGroupMembersOpen(true)}
                                            onOpenInfo={() => setIsGroupInfoOpen((value) => !value)}
                                            onDelete={() => chatStore.handleLeaveGroup(activeGroupId)}
                                            onSearch={() => setIsChatSearchOpen(true)}
                                            onCallAudio={() => void startCall(activeGroupId, 'audio', true, activeGroup?.members, activeGroupId)}
                                            onCallVideo={() => void startCall(activeGroupId, 'video', true, activeGroup?.members, activeGroupId)}
                                        />
                                    ) : (
                                        <TopHeader
                                            contactName={activeContact?.name}
                                            avatar={activeContactAvatar}
                                            isOnline={activeContact?.lastActive ? (new Date().getTime() - new Date(activeContact.lastActive).getTime()) < 65000 : undefined}
                                            isTyping={!!chatStore.typingStatus[targetUpeerId]}
                                            status={activeContact?.status}
                                            lastSeen={activeContact?.lastActive ?? activeContact?.lastSeen}
                                            vouchScore={effectiveVouchScore}
                                            isSelfChat={targetUpeerId === chatStore.myIdentity?.upeerId}
                                            onDelete={() => handleClearChat(targetUpeerId)}
                                            onShare={() => navigation.setShareModalOpen(true)}
                                            onAccept={isIncomingRequest ? undefined : handleAcceptContact}
                                            onOpenInfo={() => setIsContactInfoOpen((value) => !value)}
                                            onSearch={() => setIsChatSearchOpen(true)}
                                            onCallAudio={() => void startCall(targetUpeerId, 'audio')}
                                            onCallVideo={() => void startCall(targetUpeerId, 'video')}
                                        />
                                    )}

                                    {isChatSearchOpen && (
                                        <ChatSearchBar
                                            conversationKey={activeGroupId || targetUpeerId}
                                            onClose={() => setIsChatSearchOpen(false)}
                                        />
                                    )}

                                    {isIncomingRequest ? (
                                        <IncomingRequestChat
                                            contactName={activeContact?.name}
                                            avatar={activeContactAvatar}
                                            receivedAt={incomingRequest?.receivedAt}
                                            onAccept={handleAcceptContact}
                                            onReject={handleBlockContact}
                                            untrustworthyInfo={untrustworthyInfo}
                                            vouchScore={effectiveVouchScore}
                                        />
                                    ) : (
                                        <Box onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop} sx={{ display: 'flex', flexDirection: 'column', flexGrow: 1, position: 'relative', overflow: 'hidden' }}>
                                            {keyChangeAlert && <KeyChangeAlertBanner alert={keyChangeAlert} onDismiss={() => chatStore.clearKeyChangeAlert(targetUpeerId)} />}
                                            <Box sx={{ flexGrow: 1, position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column', width: '100%', minWidth: 0 }}>
                                                <ChatArea
                                                    key={activeGroupId || targetUpeerId}
                                                    chatHistory={activeGroupId ? chatStore.groupChatHistory : chatStore.chatHistory}
                                                    isGroup={!!activeGroupId}
                                                    myIp={chatStore.networkAddress || ''}
                                                    contacts={chatStore.contacts.map((contact) => ({ address: contact.address, name: contact.name, upeerId: contact.upeerId }))}
                                                    onReply={(msg: ChatMessage) => setReplyToMessage(activeGroupId || targetUpeerId, msg)}
                                                    onReact={handleReaction}
                                                    onEdit={(msg: ChatMessage) => {
                                                        setEditingMessage(msg);
                                                        setMessage(getEditableMessageText(msg.message));
                                                    }}
                                                    onDelete={handleDeleteMessage}
                                                    onForward={(msg: ChatMessage) => setForwardingMsg(msg)}
                                                    onRetryMessage={(msgId: string) => { void chatStore.handleRetryMessage(msgId); }}
                                                    onRetryTransfer={async (fileId: string) => { await fileTransfer.retryTransfer(fileId); }}
                                                    onCancelTransfer={(fileId: string) => fileTransfer.cancelTransfer(fileId, 'User cancelled')}
                                                    onMediaClick={handleMediaClick}
                                                    activeTransfers={fileTransfer.allTransfers.filter((transfer: FileTransfer) => activeGroupId ? transfer.chatUpeerId === activeGroupId : transfer.upeerId === targetUpeerId)}
                                                    onTransferStateChange={chatStore.updateFileTransferMessage}
                                                />
                                            </Box>
                                            <InputArea
                                                focusKey={`${activeGroupId || targetUpeerId}:${editingMessage?.id || ''}`}
                                                message={message}
                                                setMessage={setMessage}
                                                onSend={editingMessage
                                                    ? async (linkPreview?: LinkPreview | null) => { if (editingMessage.id) handleUpdateMessage(editingMessage.id, message, linkPreview); setEditingMessage(null); setMessage(''); }
                                                    : (activeGroupId ? handleSendGroupMessage : handleSend)
                                                }
                                                onTyping={handleTyping}
                                                onAttachFile={handleAttachFile}
                                                allowContactShare={!activeGroupId && !!targetUpeerId}
                                                onSendVoiceNote={handleSendVoiceNote}
                                                disabled={(activeGroupId ? activeGroup?.status !== 'active' : !targetUpeerId) || (targetUpeerId ? !['connected', 'offline', 'disconnected'].includes(activeContact?.status ?? '') : false)}
                                                replyToMessage={currentReplyToMessage ? {
                                                    ...currentReplyToMessage,
                                                    senderName: currentReplyToMessage.senderName || (currentReplyToMessage.isMine ? 'Tú' : activeContact?.name),
                                                } : null}
                                                onCancelReply={() => setReplyToMessage(activeGroupId || targetUpeerId, null)}
                                                editingMessage={editingMessage}
                                                onCancelEdit={() => { setEditingMessage(null); setMessage(''); }}
                                                onScrollToMessage={handleScrollToMessage}
                                            />

                                            {(isFilePickerOpen || isPreparingAttachments || isDragging) && (
                                                <FilePreviewOverlay
                                                    files={pendingFiles}
                                                    isDragging={isDragging}
                                                    vouchScore={activeContact?.vouchScore}
                                                    onDragOver={handleDragOver}
                                                    onDragLeave={handleDragLeave}
                                                    onDrop={handleDrop}
                                                    onClose={() => { setPendingFiles([]); setFilePickerOpen(false); navigation.setPreparingAttachments(false); chatStore.setIsDragging(false); }}
                                                    onSend={handleFileSubmit}
                                                    onAddMore={() => handleAttachFile('any')}
                                                    onRemove={(index: number) => {
                                                        const newFiles = [...pendingFiles];
                                                        newFiles.splice(index, 1);
                                                        setPendingFiles(newFiles);
                                                        if (newFiles.length === 0) {
                                                            setFilePickerOpen(false);
                                                        }
                                                    }}
                                                />
                                            )}
                                        </Box>
                                    )}
                                </Box>

                                {!activeGroupId && activeContact && isContactInfoOpen && (
                                    <ContactInfoPanel
                                        contact={activeContact}
                                        chatHistory={chatStore.chatHistory}
                                        activeTransfers={fileTransfer.allTransfers.filter((transfer: FileTransfer) => transfer.upeerId === targetUpeerId)}
                                        onClose={() => setIsContactInfoOpen(false)}
                                        onShare={() => navigation.setShareModalOpen(true)}
                                        onFavorite={() => handleToggleFavorite(targetUpeerId)}
                                        onClearChat={() => handleClearChat(targetUpeerId)}
                                        onBlockContact={handleBlockContact}
                                        onDeleteContact={() => handleDeleteContact(targetUpeerId)}
                                        onOpenMedia={handleMediaClick}
                                        onCallAudio={() => void startCall(targetUpeerId, 'audio')}
                                        onCallVideo={() => void startCall(targetUpeerId, 'video')}
                                        onSearch={() => setIsChatSearchOpen(true)}
                                        callsUnavailable={callsUnavailable}
                                    />
                                )}
                                {activeGroupId && activeGroup && isGroupInfoOpen && (
                                    <GroupInfoPanel
                                        group={activeGroup}
                                        contacts={chatStore.contacts}
                                        currentUserId={chatStore.myIdentity?.upeerId}
                                        sharedMedia={groupMedia}
                                        onClose={() => setIsGroupInfoOpen(false)}
                                        onInviteMembers={() => setIsInviteGroupMembersOpen(true)}
                                        onOpenMedia={handleMediaClick}
                                        onCallAudio={() => void startCall(activeGroupId, 'audio', true, activeGroup.members, activeGroupId)}
                                        onCallVideo={() => void startCall(activeGroupId, 'video', true, activeGroup.members, activeGroupId)}
                                        onSearch={() => setIsChatSearchOpen(true)}
                                        callsUnavailable={callsUnavailable}
                                        onFavorite={() => chatStore.handleToggleFavoriteGroup(activeGroupId)}
                                        onClearChat={() => handleClearChat(activeGroupId)}
                                        onLeaveGroup={() => chatStore.handleLeaveGroup(activeGroupId)}
                                        onTransferAdmin={async (memberId) => {
                                            await window.upeer.transferGroupAdmin(activeGroupId, memberId);
                                            await chatStore.refreshGroups();
                                        }}
                                        onRemoveMember={async (memberId) => {
                                            await window.upeer.removeGroupMember(activeGroupId, memberId);
                                            await chatStore.refreshGroups();
                                        }}
                                    />
                                )}
                            </>
                        ) : <WelcomePlaceholder />}
                    </Box>
                </>
            )}
        </Box>
    );
};