import React, { useState, useEffect } from 'react';
import { CssVarsProvider, Sheet, Box, Typography, Snackbar, Stack, IconButton } from '@mui/joy';
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
import ShutterSpeedIcon from '@mui/icons-material/ShutterSpeed';
import WarningIcon from '@mui/icons-material/Warning';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import { useChatState } from './hooks/useChatState.js';
import { useAppSetup } from './hooks/useAppSetup.js';
import { useNavigationStore } from './store/useNavigationStore.js';
import { AttachmentType } from './features/chat/input/index.js';
import { useFileTransfer } from './hooks/useFileTransfer.js';
import type { FileTransfer as FileTransferType } from './hooks/useFileTransfer.js';
import { FilePreviewOverlay } from './features/chat/file-preview/index.js';
import { TransferProgressBar } from './features/chat/file/index.js';
import type { Contact, Group } from './types/chat.js';
import { useGroupState } from './hooks/useGroupState.js';
import { CreateGroupModal } from './components/ui/CreateGroupModal.js';

export default function App() {
    // null = comprobando, false = no autenticado, true = autenticado
    const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);

    // Estado de la red Yggdrasil
    const [networkStatus, setNetworkStatus] = useState<YggNetworkStatus>('connecting');
    const [isFirstConnect, setIsFirstConnect] = useState(true);   // true hasta el primer 'up'
    const [yggAddress, setYggAddress] = useState<string | undefined>(undefined);

    useEffect(() => {
        // Consulta inmediata: sidecar ya en marcha (recarga del renderer)
        window.upeer.getMyNetworkAddress().then((addr: string) => {
            if (addr && addr !== 'No detectado') {
                setYggAddress(addr);
                setNetworkStatus('up');
                setIsFirstConnect(false);
            }
        });
        // Evento de dirección (primera detección de IPv6)
        window.upeer.onYggstackAddress((addr: string) => {
            setYggAddress(addr);
        });
        // Eventos de estado de red
        window.upeer.onYggstackStatus((status: string, addr?: string) => {
            const s = status as YggNetworkStatus;
            setNetworkStatus(s);
            if (s === 'up') {
                setIsFirstConnect(false);
                if (addr) setYggAddress(addr);
            }
        });
    }, []);
    const {
        appView,
        settingsSection,
        toggleSettings,
        goToSettings,
        goToChat,
        setSettingsSection,
    } = useNavigationStore();

    // Comprobar sesión al arrancar: si el backend tiene la sesión auto-restaurada,
    // pasar directamente a la app sin mostrar la pantalla de login.
    useEffect(() => {
        window.upeer.identityStatus().then((status: any) => {
            if (!status.isLocked) {
                setIsAuthenticated(true);
            } else {
                setIsAuthenticated(false);
            }
        }).catch(() => {
            setIsAuthenticated(false);
        });
    }, []);

    const {
        networkAddress,
        targetUpeerId,
        setTargetUpeerId,
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
        handleBlockContact,
        incomingRequests,
        untrustworthyAlert,
        untrustworthyAlerts,
        clearUntrustworthyAlert,
        refreshData,
    } = useChatState();

    // Group state
    const {
        groups,
        groupChatHistory,
        activeGroupId,
        setActiveGroupId,
        handleSendGroupMessage,
        handleCreateGroup,
        handleUpdateGroup,
        handleLeaveGroup,
        refreshGroups
    } = useGroupState(myIdentity?.upeerId);

    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [isIdentityModalOpen, setIsIdentityModalOpen] = useState(false);
    const [isShareModalOpen, setIsShareModalOpen] = useState(false);
    const [isSecurityModalOpen, setIsSecurityModalOpen] = useState(false);
    const [isCreateGroupModalOpen, setIsCreateGroupModalOpen] = useState(false);

    // File transfer state
    // BUG DT fix: se pasa updateFileTransferMessage como callback a useFileTransfer para
    // que los eventos completed/cancelled/failed actualicen tanto el panel de transferencias
    // como el mensaje del chat desde un único punto de registro de listeners.
    const fileTransfer = useFileTransfer(updateFileTransferMessage);
    const [isFilePickerOpen, setIsFilePickerOpen] = useState(false);
    const [isTransfersExpanded, setIsTransfersExpanded] = useState(false);
    const [pendingFiles, setPendingFiles] = useState<{ path: string; name: string; size: number; type: string; lastModified: number }[]>([]);
    const [isDragging, setIsDragging] = useState(false);

    // File transfer handlers
    const handleAttachFile = async (type: AttachmentType) => {
        if (!targetUpeerId) return;

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
            const result = await window.upeer.openFileDialog({
                title,
                filters,
                multiSelect: true
            });

            if (result.success && !result.canceled && result.files && result.files.length > 0) {
                setPendingFiles(prev => [...prev, ...(result.files || [])]);
                setIsFilePickerOpen(true);
            }
        } catch (error) {
            console.error('Error opening native file dialog:', error);
        }
    };

    const handleFileSubmit = async (files: { path: string; name: string; size: number; type: string; lastModified: number }[], thumbnails?: (string | undefined)[], captions?: string[]) => {
        if (!targetUpeerId) return;

        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const thumbnail = thumbnails ? thumbnails[i] : undefined;
            const caption = captions ? captions[i] : undefined;

            try {
                const result = await fileTransfer.startTransfer({
                    upeerId: targetUpeerId,
                    filePath: file.path,
                    thumbnail // Pass thumbnail if available
                });

                if (result.success && result.fileId) {
                    // Add a file transfer message to the chat
                    const tempHash = `pending-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
                    addFileTransferMessage(
                        targetUpeerId,
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
        if (!targetUpeerId || activeContact?.status !== 'connected') return;
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

        if (!targetUpeerId || activeContact?.status !== 'connected') return;

        // In Electron 30+, File objects hide the path property. 
        // We use the webUtils.getPathForFile helper exposed in preload.ts
        const droppedFilesRaw = Array.from(e.dataTransfer.files);

        const mappedFiles = droppedFilesRaw.map((f: any) => {
            const filePath = window.upeer?.getPathForFile ? window.upeer.getPathForFile(f) : f.path;
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

    const activeContact = contacts.find((c: Contact) => c.upeerId === targetUpeerId);
    const isOnline = activeContact?.lastSeen && (new Date().getTime() - new Date(activeContact.lastSeen).getTime()) < 65000;
    const isIncomingRequest = activeContact?.status === 'incoming';
    const untrustworthyInfo = untrustworthyAlerts[targetUpeerId] || incomingRequests[targetUpeerId]?.untrustworthy;
    // Avatar: preferir el de la BD (activeContact), si no hay aún, el que llegó en el evento
    const activeContactAvatar = activeContact?.avatar || incomingRequests[targetUpeerId]?.avatar;

    return (
        <CssVarsProvider defaultMode="dark">
            {/* ── Comprobando sesión ── */}
            {isAuthenticated === null && (
                <Box sx={{
                    height: '100vh', width: '100vw',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    backgroundColor: 'background.body',
                }}>
                    <Box sx={{
                        width: 36, height: 36,
                        border: '3px solid', borderColor: 'primary.500',
                        borderTopColor: 'transparent',
                        borderRadius: '50%',
                        animation: 'spin 0.8s linear infinite',
                        '@keyframes spin': { to: { transform: 'rotate(360deg)' } },
                    }} />
                </Box>
            )}

            {/* ── Login Gate ── */}
            {isAuthenticated === false && (
                <LoginScreen onUnlocked={() => {
                    setIsAuthenticated(true);
                    // Forzar refresco para obtener el estado limpio tras posible cambio de cuenta
                    refreshData();
                    refreshGroups();
                }} />
            )}

            {/* ── Main App (hidden until authenticated) ── */}
            <Sheet sx={{
                display: isAuthenticated === true ? 'flex' : 'none',
                height: '100vh', width: '100vw',
                backgroundColor: 'background.body',
                overflow: 'hidden',
                position: 'relative'
            }}>
                <NavigationRail
                    myIp={networkAddress}
                    myAvatar={myIdentity?.avatar}
                    myInitial={(myIdentity?.alias || myIdentity?.upeerId || '?').charAt(0).toUpperCase()}
                    activeView={appView}
                    onOpenSettings={() => toggleSettings()}
                    onOpenIdentity={() => goToSettings('perfil')}
                />

                {/* ── Settings View ── */}
                {appView === 'settings' ? (
                    <Box sx={{ flexGrow: 1, display: 'flex', height: '100%', overflow: 'hidden' }}>
                        <SettingsPanel
                            identity={myIdentity}
                            networkAddress={networkAddress}
                            networkStatus={networkStatus}
                            activeSection={settingsSection}
                            onSectionChange={setSettingsSection}
                            onIdentityUpdate={refreshData}
                            onLockSession={() => {
                                setIsAuthenticated(false);
                                goToChat();
                            }}
                        />
                    </Box>
                ) : (
                    <>
                        <Sidebar
                            contacts={contacts}
                            groups={groups}
                            onSelectContact={(id) => {
                                setTargetUpeerId(id);
                                setActiveGroupId('');
                            }}
                            onSelectGroup={(groupId) => {
                                setActiveGroupId(groupId);
                                setTargetUpeerId('');
                            }}
                            onDeleteContact={handleDeleteContact}
                            selectedId={targetUpeerId}
                            selectedGroupId={activeGroupId}
                            onAddContact={handleAddContact}
                            onShowMyIdentity={() => setIsIdentityModalOpen(true)}
                            onCreateGroup={async (name, memberIds, avatar) => {
                                setTargetUpeerId('');
                                return handleCreateGroup(name, memberIds, avatar);
                            }}
                            onLeaveGroup={handleLeaveGroup}
                            typingStatus={typingStatus}
                        />

                        <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', height: '100%', minWidth: 0, backgroundColor: 'background.body', position: 'relative', overflow: 'hidden' }}>
                            {(targetUpeerId || activeGroupId) ? (
                                <>
                                    {activeGroupId ? (
                                        <TopHeader
                                            contactName={groups.find(g => g.groupId === activeGroupId)?.name}
                                            isGroup={true}
                                            avatar={groups.find(g => g.groupId === activeGroupId)?.avatar || undefined}
                                            memberCount={groups.find(g => g.groupId === activeGroupId)?.members.length}
                                            isAdmin={groups.find(g => g.groupId === activeGroupId)?.adminUpeerId === myIdentity?.upeerId}
                                            groupId={activeGroupId}
                                            onUpdateGroup={(fields) => handleUpdateGroup(activeGroupId, fields)}
                                            onDelete={() => { }} // TODO: Leave group
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
                                            onShare={() => setIsShareModalOpen(true)}
                                            onAccept={isIncomingRequest ? undefined : handleAcceptContact}
                                            onShowSecurity={() => setIsSecurityModalOpen(true)}
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
                                        <Box
                                            onDragOver={handleDragOver}
                                            onDragLeave={handleDragLeave}
                                            onDrop={handleDrop}
                                            sx={{ display: 'flex', flexDirection: 'column', flexGrow: 1, position: 'relative', overflow: 'hidden' }}
                                        >

                                            <Box sx={{ flexGrow: 1, position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column', width: '100%', minWidth: 0 }}>
                                                <ChatArea
                                                    key={activeGroupId || targetUpeerId}
                                                    chatHistory={activeGroupId ? groupChatHistory : chatHistory}
                                                    isGroup={!!activeGroupId}
                                                    myIp={networkAddress || ''}
                                                    contacts={contacts.map((c: Contact) => ({ address: c.address, name: c.name }))}
                                                    onReply={(msg: any) => setReplyToMessage(msg)}
                                                    onReact={handleReaction}
                                                    onEdit={(msg: any) => {
                                                        setEditingMessage(msg);
                                                        setMessage(msg.message);
                                                    }}
                                                    onDelete={handleDeleteMessage}
                                                    activeTransfers={activeGroupId ? [] : fileTransfer.allTransfers.filter(t => t.upeerId === targetUpeerId)}
                                                />
                                            </Box>
                                            <InputArea
                                                message={message}
                                                setMessage={setMessage}
                                                onSend={editingMessage
                                                    ? () => handleUpdateMessage(editingMessage.id!, message)
                                                    : (activeGroupId
                                                        ? async () => { await handleSendGroupMessage(message); setMessage(''); }
                                                        : handleSend)
                                                }
                                                onTyping={handleTyping}
                                                onAttachFile={handleAttachFile}
                                                disabled={(activeGroupId ? false : !targetUpeerId) || (targetUpeerId ? activeContact?.status !== 'connected' : false)}
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
                                        uPeer
                                    </Typography>
                                    <Typography level="body-md" sx={{ maxWidth: 400, color: 'text.secondary' }}>
                                        Conectividad sin intermediarios, y encriptado de extremo a extremo.
                                    </Typography>

                                    <Box sx={{ position: 'absolute', bottom: 32, display: 'flex', alignItems: 'center', gap: 1 }}>
                                        <Typography level="body-xs" color="neutral">uPeer - v1.0.0</Typography>
                                    </Box>
                                </Box>
                            )}
                        </Box>
                    </>
                )}

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
                        if (targetUpeerId) {
                            window.upeer.sendContactCard(targetUpeerId, contact);
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

                <CreateGroupModal
                    open={isCreateGroupModalOpen}
                    onClose={() => setIsCreateGroupModalOpen(false)}
                    contacts={contacts}
                    onCreate={handleCreateGroup}
                />

            </Sheet>

            {/* ── Splash de warmup de yggstack (overlay hasta que la red esté lista) ── */}
            {isAuthenticated === true && (
                <YggstackSplash
                    networkStatus={networkStatus}
                    isFirstConnect={isFirstConnect}
                    address={yggAddress}
                />
            )}

        </CssVarsProvider>
    );
}
