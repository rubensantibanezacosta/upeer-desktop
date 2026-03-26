import React from 'react';
import { Box } from '@mui/joy';
import { Sidebar } from './Sidebar.js';
import { ChatArea } from '../../features/chat/ChatArea.js';
import { IncomingRequestChat } from '../../features/chat/IncomingRequestChat.js';
import { TopHeader } from './TopHeader.js';
import { InputArea } from '../../features/chat/input/InputArea.js';
import type { LinkPreview } from '../../types/chat.js';
import { NavigationRail } from './NavigationRail.js';
import { FilePreviewOverlay } from '../../features/chat/file-preview/FilePreviewOverlay.js';
import { ContactInfoPanel } from './ContactInfoPanel.js';
import { DragOverlay, WelcomePlaceholder, getEditableMessageText } from './mainLayoutHelpers.js';
import { MainLayoutPanels } from './MainLayoutPanels.js';

interface MainLayoutContentProps {
    navigation: any;
    appStore: any;
    chatStore: any;
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
    setForwardingMsg: (message: any) => void;
    onLockSession: () => void;
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
    setIsContactInfoOpen: React.Dispatch<React.SetStateAction<boolean>>;
    isContactInfoOpen: boolean;
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
    setIsInviteGroupMembersOpen,
}) => {
    const activeContactAvatar = activeContact?.avatar || chatStore.incomingRequests[targetUpeerId]?.avatar;
    const incomingRequest = chatStore.incomingRequests[targetUpeerId];
    const effectiveVouchScore = activeContact?.vouchScore ?? incomingRequest?.vouchScore;
    const untrustworthyInfo = chatStore.untrustworthyAlerts[targetUpeerId] || incomingRequest?.untrustworthy;

    return (
        <Box sx={{ display: 'flex', flexGrow: 1, minWidth: 0, width: '100%', height: '100vh', bgcolor: 'background.body', overflow: 'hidden' }} onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}>
            <DragOverlay isDragging={isDragging} />
            <NavigationRail
                myIp={appStore.networkAddress}
                myAvatar={chatStore.myIdentity?.avatar}
                myInitial={(chatStore.myIdentity?.alias || chatStore.myIdentity?.upeerId || '?').charAt(0).toUpperCase()}
                activeView={navigation.appView}
                onOpenChats={() => navigation.goToChat()}
                onOpenContacts={() => navigation.goToContacts()}
                onOpenSettings={() => navigation.toggleSettings()}
                onOpenIdentity={() => navigation.goToSettings('perfil')}
            />

            {navigation.appView === 'settings' || navigation.appView === 'contacts' ? (
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
                                            onDelete={() => chatStore.handleLeaveGroup(activeGroupId)}
                                        />
                                    ) : (
                                        <TopHeader
                                            contactName={activeContact?.name}
                                            avatar={activeContactAvatar}
                                            isOnline={activeContact?.lastSeen && (new Date().getTime() - new Date(activeContact.lastSeen).getTime()) < 65000}
                                            isTyping={!!chatStore.typingStatus[targetUpeerId]}
                                            status={activeContact?.status}
                                            lastSeen={activeContact?.lastSeen}
                                            vouchScore={effectiveVouchScore}
                                            onDelete={() => handleClearChat(targetUpeerId)}
                                            onShare={() => navigation.setShareModalOpen(true)}
                                            onAccept={isIncomingRequest ? undefined : () => handleAcceptContact(targetUpeerId)}
                                            onOpenInfo={() => setIsContactInfoOpen((value) => !value)}
                                        />
                                    )}

                                    {isIncomingRequest ? (
                                        <IncomingRequestChat
                                            contactName={activeContact?.name}
                                            avatar={activeContactAvatar}
                                            receivedAt={incomingRequest?.receivedAt}
                                            onAccept={() => handleAcceptContact(targetUpeerId)}
                                            onReject={handleBlockContact}
                                            untrustworthyInfo={untrustworthyInfo}
                                            vouchScore={effectiveVouchScore}
                                        />
                                    ) : (
                                        <Box onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop} sx={{ display: 'flex', flexDirection: 'column', flexGrow: 1, position: 'relative', overflow: 'hidden' }}>
                                            <Box sx={{ flexGrow: 1, position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column', width: '100%', minWidth: 0 }}>
                                                <ChatArea
                                                    key={activeGroupId || targetUpeerId}
                                                    chatHistory={activeGroupId ? chatStore.groupChatHistory : chatStore.chatHistory}
                                                    isGroup={!!activeGroupId}
                                                    myIp={appStore.networkAddress || ''}
                                                    contacts={chatStore.contacts.map((contact: any) => ({ address: contact.address, name: contact.name, upeerId: contact.upeerId }))}
                                                    onReply={(msg: any) => setReplyToMessage(activeGroupId || targetUpeerId, msg)}
                                                    onReact={handleReaction}
                                                    onEdit={(msg: any) => {
                                                        setEditingMessage(msg);
                                                        setMessage(getEditableMessageText(msg.message));
                                                    }}
                                                    onDelete={handleDeleteMessage}
                                                    onForward={(msg: any) => setForwardingMsg(msg)}
                                                    onRetryMessage={(msgId: string) => { void chatStore.handleRetryMessage(msgId); }}
                                                    onRetryTransfer={async (fileId: string) => { await fileTransfer.retryTransfer(fileId); }}
                                                    onCancelTransfer={(fileId: string) => fileTransfer.cancelTransfer(fileId, 'User cancelled')}
                                                    onMediaClick={handleMediaClick}
                                                    activeTransfers={fileTransfer.allTransfers.filter((transfer: any) => activeGroupId ? transfer.chatUpeerId === activeGroupId : transfer.upeerId === targetUpeerId)}
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
                                                disabled={(activeGroupId ? false : !targetUpeerId) || (targetUpeerId ? activeContact?.status !== 'connected' : false)}
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
                                                    onClose={() => { setPendingFiles([]); setFilePickerOpen(false); navigation.setPreparingAttachments(false); navigation.setIsDragging(false); }}
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
                                        activeTransfers={fileTransfer.allTransfers.filter((transfer: any) => transfer.upeerId === targetUpeerId)}
                                        onClose={() => setIsContactInfoOpen(false)}
                                        onShare={() => navigation.setShareModalOpen(true)}
                                        onFavorite={() => handleToggleFavorite(targetUpeerId)}
                                        onClearChat={() => handleClearChat(targetUpeerId)}
                                        onBlockContact={handleBlockContact}
                                        onDeleteContact={() => handleDeleteContact(targetUpeerId)}
                                        onOpenMedia={handleMediaClick}
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