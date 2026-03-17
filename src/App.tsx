import React, { useState, useEffect } from 'react';
import { CssVarsProvider, Sheet, Box, Typography, Stack } from '@mui/joy';
import { Sidebar } from './components/layout/Sidebar.js';
import { ChatArea } from './features/chat/ChatArea.js';
import { IncomingRequestChat } from './features/chat/IncomingRequestChat.js';
import { TopHeader } from './components/layout/TopHeader.js';
import { InputArea } from './features/chat/input/index.js';
import { AddContactModal } from './components/ui/AddContactModal.js';
import { NavigationRail } from './components/layout/NavigationRail.js';
import { IdentityModal } from './components/ui/IdentityModal.js';
import { ShareContactModal } from './components/ui/ShareContactModal.js';
import { SecurityModal } from './components/ui/SecurityModal.js';
import { LoginScreen } from './components/ui/LoginScreen.js';
import { SettingsPanel } from './components/ui/SettingsPanel.js';
import { YggstackSplash } from './components/ui/YggstackSplash.js';
import type { YggNetworkStatus } from './components/ui/YggstackSplash.js';
import { useNavigationStore } from './store/useNavigationStore.js';
import { useAppStore } from './store/useAppStore.js';
import { useChatStore } from './store/useChatStore.js';
import { AttachmentType } from './features/chat/input/index.js';
import { useFileTransfer } from './hooks/useFileTransfer.js';
import { FilePreviewOverlay } from './features/chat/file-preview/index.js';
import { MediaViewerOverlay } from './features/chat/media-viewer/index.js';
import { getMimeType } from './utils/fileUtils.js';
import { parseMessage } from './features/chat/message/MessageItem.js';
import { Contact } from './types/chat.js';
import { CreateGroupModal } from './components/ui/CreateGroupModal.js';

export default function App() {
    // Navigation Store
    const {
        appView, settingsSection, toggleSettings, goToSettings, goToChat, setSettingsSection,
        isAddModalOpen, setAddModalOpen,
        isIdentityModalOpen, setIdentityModalOpen,
        isShareModalOpen, setShareModalOpen,
        isSecurityModalOpen, setSecurityModalOpen,
        isCreateGroupModalOpen, setCreateGroupModalOpen,
        isFilePickerOpen, setFilePickerOpen,
        isTransfersExpanded, setTransfersExpanded,
        viewerMediaList, viewerInitialIndex, openMediaViewer, closeMediaViewer
    } = useNavigationStore();

    // App Store
    const {
        isAuthenticated, setAuthenticated,
        networkStatus, setNetworkStatus,
        isFirstConnect, setFirstConnect,
        yggAddress, setYggAddress,
        checkAuth
    } = useAppStore();

    // Chat Store
    const {
        networkAddress,
        targetUpeerId, setTargetUpeerId,
        activeGroupId, setActiveGroupId,
        chatHistory, groupChatHistory,
        messagesByConversation, setMessage,
        replyByConversation, setReplyToMessage,
        contacts, groups,
        typingStatus,
        myIdentity,
        incomingRequests,
        untrustworthyAlert,
        untrustworthyAlerts,
        pendingFiles, setPendingFiles,
        isDragging, setIsDragging,
        handleSend, handleSendGroupMessage,
        handleReaction, handleUpdateMessage, handleDeleteMessage,
        addFileTransferMessage, updateFileTransferMessage,
        handleAddContact, handleAcceptContact, handleDeleteContact, handleClearChat, handleBlockContact,
        handleCreateGroup, handleUpdateGroup, handleLeaveGroup,
        refreshData, refreshGroups, initListeners
    } = useChatStore();

    const [editingMessage, setEditingMessage] = useState<any>(null);

    // File transfer hook remains local to get instance but syncs with store
    const fileTransfer = useFileTransfer(updateFileTransferMessage);

    // Initialization
    useEffect(() => {
        checkAuth();
        initListeners();
        refreshData();
        refreshGroups();

        window.upeer.getMyNetworkAddress().then((addr: string) => {
            if (addr && addr !== 'No detectado') {
                setYggAddress(addr);
                setNetworkStatus('up');
                setFirstConnect(false);
            }
        });
        window.upeer.onYggstackAddress(setYggAddress);
        window.upeer.onYggstackStatus((status: string, addr?: string) => {
            const s = status as YggNetworkStatus;
            setNetworkStatus(s);
            if (s === 'up') {
                setFirstConnect(false);
                if (addr) setYggAddress(addr);
            }
        });
    }, []);

    // Derived values
    const message = activeGroupId ? (messagesByConversation[activeGroupId] || '') : (messagesByConversation[targetUpeerId] || '');
    const currentReplyToMessage = activeGroupId ? (replyByConversation[activeGroupId] || null) : (replyByConversation[targetUpeerId] || null);
    const activeContact = contacts.find((c: Contact) => c.upeerId === targetUpeerId);
    const activeGroup = groups.find(g => g.groupId === activeGroupId);
    const isOnline = activeContact?.lastSeen && (new Date().getTime() - new Date(activeContact.lastSeen).getTime()) < 65000;
    const isIncomingRequest = activeContact?.status === 'incoming';
    const untrustworthyInfo = untrustworthyAlerts[targetUpeerId] || incomingRequests[targetUpeerId]?.untrustworthy;
    const activeContactAvatar = activeContact?.avatar || incomingRequests[targetUpeerId]?.avatar;

    // Handlers
    const handleAttachFile = async (type: AttachmentType) => {
        if (!targetUpeerId) return;
        let filters: any[] = [];
        let title = 'Seleccionar archivo';
        switch (type) {
            case 'image': title = 'Seleccionar imagen'; filters = [{ name: 'Imágenes', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp'] }]; break;
            case 'video': title = 'Seleccionar video'; filters = [{ name: 'Videos', extensions: ['mp4', 'mov', 'avi', 'mkv'] }]; break;
            case 'audio': title = 'Seleccionar audio'; filters = [{ name: 'Audio', extensions: ['mp3', 'wav', 'ogg', 'flac'] }]; break;
            case 'document': title = 'Seleccionar documento'; filters = [{ name: 'Documentos', extensions: ['pdf', 'doc', 'docx', 'txt', 'rtf'] }]; break;
            default: filters = [{ name: 'Todos los archivos', extensions: ['*'] }];
        }
        try {
            const result = await window.upeer.openFileDialog({ title, filters, multiSelect: true });
            if (result.success && !result.canceled && result.files && result.files.length > 0) {
                setPendingFiles([...pendingFiles, ...(result.files || [])]);
                setFilePickerOpen(true);
            }
        } catch (error) { console.error('Error opening native file dialog:', error); }
    };

    const handleFileSubmit = async (files: any[], thumbnails?: (string | undefined)[], captions?: string[]) => {
        if (!targetUpeerId) return;
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const result = await fileTransfer.startTransfer({
                upeerId: targetUpeerId,
                filePath: file.path,
                thumbnail: thumbnails?.[i],
                caption: captions?.[i]
            });
            if (result.success && result.fileId) {
                const tempHash = `pending-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
                addFileTransferMessage(targetUpeerId, result.fileId, file.name, file.size, file.type, tempHash, thumbnails?.[i] || '', captions?.[i] || '', true);
            }
        }
        setFilePickerOpen(false);
        setPendingFiles([]);
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault(); e.stopPropagation();
        if (!targetUpeerId || activeContact?.status !== 'connected') return;
        setIsDragging(true);
    };

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault(); e.stopPropagation();
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDragging(false);
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault(); e.stopPropagation();
        setIsDragging(false);
        if (!targetUpeerId || activeContact?.status !== 'connected') return;
        const droppedFilesRaw = Array.from(e.dataTransfer.files);
        const mappedFiles = droppedFilesRaw.map((f: any) => {
            const filePath = window.upeer?.getPathForFile ? window.upeer.getPathForFile(f) : f.path;
            let type = f.type || getMimeType(f.name);
            return { path: filePath, name: f.name, size: f.size, type, lastModified: f.lastModified };
        }).filter(f => !!f.path);
        if (mappedFiles.length > 0) {
            setPendingFiles([...pendingFiles, ...mappedFiles]);
            setFilePickerOpen(true);
        }
    };

    const handleMediaClick = (media: any) => {
        const currentHistory = activeGroupId ? groupChatHistory : chatHistory;
        const currentTransfers = activeGroupId ? [] : fileTransfer.allTransfers.filter(t => t.upeerId === targetUpeerId);
        const allMedia = currentHistory.map(msg => {
            const { fileData } = parseMessage(msg.message, msg.isMine, currentTransfers);
            if (!fileData) return null;
            let senderName = msg.isMine ? 'Tú' : (activeGroupId ? (contacts.find(c => c.upeerId === msg.senderUpeerId)?.name || msg.senderName) : activeContact?.name);
            let senderAvatar = msg.isMine ? myIdentity?.avatar : (activeGroupId ? contacts.find(c => c.upeerId === msg.senderUpeerId)?.avatar : activeContactAvatar);
            return { ...fileData, messageId: msg.id, senderName, senderAvatar, timestamp: msg.timestamp };
        }).filter((f): f is any => f && (f.mimeType?.startsWith('image/') || f.mimeType?.startsWith('video/')) && f.savedPath)
            .map(f => ({ url: f.savedPath!, fileName: f.fileName, mimeType: f.mimeType, fileId: f.fileId, messageId: f.messageId, thumbnail: f.thumbnail, senderName: f.senderName, senderAvatar: f.senderAvatar, timestamp: f.timestamp }));

        const initialIndex = allMedia.findIndex(m => m.fileId === media.fileId);
        if (initialIndex !== -1) openMediaViewer(allMedia, initialIndex);
        else openMediaViewer([{ url: media.url, fileName: media.name, mimeType: media.mimeType, fileId: media.fileId, senderName: 'Tú', senderAvatar: myIdentity?.avatar || undefined }], 0);
    };

    const handleTyping = () => { if (targetUpeerId) window.upeer.sendTypingIndicator(targetUpeerId); };

    const handleScrollToMessage = (msgId: string) => {
        const element = document.getElementById(`msg-${msgId}`);
        if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
            // Buscamos el Sheet (burbuja) dentro del item
            const bubble = element.querySelector('.MuiSheet-root') as HTMLElement;
            if (bubble) {
                const originalOutline = bubble.style.outline;
                const originalOutlineOffset = bubble.style.outlineOffset;

                bubble.style.outline = '2px solid var(--joy-palette-primary-500)';
                bubble.style.outlineOffset = '2px';

                setTimeout(() => {
                    bubble.style.outline = originalOutline;
                    bubble.style.outlineOffset = originalOutlineOffset;
                }, 1500);
            }
        }
    };

    return (
        <CssVarsProvider defaultMode="dark">
            {isAuthenticated === null && (
                <Box sx={{ height: '100vh', width: '100vw', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'background.body' }}>
                    <Box sx={{ width: 36, height: 36, border: '3px solid', borderColor: 'primary.500', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite', '@keyframes spin': { to: { transform: 'rotate(360deg)' } } }} />
                </Box>
            )}

            {isAuthenticated === false && (
                <LoginScreen onUnlocked={() => { setAuthenticated(true); refreshData(); refreshGroups(); }} />
            )}

            {isAuthenticated === true && (
                <Sheet sx={{ display: 'flex', height: '100vh', width: '100vw', backgroundColor: 'background.body', overflow: 'hidden', position: 'relative' }}>
                    <NavigationRail
                        myIp={networkAddress}
                        myAvatar={myIdentity?.avatar}
                        myInitial={(myIdentity?.alias || myIdentity?.upeerId || '?').charAt(0).toUpperCase()}
                        activeView={appView}
                        onOpenSettings={() => toggleSettings()}
                        onOpenIdentity={() => goToSettings('perfil')}
                    />

                    {appView === 'settings' ? (
                        <Box sx={{ flexGrow: 1, display: 'flex', height: '100%', overflow: 'hidden' }}>
                            <SettingsPanel
                                identity={myIdentity}
                                networkAddress={networkAddress}
                                networkStatus={networkStatus}
                                activeSection={settingsSection}
                                onSectionChange={setSettingsSection}
                                onIdentityUpdate={refreshData}
                                onLockSession={() => { setAuthenticated(false); goToChat(); }}
                            />
                        </Box>
                    ) : (
                        <>
                            <Sidebar
                                contacts={contacts}
                                groups={groups}
                                onSelectContact={setTargetUpeerId}
                                onSelectGroup={setActiveGroupId}
                                onDeleteContact={handleDeleteContact}
                                onClearChat={handleClearChat}
                                selectedId={targetUpeerId}
                                selectedGroupId={activeGroupId}
                                onAddContact={handleAddContact}
                                onShowMyIdentity={() => setIdentityModalOpen(true)}
                                onCreateGroup={handleCreateGroup}
                                onLeaveGroup={handleLeaveGroup}
                                typingStatus={typingStatus}
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
                                                isAdmin={activeGroup?.adminUpeerId === myIdentity?.upeerId}
                                                groupId={activeGroupId}
                                                onUpdateGroup={(fields) => handleUpdateGroup(activeGroupId, fields)}
                                                onDelete={() => handleLeaveGroup(activeGroupId)}
                                            />
                                        ) : (
                                            <TopHeader
                                                contactName={activeContact?.name}
                                                avatar={activeContactAvatar}
                                                isOnline={!!isOnline}
                                                isTyping={!!typingStatus[targetUpeerId]}
                                                status={activeContact?.status}
                                                lastSeen={activeContact?.lastSeen}
                                                vouchScore={(activeContact as any)?.vouchScore}
                                                onDelete={handleDeleteContact}
                                                onShare={() => setShareModalOpen(true)}
                                                onAccept={isIncomingRequest ? undefined : handleAcceptContact}
                                                onShowSecurity={() => setSecurityModalOpen(true)}
                                            />
                                        )}

                                        {isIncomingRequest ? (
                                            <IncomingRequestChat
                                                contactName={activeContact?.name}
                                                avatar={activeContactAvatar}
                                                receivedAt={incomingRequests[targetUpeerId]?.receivedAt}
                                                onAccept={handleAcceptContact}
                                                onReject={() => handleBlockContact()}
                                                untrustworthyInfo={untrustworthyInfo}
                                                vouchScore={(activeContact as any)?.vouchScore}
                                            />
                                        ) : (
                                            <Box onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop} sx={{ display: 'flex', flexDirection: 'column', flexGrow: 1, position: 'relative', overflow: 'hidden' }}>
                                                <Box sx={{ flexGrow: 1, position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column', width: '100%', minWidth: 0 }}>
                                                    <ChatArea
                                                        key={activeGroupId || targetUpeerId}
                                                        chatHistory={activeGroupId ? groupChatHistory : chatHistory}
                                                        isGroup={!!activeGroupId}
                                                        myIp={networkAddress || ''}
                                                        contacts={contacts.map((c: Contact) => ({ address: c.address, name: c.name }))}
                                                        onReply={(msg: any) => setReplyToMessage(activeGroupId || targetUpeerId, msg)}
                                                        onReact={handleReaction}
                                                        onEdit={(msg: any) => { setEditingMessage(msg); setMessage(activeGroupId || targetUpeerId, msg.message); }}
                                                        onDelete={handleDeleteMessage}
                                                        onRetryTransfer={async (fileId) => { await fileTransfer.retryTransfer(fileId); }}
                                                        onCancelTransfer={(fileId) => fileTransfer.cancelTransfer(fileId, 'User cancelled')}
                                                        onMediaClick={handleMediaClick}
                                                        activeTransfers={activeGroupId ? [] : fileTransfer.allTransfers.filter(t => t.upeerId === targetUpeerId)}
                                                        onTransferStateChange={updateFileTransferMessage}
                                                    />
                                                </Box>
                                                <InputArea
                                                    message={message}
                                                    setMessage={(val) => setMessage(activeGroupId || targetUpeerId, val)}
                                                    onSend={editingMessage
                                                        ? () => { handleUpdateMessage(editingMessage.id!, message); setEditingMessage(null); }
                                                        : (activeGroupId ? () => handleSendGroupMessage(message) : handleSend)
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
                                                    onCancelEdit={() => { setEditingMessage(null); setMessage(activeGroupId || targetUpeerId, ''); }}
                                                    onScrollToMessage={handleScrollToMessage}
                                                />

                                                {(isFilePickerOpen || isDragging) && (
                                                    <FilePreviewOverlay
                                                        files={pendingFiles}
                                                        isDragging={isDragging}
                                                        vouchScore={(activeContact as any)?.vouchScore}
                                                        onDragOver={handleDragOver}
                                                        onDragLeave={handleDragLeave}
                                                        onDrop={handleDrop}
                                                        onClose={() => { setPendingFiles([]); setFilePickerOpen(false); setIsDragging(false); }}
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
                                        <Box
                                            component="img"
                                            src="/logo.svg"
                                            sx={{
                                                width: 120,
                                                height: 120,
                                                mb: 4
                                            }}
                                        />
                                        <Typography level="h2" sx={{ mb: 1, fontWeight: 700, opacity: 0.5 }}>Bienvenido a uPeer</Typography>
                                        <Typography level="body-lg" sx={{ color: 'neutral.500', maxWidth: 400, mx: 'auto', mb: 4 }}>Selecciona un contacto para comenzar a chatear. Conectividad sin intermediarios, y encriptado de extremo a extremo.</Typography>
                                        <Box sx={{ position: 'absolute', bottom: 32, display: 'flex', alignItems: 'center', gap: 1 }}>
                                            <Typography level="body-xs" color="neutral">uPeer - v1.0.0</Typography>
                                        </Box>
                                    </Box>
                                )}
                            </Box>

                            <AddContactModal open={isAddModalOpen} onClose={() => setAddModalOpen(false)} onAdd={handleAddContact} />
                            <IdentityModal open={isIdentityModalOpen} onClose={() => setIdentityModalOpen(false)} identity={myIdentity} />
                            <ShareContactModal open={isShareModalOpen} onClose={() => setShareModalOpen(false)} contacts={contacts} onShare={(contact) => { if (targetUpeerId) window.upeer.sendContactCard(targetUpeerId, contact); }} />

                            {isSecurityModalOpen && activeContact && (
                                <SecurityModal 
                                    open={isSecurityModalOpen} 
                                    onClose={() => setSecurityModalOpen(false)} 
                                    contactName={activeContact.name} 
                                    contactPublicKey={activeContact.publicKey || ''} 
                                    myPublicKey={myIdentity?.publicKey || ''} 
                                    knownAddresses={activeContact.knownAddresses}
                                />
                            )}

                            <CreateGroupModal open={isCreateGroupModalOpen} onClose={() => setCreateGroupModalOpen(false)} contacts={contacts} onCreate={handleCreateGroup} />

                            {viewerMediaList.length > 0 && (
                                <MediaViewerOverlay
                                    items={viewerMediaList}
                                    initialIndex={viewerInitialIndex}
                                    onClose={() => closeMediaViewer()}
                                    onDownload={async (item: any) => {
                                        const result = await window.upeer.showSaveDialog({ defaultPath: item.fileName });
                                        if (!result.canceled && result.filePath) await window.upeer.saveTransferredFile(item.fileId, result.filePath);
                                    }}
                                    onReply={(item: any) => {
                                        const currentHistory = activeGroupId ? groupChatHistory : chatHistory;
                                        const msg = currentHistory.find(m => m.id === item.messageId);
                                        if (msg) setReplyToMessage(activeGroupId || targetUpeerId, msg);
                                        closeMediaViewer();
                                    }}
                                    onReact={(item: any, emoji: string) => { if (item.messageId) handleReaction(item.messageId, emoji, false); }}
                                    onForward={(item: any) => console.log('Forwarding', item)}
                                    onGoToMessage={(item: any) => {
                                        if (item.messageId) {
                                            closeMediaViewer();
                                            setTimeout(() => handleScrollToMessage(item.messageId), 200);
                                        }
                                    }}
                                />
                            )}
                        </>
                    )}
                </Sheet>
            )}

            {isAuthenticated === true && (
                <YggstackSplash networkStatus={networkStatus} isFirstConnect={isFirstConnect} address={yggAddress} />
            )}
        </CssVarsProvider>
    );
}
