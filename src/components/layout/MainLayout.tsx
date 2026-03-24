import React, { useEffect, useState } from 'react';
import { Box, Typography } from '@mui/joy';
import { Sidebar } from './Sidebar.js';
import { ChatArea } from '../../features/chat/ChatArea.js';
import { IncomingRequestChat } from '../../features/chat/IncomingRequestChat.js';
import { TopHeader } from './TopHeader.js';
import { InputArea } from '../../features/chat/input/InputArea.js';
import type { LinkPreview } from '../../types/chat.js';
import { AddContactModal } from '../ui/AddContactModal.js';
import { NavigationRail } from './NavigationRail.js';
import { ContactsPanel } from './ContactsPanel.js';
import { ShareContactModal } from '../ui/ShareContactModal.js';

import { SettingsPanel } from '../ui/SettingsPanel.js';
import { YggstackSplash } from '../ui/YggstackSplash.js';
import { FilePreviewOverlay } from '../../features/chat/file-preview/FilePreviewOverlay.js';
import { MediaViewerOverlay } from '../../features/chat/media-viewer/MediaViewerOverlay.js';
import { CreateGroupModal } from '../ui/CreateGroupModal.js';
import { InviteGroupMembersModal } from '../ui/InviteGroupMembersModal.js';
import { AppLock } from '../ui/AppLock.js';
import { LoginScreen } from '../ui/LoginScreen.js';
import { ForwardModal } from '../../features/chat/message/ForwardModal.js';
import { forwardMessageToTargets } from '../../features/chat/message/forwardMessage.js';
import { ContactInfoPanel } from './ContactInfoPanel.js';

interface MainLayoutProps {
    // State & Stores
    isAppLocked: boolean | null;
    setIsAppLocked: (locked: boolean) => void;
    isAuthenticated: boolean | null;
    setAuthenticated: (auth: boolean) => void;

    // UI State
    isDragging: boolean;
    handleDragOver: (e: React.DragEvent) => void;
    handleDragLeave: (e: React.DragEvent) => void;
    handleDrop: (e: React.DragEvent) => void;

    // Chat Context
    activeContact: any;
    activeGroup: any;
    isIncomingRequest: boolean;
    targetUpeerId: string;
    activeGroupId: string;
    message: string;
    setMessage: (val: string) => void;

    // Handlers
    handleSend: (linkPreview?: LinkPreview | null) => void;
    handleSendGroupMessage: (linkPreview?: LinkPreview | null) => void;
    handleAttachFile: (type: any) => void;
    handleTyping: () => void;
    handleScrollToMessage: (id: string) => void;

    // Complex State
    currentReplyToMessage: any;
    setReplyToMessage: (id: string, msg: any) => void;
    handleAcceptContact: (id: string) => void;
    handleDeleteContact: (id: string) => void;
    handleToggleFavorite: (id: string) => Promise<void>;
    handleToggleFavoriteGroup: (id: string) => Promise<void>;
    handleClearChat: (id: string) => void;
    handleBlockContact: () => void;
    handleReaction: (id: string, emoji: string, isGroup: boolean) => void;
    handleUpdateMessage: (id: string, msg: string, linkPreview?: LinkPreview | null) => void;
    handleDeleteMessage: (id: string) => void;
    handleMediaClick: (media: any) => void;

    // Modals & Navigation
    navigation: any;
    appStore: any;
    chatStore: any;

    // Files
    isFilePickerOpen: boolean;
    isPreparingAttachments: boolean;
    setFilePickerOpen: (open: boolean) => void;
    pendingFiles: any[];
    setPendingFiles: (files: any[]) => void;
    handleFileSubmit: (files: any[], thumbnails?: any[], captions?: any[]) => void;
    handleSendVoiceNote: (file: File) => Promise<void>;
    fileTransfer: any;

    // Message Editing
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
    handleAcceptContact, handleDeleteContact, handleToggleFavorite, handleToggleFavoriteGroup, handleClearChat, handleBlockContact,
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
        return (
            <Box sx={{ height: '100vh', width: '100vw', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'background.body' }}>
                <Box sx={{ width: 36, height: 36, border: '3px solid', borderColor: 'primary.500', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite', '@keyframes spin': { to: { transform: 'rotate(360deg)' } } }} />
            </Box>
        );
    }

    if (isAppLocked) return <AppLock onUnlock={() => setIsAppLocked(false)} />;

    if (isAuthenticated === null) {
        return (
            <Box sx={{ height: '100vh', width: '100vw', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'background.body' }}>
                <Box sx={{ width: 36, height: 36, border: '3px solid', borderColor: 'primary.500', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite', '@keyframes spin': { to: { transform: 'rotate(360deg)' } } }} />
            </Box>
        );
    }

    if (isAuthenticated === false) {
        return <LoginScreen onUnlocked={() => { setAuthenticated(true); chatStore.refreshData(); chatStore.refreshGroups(); }} />;
    }

    const activeContactAvatar = activeContact?.avatar || chatStore.incomingRequests[targetUpeerId]?.avatar;
    const incomingRequest = chatStore.incomingRequests[targetUpeerId];
    const effectiveVouchScore = activeContact?.vouchScore ?? incomingRequest?.vouchScore;
    const untrustworthyInfo = chatStore.untrustworthyAlerts[targetUpeerId] || incomingRequest?.untrustworthy;

    const handleForward = async (targets: { id: string; isGroup: boolean }[]) => {
        if (!forwardingMsg) return;
        await forwardMessageToTargets(forwardingMsg.message, targets);
        chatStore.refreshContacts();
        chatStore.refreshGroups();
    };

    return (
        <Box sx={{ display: 'flex', height: '100vh', bgcolor: 'background.body', overflow: 'hidden' }}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}>

            {isDragging && (
                <Box sx={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    bgcolor: 'rgba(0,0,0,0.4)', zIndex: 9999,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    pointerEvents: 'none', border: '4px dashed', borderColor: 'primary.main', m: 2, borderRadius: 2
                }}>
                    <Typography level="h2" textColor="white">Soltar archivos para enviar</Typography>
                </Box>
            )}

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

            {navigation.appView === 'settings' ? (
                <Box sx={{ flexGrow: 1, display: 'flex', height: '100%', overflow: 'hidden' }}>
                    <SettingsPanel
                        identity={chatStore.myIdentity}
                        networkAddress={appStore.networkAddress}
                        networkStatus={appStore.networkStatus}
                        activeSection={navigation.settingsSection}
                        onSectionChange={navigation.setSettingsSection}
                        onIdentityUpdate={chatStore.refreshData}
                        onLockSession={() => { setAuthenticated(false); navigation.goToChat(); }}
                    />
                </Box>
            ) : navigation.appView === 'contacts' ? (
                <Box sx={{ flexGrow: 1, display: 'flex', height: '100%', overflow: 'hidden' }}>
                    <ContactsPanel
                        contacts={chatStore.contacts}
                        groups={chatStore.groups}
                        selectedContactId={chatStore.targetUpeerId}
                        onSelectContact={chatStore.setTargetUpeerId}
                        onOpenChat={(upeerId) => {
                            chatStore.setTargetUpeerId(upeerId);
                            navigation.goToChat();
                        }}
                        onDeleteContact={chatStore.handleDeleteContact}
                        onBlockContact={(upeerId) => chatStore.handleBlockContact(upeerId)}
                        onUnblockContact={chatStore.handleUnblockContact}
                    />
                </Box>
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
                                                    contacts={chatStore.contacts.map((c: any) => ({ address: c.address, name: c.name, upeerId: c.upeerId }))}
                                                    onReply={(msg: any) => setReplyToMessage(activeGroupId || targetUpeerId, msg)}
                                                    onReact={handleReaction}
                                                    onEdit={(msg: any) => {
                                                        let editText = msg.message;
                                                        if (editText.startsWith('{') && editText.endsWith('}')) {
                                                            try {
                                                                const parsed = JSON.parse(editText);
                                                                if (typeof parsed.text === 'string') editText = parsed.text;
                                                                else if (parsed.type === 'file' && typeof parsed.caption === 'string') editText = parsed.caption;
                                                            } catch {
                                                                editText = msg.message;
                                                            }
                                                        }
                                                        setEditingMessage(msg);
                                                        setMessage(editText);
                                                    }}
                                                    onDelete={handleDeleteMessage}
                                                    onForward={(msg: any) => setForwardingMsg(msg)}
                                                    onRetryTransfer={async (fileId: string) => { await fileTransfer.retryTransfer(fileId); }}
                                                    onCancelTransfer={(fileId: string) => fileTransfer.cancelTransfer(fileId, 'User cancelled')}
                                                    onMediaClick={handleMediaClick}
                                                    activeTransfers={fileTransfer.allTransfers.filter((t: any) => activeGroupId ? t.chatUpeerId === activeGroupId : t.upeerId === targetUpeerId)}
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
                                                onSendVoiceNote={handleSendVoiceNote}
                                                disabled={(activeGroupId ? false : !targetUpeerId) || (targetUpeerId ? activeContact?.status !== 'connected' : false)}
                                                replyToMessage={currentReplyToMessage ? {
                                                    ...currentReplyToMessage,
                                                    senderName: currentReplyToMessage.senderName || (currentReplyToMessage.isMine ? 'Tú' : activeContact?.name)
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
                                                        if (newFiles.length === 0) setFilePickerOpen(false);
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
                                        activeTransfers={fileTransfer.allTransfers.filter((t: any) => t.upeerId === targetUpeerId)}
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
                        ) : (
                            <Box sx={{
                                flexGrow: 1,
                                width: '100%',
                                minWidth: 0,
                                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                                height: '100%', position: 'relative', px: 3, textAlign: 'center',
                                backgroundColor: 'background.body',
                            }}>
                                <Box sx={{ opacity: 0.8, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                    <Box sx={{
                                        width: 100, height: 100,
                                        backgroundColor: 'background.level1',
                                        borderRadius: 'xl',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        mb: 3, border: '1px solid', borderColor: 'divider'
                                    }}>
                                        <Box component="img" src="/logo.svg" sx={{ width: 56, height: 56 }} />
                                    </Box>
                                    <Typography level="h4" sx={{ fontWeight: 600, mb: 1 }}>Bienvenido a uPeer</Typography>
                                    <Typography level="body-md" sx={{ color: 'text.secondary', maxWidth: 320, lineHeight: 1.6 }}>
                                        Selecciona un contacto para comenzar a chatear. Conectividad sin intermediarios, cifrado de extremo a extremo.
                                    </Typography>
                                </Box>
                                <Box sx={{ position: 'absolute', bottom: 32, display: 'flex', alignItems: 'center', gap: 1 }}>
                                    <Typography level="body-xs" color="neutral">uPeer - v1.0.0</Typography>
                                </Box>
                            </Box>
                        )}
                    </Box>

                    <AddContactModal open={navigation.isAddModalOpen} onClose={() => navigation.setAddModalOpen(false)} onAdd={chatStore.handleAddContact} />
                    <ShareContactModal open={navigation.isShareModalOpen} onClose={() => navigation.setShareModalOpen(false)} contacts={chatStore.contacts} onShare={(contact) => { if (targetUpeerId) window.upeer.sendContactCard(targetUpeerId, contact); }} />


                    <InviteGroupMembersModal
                        open={isInviteGroupMembersOpen}
                        onClose={() => setIsInviteGroupMembersOpen(false)}
                        contacts={chatStore.contacts}
                        group={activeGroup || null}
                        onInvite={chatStore.handleInviteGroupMembers}
                    />


                    <CreateGroupModal open={navigation.isCreateGroupModalOpen} onClose={() => navigation.setCreateGroupModalOpen(false)} contacts={chatStore.contacts} onCreate={chatStore.handleCreateGroup} />

                    <ForwardModal
                        open={!!forwardingMsg}
                        onClose={() => setForwardingMsg(null)}
                        contacts={chatStore.contacts}
                        groups={chatStore.groups}
                        onSend={handleForward}
                    />

                    {navigation.viewerMediaList.length > 0 && (
                        <MediaViewerOverlay
                            items={navigation.viewerMediaList}
                            initialIndex={navigation.viewerInitialIndex}
                            onClose={() => navigation.closeMediaViewer()}
                            onDownload={async (item: any) => {
                                const result = await window.upeer.showSaveDialog({ defaultPath: item.fileName });
                                if (!result.canceled && result.filePath) await window.upeer.saveTransferredFile(item.fileId, result.filePath);
                            }}
                            onReply={(item: any) => {
                                const currentHistory = activeGroupId ? chatStore.groupChatHistory : chatStore.chatHistory;
                                const msg = currentHistory.find((m: any) => m.id === item.messageId);
                                if (msg) setReplyToMessage(activeGroupId || targetUpeerId, msg);
                                navigation.closeMediaViewer();
                            }}
                            onReact={(item: any, emoji: string) => { if (item.messageId) handleReaction(item.messageId, emoji, false); }}
                            onForward={(_item: any) => { /* logic */ }}
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
            )}
        </Box>
    );
};

