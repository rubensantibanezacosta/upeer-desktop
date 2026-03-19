import React from 'react';
import { Box, Typography } from '@mui/joy';
import { TopHeader } from './TopHeader.js';
import { IncomingRequestChat } from '../../features/chat/IncomingRequestChat.js';
import { ChatArea } from '../../features/chat/ChatArea.js';
import { InputArea } from '../../features/chat/input/InputArea.js';
import { FilePreviewOverlay } from '../../features/chat/file-preview/FilePreviewOverlay.js';
import { MediaViewerOverlay } from '../../features/chat/media-viewer/MediaViewerOverlay.js';

interface ChatSectionProps {
    targetUpeerId: string;
    activeGroupId: string;
    activeContact: any;
    activeGroup: any;
    chatStore: any;
    appStore: any;
    navigation: any;
    message: string;
    setMessage: (val: string) => void;
    editingMessage: any;
    setEditingMessage: (msg: any) => void;
    isIncomingRequest: boolean;
    handleAcceptContact: () => void;
    handleDeleteContact: () => void;
    handleBlockContact: () => void;
    handleDragOver: (e: React.DragEvent) => void;
    handleDragLeave: (e: React.DragEvent) => void;
    handleDrop: (e: React.DragEvent) => void;
    setReplyToMessage: (id: string, msg: any) => void;
    handleReaction: (id: string, emoji: string, isGroup: boolean) => void;
    handleUpdateMessage: (id: string, msg: string) => void;
    handleDeleteMessage: (id: string) => void;
    fileTransfer: any;
    handleMediaClick: (media: any) => void;
    handleSendGroupMessage: () => void;
    handleSend: () => void;
    handleTyping: () => void;
    handleAttachFile: (type: any) => void;
    currentReplyToMessage: any;
    handleScrollToMessage: (id: string) => void;
    isFilePickerOpen: boolean;
    setFilePickerOpen: (open: boolean) => void;
    pendingFiles: any[];
    setPendingFiles: (files: any[]) => void;
    handleFileSubmit: (files: any[], thumbnails?: any[], captions?: any[]) => void;
    isDragging: boolean;
}

export const ChatSection: React.FC<ChatSectionProps> = ({
    targetUpeerId, activeGroupId, activeContact, activeGroup, chatStore, appStore, navigation,
    message, setMessage, editingMessage, setEditingMessage, isIncomingRequest,
    handleAcceptContact, handleDeleteContact, handleBlockContact,
    handleDragOver, handleDragLeave, handleDrop,
    setReplyToMessage, handleReaction, handleUpdateMessage, handleDeleteMessage,
    fileTransfer, handleMediaClick, handleSendGroupMessage, handleSend, handleTyping, handleAttachFile,
    currentReplyToMessage, handleScrollToMessage,
    isFilePickerOpen, setFilePickerOpen, pendingFiles, setPendingFiles, handleFileSubmit, isDragging
}) => {
    const activeContactAvatar = activeContact?.avatar || chatStore.incomingRequests[targetUpeerId]?.avatar;
    const untrustworthyInfo = chatStore.untrustworthyAlerts[targetUpeerId] || chatStore.incomingRequests[targetUpeerId]?.untrustworthy;

    return (
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
                            onUpdateGroup={(fields: any) => chatStore.handleUpdateGroup(activeGroupId, fields)}
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
                            onDelete={handleDeleteContact}
                            onShare={() => navigation.setShareModalOpen(true)}
                            onAccept={isIncomingRequest ? undefined : handleAcceptContact}
                            onShowSecurity={() => navigation.setSecurityModalOpen(true)}
                        />
                    )}

                    {isIncomingRequest ? (
                        <IncomingRequestChat
                            contactName={activeContact?.name}
                            avatar={activeContactAvatar}
                            receivedAt={chatStore.incomingRequests[targetUpeerId]?.receivedAt}
                            onAccept={handleAcceptContact}
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
        </Box>
    );
};
