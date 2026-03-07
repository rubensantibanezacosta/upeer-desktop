import React, { useState, useEffect } from 'react';
import { CssVarsProvider, Sheet, Box, Typography, Snackbar, Stack, IconButton } from '@mui/joy';
import { Sidebar } from './components/layout/Sidebar.js';
import { ChatArea } from './components/chat/ChatArea.js';
import { IncomingRequestChat } from './components/chat/IncomingRequestChat.js';
import { TopHeader } from './components/layout/TopHeader.js';
import { InputArea } from './components/chat/InputArea.js';
import { AddContactModal } from './components/modals/AddContactModal.js';
import { NavigationRail } from './components/layout/NavigationRail.js';
import { IdentityModal } from './components/modals/IdentityModal.js';
import { ShareContactModal } from './components/modals/ShareContactModal.js';
import { SecurityModal } from './components/modals/SecurityModal.js';
import ShutterSpeedIcon from '@mui/icons-material/ShutterSpeed';
import WarningIcon from '@mui/icons-material/Warning';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import { useChatState } from './hooks/useChatState.js';
import { AttachmentType } from './components/chat/AttachmentButton.js';
import { useFileTransfer } from './hooks/useFileTransfer.js';
import type { FileTransfer as FileTransferType } from './hooks/useFileTransfer.js';
import { FilePreviewOverlay } from './components/chat/FilePreviewOverlay.js';
import { TransferProgressBar } from './components/chat/TransferProgressBar.js';
import type { Contact } from './types/chat.js';

export default function App() {
    const {
        networkAddress,
        targetRevelnestId,
        setTargetRevelnestId,
        message,
        setMessage,
        chatHistory,
        contacts,
        typingStatus,
        replyToMessage,
        setReplyToMessage,
        editingMessage,
        setEditingMessage,
        myIdentity,
        handleSend,
        handleTyping,
        handleReaction,
        handleUpdateMessage,
        handleDeleteMessage,
        addFileTransferMessage,
        updateFileTransferMessage,
        handleAddContact,
        handleAcceptContact,
        handleDeleteContact,
        incomingRequests,
        untrustworthyAlert,
        untrustworthyAlerts,
        clearUntrustworthyAlert,
    } = useChatState();

    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [isIdentityModalOpen, setIsIdentityModalOpen] = useState(false);
    const [isShareModalOpen, setIsShareModalOpen] = useState(false);
    const [isSecurityModalOpen, setIsSecurityModalOpen] = useState(false);

    // File transfer state
    const fileTransfer = useFileTransfer();
    const [isFilePickerOpen, setIsFilePickerOpen] = useState(false);
    const [isTransfersExpanded, setIsTransfersExpanded] = useState(false);
    const [pendingFiles, setPendingFiles] = useState<{ path: string; name: string; size: number; type: string; lastModified: number }[]>([]);
    const [isDragging, setIsDragging] = useState(false);

    console.log('App Rendering - isFilePickerOpen:', isFilePickerOpen, 'pendingFiles count:', pendingFiles.length, 'target:', targetRevelnestId);

    // File transfer handlers
    const handleAttachFile = async (type: AttachmentType) => {
        if (!targetRevelnestId) return;

        // Map internal attachment types to filters
        let filters: any[] = [];
        let title = 'Seleccionar archivo';

        switch (type) {
            case 'image':
                title = 'Seleccionar imagen';
                filters = [{ name: 'Imágenes', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp'] }];
                break;
            case 'video':
                title = 'Seleccionar video';
                filters = [{ name: 'Videos', extensions: ['mp4', 'mov', 'avi', 'mkv'] }];
                break;
            case 'audio':
                title = 'Seleccionar audio';
                filters = [{ name: 'Audio', extensions: ['mp3', 'wav', 'ogg', 'flac'] }];
                break;
            case 'document':
                title = 'Seleccionar documento';
                filters = [{ name: 'Documentos', extensions: ['pdf', 'doc', 'docx', 'txt', 'rtf'] }];
                break;
            default:
                filters = [{ name: 'Todos los archivos', extensions: ['*'] }];
        }

        try {
            const result = await window.revelnest.openFileDialog({
                title,
                filters,
                multiSelect: true
            });

            if (result.success && !result.canceled && result.files && result.files.length > 0) {
                console.log('Files selected via native dialog:', result.files.length);
                setPendingFiles(prev => [...prev, ...(result.files || [])]);
                setIsFilePickerOpen(true);
            }
        } catch (error) {
            console.error('Error opening native file dialog:', error);
        }
    };

    const handleFileSubmit = async (files: { path: string; name: string; size: number; type: string; lastModified: number }[], thumbnails?: (string | undefined)[], captions?: string[]) => {
        if (!targetRevelnestId) return;
        console.log('Submitting', files.length, 'files to', targetRevelnestId);

        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const thumbnail = thumbnails ? thumbnails[i] : undefined;
            const caption = captions ? captions[i] : undefined;

            try {
                const result = await fileTransfer.startTransfer({
                    revelnestId: targetRevelnestId,
                    filePath: file.path,
                    thumbnail // Pass thumbnail if available
                });

                console.log('Start transfer result for', file.name, ':', result);
                if (result.success && result.fileId) {
                    // Add a file transfer message to the chat
                    const tempHash = `pending-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
                    addFileTransferMessage(
                        targetRevelnestId,
                        result.fileId,
                        file.name,
                        file.size,
                        file.type,
                        tempHash,
                        thumbnail || '',
                        caption || '',
                        true
                    );
                } else {
                    console.error('Failed to start transfer for', file.name, ':', result.error);
                }
            } catch (error) {
                console.error('Error starting file transfer for', file.name, ':', error);
            }
        }

        setIsFilePickerOpen(false);
        setPendingFiles([]);
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (!targetRevelnestId || activeContact?.status !== 'connected') return;
        setIsDragging(true);
    };

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        // Only trigger dragleave if we are actually leaving the container, not just hovering over a child element
        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
            setIsDragging(false);
        }
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);

        if (!targetRevelnestId || activeContact?.status !== 'connected') return;

        // In Electron 30+, File objects hide the path property. 
        // We use the webUtils.getPathForFile helper exposed in preload.ts
        const droppedFilesRaw = Array.from(e.dataTransfer.files);

        const mappedFiles = droppedFilesRaw.map((f: any) => {
            const filePath = window.revelnest?.getPathForFile ? window.revelnest.getPathForFile(f) : f.path;
            return {
                path: filePath,
                name: f.name,
                size: f.size,
                type: f.type || 'application/octet-stream',
                lastModified: f.lastModified
            };
        }).filter((f: any) => !!f.path);

        if (mappedFiles.length > 0) {

            // We append dropped files to pendingFiles to support dropping multiple times
            setPendingFiles(prev => {
                const newFiles = [...prev];
                mappedFiles.forEach(mf => {
                    if (!newFiles.some(pf => pf.path === mf.path)) {
                        newFiles.push(mf);
                    }
                });
                return newFiles;
            });
            setIsFilePickerOpen(true);
        }
    };

    const handleCancelTransfer = async (fileId: string) => {
        await fileTransfer.cancelTransfer(fileId, 'User cancelled');
    };

    // Setup file transfer event listeners
    useEffect(() => {
        // Listen for transfer started - handled by useFileTransfer hook
        // window.revelnest.onFileTransferStarted((data: any) => {
        //     console.log('File transfer started:', data);
        // });

        // Listen for transfer completion
        window.revelnest.onFileTransferCompleted((data: any) => {
            console.log('File transfer completed event in App:', data);
            if (data.fileId) {
                updateFileTransferMessage(data.fileId, {
                    fileHash: data.fileHash,
                    transferState: 'completed'
                });
            }
        });

        window.revelnest.onFileTransferCancelled((data: any) => {
            console.log('File transfer cancelled event in App:', data);
            if (data.fileId) {
                updateFileTransferMessage(data.fileId, {
                    transferState: 'cancelled'
                });
            }
        });

        window.revelnest.onFileTransferFailed((data: any) => {
            console.log('File transfer failed event in App:', data);
            if (data.fileId) {
                updateFileTransferMessage(data.fileId, {
                    transferState: 'failed'
                });
            }
        });

        // Cleanup listeners
        return () => {
            // Note: The API doesn't provide a way to remove specific listeners,
            // but the preload script removes all listeners on each call
        };
    }, [addFileTransferMessage, updateFileTransferMessage]);

    const activeContact = contacts.find((c: Contact) => c.revelnestId === targetRevelnestId);
    const isOnline = activeContact?.lastSeen && (new Date().getTime() - new Date(activeContact.lastSeen).getTime()) < 65000;
    const isIncomingRequest = activeContact?.status === 'incoming';
    const untrustworthyInfo = untrustworthyAlerts[targetRevelnestId] || incomingRequests[targetRevelnestId]?.untrustworthy;

    return (
        <CssVarsProvider defaultMode="dark">
            <Sheet sx={{ display: 'flex', height: '100vh', width: '100vw', backgroundColor: 'background.body', overflow: 'hidden', position: 'relative' }}>
                <NavigationRail myIp={networkAddress} />
                <Sidebar
                    contacts={contacts}
                    onSelectContact={(id) => setTargetRevelnestId(id)}
                    onDeleteContact={handleDeleteContact}
                    selectedId={targetRevelnestId}
                    onAddNew={() => setIsAddModalOpen(true)}
                    onShowMyIdentity={() => setIsIdentityModalOpen(true)}
                    typingStatus={typingStatus}
                />

                <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', height: '100%', minWidth: 0, backgroundColor: 'background.body', position: 'relative', overflow: 'hidden' }}>
                    {targetRevelnestId ? (
                        <>
                            <TopHeader
                                contactName={activeContact?.name}
                                isOnline={!!isOnline}
                                isTyping={!!typingStatus[targetRevelnestId]}
                                status={activeContact?.status}
                                lastSeen={activeContact?.lastSeen}
                                onDelete={handleDeleteContact}
                                onShare={() => setIsShareModalOpen(true)}
                                onAccept={isIncomingRequest ? undefined : handleAcceptContact}
                                onShowSecurity={() => setIsSecurityModalOpen(true)}
                            />


                            {isIncomingRequest ? (
                                <IncomingRequestChat
                                    contactName={activeContact?.name}
                                    onAccept={handleAcceptContact}
                                    untrustworthyInfo={untrustworthyInfo}
                                />
                            ) : (
                                <Box
                                    onDragOver={handleDragOver}
                                    onDragLeave={handleDragLeave}
                                    onDrop={handleDrop}
                                    sx={{ display: 'flex', flexDirection: 'column', flexGrow: 1, position: 'relative', overflow: 'hidden' }}
                                >

                                    <Box sx={{ flexGrow: 1, position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column', width: '100%', minWidth: 0 }}>
                                        <ChatArea
                                            chatHistory={chatHistory}
                                            myIp={networkAddress || ''}
                                            contacts={contacts.map((c: Contact) => ({ address: c.address, name: c.name }))}
                                            onReply={(msg: any) => setReplyToMessage(msg)}
                                            onReact={handleReaction}
                                            onEdit={(msg: any) => {
                                                setEditingMessage(msg);
                                                setMessage(msg.message);
                                            }}
                                            onDelete={handleDeleteMessage}
                                            activeTransfers={fileTransfer.allTransfers.filter(t => t.revelnestId === targetRevelnestId)}
                                        />
                                    </Box>
                                    <InputArea
                                        message={message}
                                        setMessage={setMessage}
                                        onSend={editingMessage ? () => handleUpdateMessage(editingMessage.id!, message) : handleSend}
                                        onTyping={handleTyping}
                                        onAttachFile={handleAttachFile}
                                        disabled={!targetRevelnestId || activeContact?.status !== 'connected'}
                                        replyToMessage={replyToMessage}
                                        onCancelReply={() => setReplyToMessage(null)}
                                        editingMessage={editingMessage}
                                        onCancelEdit={() => {
                                            setEditingMessage(null);
                                            setMessage('');
                                        }}
                                    />

                                    {(isFilePickerOpen || isDragging) && (
                                        <FilePreviewOverlay
                                            files={pendingFiles}
                                            isDragging={isDragging}
                                            onDragOver={handleDragOver}
                                            onDragLeave={handleDragLeave}
                                            onDrop={handleDrop}
                                            onClose={() => {
                                                setPendingFiles([]);
                                                setIsFilePickerOpen(false);
                                                setIsDragging(false);
                                            }}
                                            onSend={handleFileSubmit}
                                            onAddMore={() => handleAttachFile('any')}
                                            onRemove={(index: number) => {
                                                const newFiles = [...pendingFiles];
                                                newFiles.splice(index, 1);
                                                setPendingFiles(newFiles);
                                                if (newFiles.length === 0) {
                                                    setIsFilePickerOpen(false);
                                                }
                                            }}
                                        />
                                    )}
                                </Box>
                            )}
                        </>
                    ) : (
                        <Box sx={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            height: '100%',
                            borderBottom: '6px solid',
                            borderColor: 'primary.main',
                            backgroundColor: 'background.surface',
                            textAlign: 'center',
                            p: 3
                        }}>
                            <Box sx={{
                                width: 120, height: 120,
                                backgroundColor: 'background.level1',
                                borderRadius: '50%',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', mb: 3
                            }}>
                                <ShutterSpeedIcon sx={{ fontSize: '64px', color: 'primary.main' }} />
                            </Box>
                            <Typography level="h3" sx={{ fontWeight: 600, mb: 1 }}>
                                RevelNest Mesh Chat
                            </Typography>
                            <Typography level="body-md" sx={{ maxWidth: 400, color: 'text.secondary' }}>
                                Conectividad USUARIO-USUARIO distribuida con Identidad Soberana. RevelNest ID asegura que tus comunicaciones sean privadas y verificadas.
                            </Typography>

                            <Box sx={{ position: 'absolute', bottom: 32, display: 'flex', alignItems: 'center', gap: 1 }}>
                                <Typography level="body-xs" color="neutral">RevelNest Protocol v1.0. Privacidad por diseño.</Typography>
                            </Box>
                        </Box>
                    )}
                </Box>

                <AddContactModal
                    open={isAddModalOpen}
                    onClose={() => setIsAddModalOpen(false)}
                    onAdd={handleAddContact}
                />
                <IdentityModal
                    open={isIdentityModalOpen}
                    onClose={() => setIsIdentityModalOpen(false)}
                    identity={myIdentity}
                />
                <ShareContactModal
                    open={isShareModalOpen}
                    onClose={() => setIsShareModalOpen(false)}
                    contacts={contacts}
                    onShare={(contact) => {
                        if (targetRevelnestId) {
                            window.revelnest.sendContactCard(targetRevelnestId, contact);
                        }
                    }}
                />

                {isSecurityModalOpen && activeContact && (
                    <SecurityModal
                        open={isSecurityModalOpen}
                        onClose={() => setIsSecurityModalOpen(false)}
                        contactName={activeContact.name}
                        contactPublicKey={activeContact.publicKey || ''}
                        myPublicKey={myIdentity?.publicKey || ''}
                    />
                )}

            </Sheet>
        </CssVarsProvider >
    );
}
