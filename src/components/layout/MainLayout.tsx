import React from 'react';
import { Box, Typography } from '@mui/joy';
import { Sidebar } from './Sidebar.js';
import { ChatArea } from '../../features/chat/ChatArea.js';
import { IncomingRequestChat } from '../../features/chat/IncomingRequestChat.js';
import { TopHeader } from './TopHeader.js';
import { InputArea } from '../../features/chat/input/InputArea.js';
import { AddContactModal } from '../ui/AddContactModal.js';
import { NavigationRail } from './NavigationRail.js';
import { IdentityModal } from '../ui/IdentityModal.js';
import { ShareContactModal } from '../ui/ShareContactModal.js';
import { SecurityModal } from '../ui/SecurityModal.js';
import { SettingsPanel } from '../ui/SettingsPanel.js';
import { YggstackSplash } from '../ui/YggstackSplash.js';
import { FilePreviewOverlay } from '../../features/chat/file-preview/FilePreviewOverlay.js';
import { MediaViewerOverlay } from '../../features/chat/media-viewer/MediaViewerOverlay.js';
import { CreateGroupModal } from '../ui/CreateGroupModal.js';
import { AppLock } from '../ui/AppLock.js';
import { LoginScreen } from '../ui/LoginScreen.js';

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
    handleSend: () => void;
    handleSendGroupMessage: () => void;
    handleAttachFile: (type: any) => void;
    handleTyping: () => void;
    handleScrollToMessage: (id: string) => void;
    
    // Complex State
    currentReplyToMessage: any;
    setReplyToMessage: (id: string, msg: any) => void;
    handleAcceptContact: (id: string) => void;
    handleDeleteContact: (id: string) => void;
    handleClearChat: (id: string) => void;
    handleBlockContact: () => void;
    handleReaction: (id: string, emoji: string, isGroup: boolean) => void;
    handleUpdateMessage: (id: string, msg: string) => void;
    handleDeleteMessage: (id: string) => void;
    handleMediaClick: (media: any) => void;
    
    // Modals & Navigation
    navigation: any;
    appStore: any;
    chatStore: any;
    
    // Files
    isFilePickerOpen: boolean;
    setFilePickerOpen: (open: boolean) => void;
    pendingFiles: any[];
    setPendingFiles: (files: any[]) => void;
    handleFileSubmit: (files: any[], thumbnails?: any[], captions?: any[]) => void;
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
    handleAcceptContact, handleDeleteContact, handleBlockContact,
    handleReaction, handleUpdateMessage, handleDeleteMessage, handleMediaClick,
    navigation, appStore, chatStore,
    isFilePickerOpen, setFilePickerOpen, pendingFiles, setPendingFiles, handleFileSubmit,
    fileTransfer, editingMessage, setEditingMessage
}) => {
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
    const untrustworthyInfo = chatStore.untrustworthyAlerts[targetUpeerId] || chatStore.incomingRequests[targetUpeerId]?.untrustworthy;

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
            ) : (
                <>
                    <Sidebar
                        contacts={chatStore.contacts}
                        groups={chatStore.groups}
                        onSelectContact={chatStore.setTargetUpeerId}
                        onSelectGroup={chatStore.setActiveGroupId}
                        onDeleteContact={chatStore.handleDeleteContact}
                        onClearChat={chatStore.handleClearChat}
                        selectedId={chatStore.targetUpeerId}
                        selectedGroupId={chatStore.activeGroupId}
                        onAddContact={chatStore.handleAddContact}
                        onShowMyIdentity={() => navigation.setIdentityModalOpen(true)}
                        onCreateGroup={chatStore.handleCreateGroup}
                        onLeaveGroup={chatStore.handleLeaveGroup}
                        typingStatus={chatStore.typingStatus}
                    />
                    
                    <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', height: '100%', minWidth: 0, backgroundColor: 'background.body', position: 'relative', overflow: 'hidden' }}>
                        {(targetUpeerId || activeGroupId) ? (
                            <>
                                {activeGroupId ? (
                                    <TopHeader
                                        contactName={activeGroup?.name}
                                        isGroup={true}
                                        avatar={activeGroup?.avatar || undefined}
                                        memberCount={activeGroup?.members.length}
                                        isAdmin={activeGroup?.adminUpeerId === chatStore.myIdentity?.upeerId}
                                        groupId={activeGroupId}
                                        onUpdateGroup={(fields) => chatStore.handleUpdateGroup(activeGroupId, fields)}
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
                                        vouchScore={activeContact?.vouchScore}
                                        onDelete={() => handleDeleteContact(targetUpeerId)}
                                        onShare={() => navigation.setShareModalOpen(true)}
                                        onAccept={isIncomingRequest ? undefined : () => handleAcceptContact(targetUpeerId)}
                                        onShowSecurity={() => navigation.setSecurityModalOpen(true)}
                                    />
                                )}

                                {isIncomingRequest ? (
                                    <IncomingRequestChat
                                        contactName={activeContact?.name}
                                        avatar={activeContactAvatar}
                                        receivedAt={chatStore.incomingRequests[targetUpeerId]?.receivedAt}
                                        onAccept={() => handleAcceptContact(targetUpeerId)}
                                        onReject={handleBlockContact}
                                        untrustworthyInfo={untrustworthyInfo}
                                        vouchScore={activeContact?.vouchScore}
                                    />
                                ) : (
                                    <Box onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop} sx={{ display: 'flex', flexDirection: 'column', flexGrow: 1, position: 'relative', overflow: 'hidden' }}>
                                        <Box sx={{ flexGrow: 1, position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column', width: '100%', minWidth: 0 }}>
                                            <ChatArea
                                                key={activeGroupId || targetUpeerId}
                                                chatHistory={activeGroupId ? chatStore.groupChatHistory : chatStore.chatHistory}
                                                isGroup={!!activeGroupId}
                                                myIp={appStore.networkAddress || ''}
                                                contacts={chatStore.contacts.map((c: any) => ({ address: c.address, name: c.name }))}
                                                onReply={(msg: any) => setReplyToMessage(activeGroupId || targetUpeerId, msg)}
                                                onReact={handleReaction}
                                                onEdit={(msg: any) => { setEditingMessage(msg); setMessage(msg.message); }}
                                                onDelete={handleDeleteMessage}
                                                onRetryTransfer={async (fileId: string) => { await fileTransfer.retryTransfer(fileId); }}
                                                onCancelTransfer={(fileId: string) => fileTransfer.cancelTransfer(fileId, 'User cancelled')}
                                                onMediaClick={handleMediaClick}
                                                activeTransfers={activeGroupId ? [] : fileTransfer.allTransfers.filter((t: any) => t.upeerId === targetUpeerId)}
                                                onTransferStateChange={chatStore.updateFileTransferMessage}
                                            />
                                        </Box>
                                        <InputArea
                                            message={message}
                                            setMessage={setMessage}
                                            onSend={editingMessage
                                                ? () => { if (editingMessage.id) handleUpdateMessage(editingMessage.id, message); setEditingMessage(null); }
                                                : (activeGroupId ? () => handleSendGroupMessage() : handleSend)
                                            }
                                            onTyping={handleTyping}
                                            onAttachFile={handleAttachFile}
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

                                        {(isFilePickerOpen || isDragging) && (
                                            <FilePreviewOverlay
                                                files={pendingFiles}
                                                isDragging={isDragging}
                                                vouchScore={activeContact?.vouchScore}
                                                onDragOver={handleDragOver}
                                                onDragLeave={handleDragLeave}
                                                onDrop={handleDrop}
                                                onClose={() => { setPendingFiles([]); setFilePickerOpen(false); navigation.setIsDragging(false); }}
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
                            </>
                        ) : (
                            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', position: 'relative', px: 3, textAlign: 'center' }}>
                                <Box component="img" src="/logo.svg" sx={{ width: 120, height: 120, mb: 4 }} />
                                <Typography level="h2" sx={{ mb: 1, fontWeight: 700, opacity: 0.5 }}>Bienvenido a uPeer</Typography>
                                <Typography level="body-lg" sx={{ color: 'neutral.500', maxWidth: 400, mx: 'auto', mb: 4 }}>Selecciona un contacto para comenzar a chatear. Conectividad sin intermediarios, y encriptado de extremo a extremo.</Typography>
                                <Box sx={{ position: 'absolute', bottom: 32, display: 'flex', alignItems: 'center', gap: 1 }}>
                                    <Typography level="body-xs" color="neutral">uPeer - v1.0.0</Typography>
                                </Box>
                            </Box>
                        )}
                    </Box>

                    <AddContactModal open={navigation.isAddModalOpen} onClose={() => navigation.setAddModalOpen(false)} onAdd={chatStore.handleAddContact} />
                    <IdentityModal open={navigation.isIdentityModalOpen} onClose={() => navigation.setIdentityModalOpen(false)} identity={chatStore.myIdentity} />
                    <ShareContactModal open={navigation.isShareModalOpen} onClose={() => navigation.setShareModalOpen(false)} contacts={chatStore.contacts} onShare={(contact) => { if (targetUpeerId) window.upeer.sendContactCard(targetUpeerId, contact); }} />

                    {navigation.isSecurityModalOpen && activeContact && (
                        <SecurityModal
                            open={navigation.isSecurityModalOpen}
                            onClose={() => navigation.setSecurityModalOpen(false)}
                            contactName={activeContact.name}
                            contactPublicKey={activeContact.publicKey || ''}
                            myPublicKey={chatStore.myIdentity?.publicKey || ''}
                            knownAddresses={activeContact.knownAddresses}
                        />
                    )}

                    <CreateGroupModal open={navigation.isCreateGroupModalOpen} onClose={() => navigation.setCreateGroupModalOpen(false)} contacts={chatStore.contacts} onCreate={chatStore.handleCreateGroup} />

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

