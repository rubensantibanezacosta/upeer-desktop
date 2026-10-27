import React, { useState } from 'react';
import { Box } from '@mui/joy';
import { Sidebar } from './Sidebar.js';
import { ChatArea } from '../../features/chat/ChatArea.js';
import type { ContactPanelView, GroupPanelView } from './contactInfoPanelSupport.js';
import { IncomingRequestChat } from '../../features/chat/IncomingRequestChat.js';
import { TopHeader } from './TopHeader.js';
import { ChatHeaderMenu } from './ChatHeaderMenu.js';
import { InputArea } from '../../features/chat/input/InputArea.js';
import type { LinkPreview } from '../../types/chat.js';
import type { ChatMessage, PendingFile } from '../../types/chat.js';
import type { FileTransfer } from '../../hooks/fileTransferTypes.js';
import { NavigationRail } from './NavigationRail.js';
import { FilePreviewOverlay } from '../../features/chat/file-preview/FilePreviewOverlay.js';
import { useCall } from '../../features/call/useCall.js';
import { useCallStore } from '../../features/call/useCallStore.js';
import { useChatActionsStore } from '../../store/useChatActionsStore.js';
import { isContactUnread, isGroupUnread } from '../../utils/chatUnread.js';
import { useSharedMediaItems } from './contactInfoPanelSupport.js';
import { exportChatTranscript } from '../../utils/exportChat.js';
import { ContactInfoPanel } from './ContactInfoPanel.js';
import { GroupInfoPanel } from './GroupInfoPanel.js';
import { KeyChangeAlertBanner } from './KeyChangeAlertBanner.js';
import { DragOverlay, WelcomePlaceholder, getEditableMessageText } from './mainLayoutHelpers.js';
import { MainLayoutPanels } from './MainLayoutPanels.js';
import { usePrivacyStore } from '../../store/usePrivacyStore.js';
import { isWithinPresenceWindow, visiblePresence } from '../../utils/presenceVisibility.js';
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
    handleCapturePhoto: MainLayoutProps['handleCapturePhoto'];
    handleTyping: MainLayoutProps['handleTyping'];
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
    handleCapturePhoto,
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
        contact.status !== 'blocked' && isContactUnread(contact, contactPrefs[contact.upeerId])
    ).length + chatStore.groups.filter((group) =>
        isGroupUnread(group, groupPrefs[group.groupId])
    ).length;
    const activeContactAvatar = activeContact?.avatar || chatStore.incomingRequests[targetUpeerId]?.avatar;
    const incomingRequest = chatStore.incomingRequests[targetUpeerId];
    const effectiveVouchScore = activeContact?.vouchScore ?? incomingRequest?.vouchScore;
    const untrustworthyInfo = chatStore.untrustworthyAlerts[targetUpeerId] || incomingRequest?.untrustworthy;
    const keyChangeAlert = chatStore.keyChangeAlerts[targetUpeerId];
    const onlineStatusPref = usePrivacyStore((state) => state.onlineStatus);
    const lastSeenPref = usePrivacyStore((state) => state.lastSeen);
    const headerPresence = visiblePresence(
        isWithinPresenceWindow(activeContact?.lastActive),
        activeContact?.lastActive,
        { onlineStatus: onlineStatusPref, lastSeen: lastSeenPref },
    );
    const [contactPanelView, setContactPanelView] = useState<ContactPanelView>('main');
    const [groupPanelView, setGroupPanelView] = useState<GroupPanelView>('main');
    const toggleContactInfo = () => {
        setContactPanelView((current) => (isContactInfoOpen ? 'main' : current));
        setIsContactInfoOpen((value) => !value);
    };
    const toggleGroupInfo = () => {
        setGroupPanelView((current) => (isGroupInfoOpen ? 'main' : current));
        setIsGroupInfoOpen((value) => !value);
    };
    const openContactSearch = () => {
        setContactPanelView('search');
        setIsContactInfoOpen(true);
        setIsGroupInfoOpen(false);
    };
    const openGroupSearch = () => {
        setGroupPanelView('search');
        setIsGroupInfoOpen(true);
        setIsContactInfoOpen(false);
    };

    return (
        <Box sx={{ display: 'flex', flexGrow: 1, minWidth: 0, width: '100%', height: '100vh', bgcolor: 'background.body', overflow: 'hidden' }} onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}>
            <DragOverlay isDragging={isDragging} />
            <NavigationRail
                myIp={chatStore.networkAddress}
                myAvatar={chatStore.myIdentity?.avatar}
                myInitial={(chatStore.myIdentity?.alias || chatStore.myIdentity?.upeerId || '?').charAt(0).toUpperCase()}
                activeView={navigation.appView}
                activeSection={navigation.settingsSection}
                activeCallKind={activeCallKind}
                unreadChatCount={unreadChatCount}
                onOpenChats={() => navigation.goToChat()}
                onOpenCalls={() => navigation.goToCalls()}
                onOpenSettings={() => navigation.toggleSettings()}
                onOpenIdentity={() => navigation.goToSettings('perfil')}
                onOpenDevices={() => navigation.goToSettings('dispositivos')}
            />

            {navigation.appView === 'settings' || navigation.appView === 'calls' ? (
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
                        onOpenAppLock={() => navigation.goToSettings('seguridad')}
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
                                            onOpenInfo={toggleGroupInfo}
                                            onDelete={() => chatStore.handleLeaveGroup(activeGroupId)}
                                            onSearch={openGroupSearch}
                                            onCallAudio={() => void startCall(activeGroupId, 'audio', true, activeGroup?.members, activeGroupId)}
                                            onCallVideo={() => void startCall(activeGroupId, 'video', true, activeGroup?.members, activeGroupId)}
                                            menu={
                                                <ChatHeaderMenu
                                                    kind="group"
                                                    chatId={activeGroupId}
                                                    name={activeGroup?.name || 'este grupo'}
                                                    isFavorite={!!activeGroup?.isFavorite}
                                                    onOpenInfo={toggleGroupInfo}
                                                    onSearch={openGroupSearch}
                                                    onToggleFavorite={() => void chatStore.handleToggleFavoriteGroup(activeGroupId)}
                                                    onExport={() => exportChatTranscript({ chatName: activeGroup?.name || activeGroupId, meLabel: chatStore.myIdentity?.alias || 'Yo', messages: chatStore.groupChatHistory })}
                                                    onCloseChat={() => chatStore.setActiveGroupId('')}
                                                    onClearChat={() => handleClearChat(activeGroupId)}
                                                    onLeaveGroup={() => void chatStore.handleLeaveGroup(activeGroupId)}
                                                />
                                            }
                                        />
                                    ) : (
                                        <TopHeader
                                            contactName={activeContact?.name}
                                            avatar={activeContactAvatar}
                                            isOnline={headerPresence.isOnline}
                                            activity={chatStore.peerActivity[targetUpeerId]}
                                            status={activeContact?.status}
                                            lastSeen={headerPresence.lastSeen ?? undefined}
                                            vouchScore={effectiveVouchScore}
                                            isSelfChat={targetUpeerId === chatStore.myIdentity?.upeerId}
                                            onDelete={() => handleClearChat(targetUpeerId)}
                                            onShare={() => navigation.setShareModalOpen(true)}
                                            onAccept={isIncomingRequest ? undefined : handleAcceptContact}
                                            onOpenInfo={toggleContactInfo}
                                            onSearch={openContactSearch}
                                            onCallAudio={() => void startCall(targetUpeerId, 'audio')}
                                            onCallVideo={() => void startCall(targetUpeerId, 'video')}
                                            menu={
                                                <ChatHeaderMenu
                                                    kind="contact"
                                                    chatId={targetUpeerId}
                                                    name={activeContact?.name || 'este contacto'}
                                                    isFavorite={!!activeContact?.isFavorite}
                                                    blocked={activeContact?.status === 'blocked'}
                                                    onOpenInfo={toggleContactInfo}
                                                    onSearch={openContactSearch}
                                                    onToggleFavorite={() => void chatStore.handleToggleFavorite(targetUpeerId)}
                                                    onExport={() => exportChatTranscript({ chatName: activeContact?.name || targetUpeerId, meLabel: chatStore.myIdentity?.alias || 'Yo', messages: chatStore.chatHistory })}
                                                    onCloseChat={() => chatStore.setTargetUpeerId('')}
                                                    onClearChat={() => handleClearChat(targetUpeerId)}
                                                    onDeleteChat={() => { void chatStore.handleClearChat(targetUpeerId); handleDeleteContact(targetUpeerId); }}
                                                    onBlock={handleBlockContact}
                                                />
                                            }
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
                                                    peerActivity={chatStore.peerActivity[activeGroupId || targetUpeerId] ?? null}
                                                    loading={chatStore.historyLoadingByChat[activeGroupId || targetUpeerId] ?? false}
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
                                                onActivity={handleTyping}
                                                onAttachFile={handleAttachFile}
                                                onCapturePhoto={handleCapturePhoto}
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
                                        callsUnavailable={callsUnavailable}
                                        view={contactPanelView}
                                        onViewChange={setContactPanelView}
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
                                        callsUnavailable={callsUnavailable}
                                        view={groupPanelView}
                                        onViewChange={setGroupPanelView}
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