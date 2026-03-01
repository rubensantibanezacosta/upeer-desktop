import React, { useState } from 'react';
import { CssVarsProvider, Sheet, Box, Typography } from '@mui/joy';
import { Sidebar } from './components/layout/Sidebar.js';
import { ChatArea } from './components/chat/ChatArea.js';
import { TopHeader } from './components/layout/TopHeader.js';
import { InputArea } from './components/chat/InputArea.js';
import { AddContactModal } from './components/modals/AddContactModal.js';
import { NavigationRail } from './components/layout/NavigationRail.js';
import { IdentityModal } from './components/modals/IdentityModal.js';
import { ShareContactModal } from './components/modals/ShareContactModal.js';
import { SecurityModal } from './components/modals/SecurityModal.js';
import ShutterSpeedIcon from '@mui/icons-material/ShutterSpeed';
import { useChatState } from './hooks/useChatState.js';

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
        handleAddContact,
        handleAcceptContact,
        handleDeleteContact,
    } = useChatState();

    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [isIdentityModalOpen, setIsIdentityModalOpen] = useState(false);
    const [isShareModalOpen, setIsShareModalOpen] = useState(false);
    const [isSecurityModalOpen, setIsSecurityModalOpen] = useState(false);

    const activeContact = contacts.find(c => c.revelnestId === targetRevelnestId);
    const isOnline = activeContact?.lastSeen && (new Date().getTime() - new Date(activeContact.lastSeen).getTime()) < 65000;

    return (
        <CssVarsProvider defaultMode="dark">
            <Sheet sx={{ display: 'flex', height: '100vh', width: '100vw', backgroundColor: 'background.body', overflow: 'hidden' }}>
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

                <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', height: '100%', backgroundColor: 'background.body' }}>
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
                                onAccept={handleAcceptContact}
                                onShowSecurity={() => setIsSecurityModalOpen(true)}
                            />
                            <ChatArea
                                chatHistory={chatHistory}
                                myIp={networkAddress || ''}
                                contacts={contacts.map(c => ({ address: c.address, name: c.name }))}
                                onReply={(msg: any) => setReplyToMessage(msg)}
                                onReact={handleReaction}
                                onEdit={(msg: any) => {
                                    setEditingMessage(msg);
                                    setMessage(msg.message);
                                }}
                                onDelete={handleDeleteMessage}
                            />
                            <InputArea
                                message={message}
                                setMessage={setMessage}
                                onSend={editingMessage ? () => handleUpdateMessage(editingMessage.id!, message) : handleSend}
                                onTyping={handleTyping}
                                disabled={!targetRevelnestId || activeContact?.status !== 'connected'}
                                replyToMessage={replyToMessage}
                                onCancelReply={() => setReplyToMessage(null)}
                                editingMessage={editingMessage}
                                onCancelEdit={() => {
                                    setEditingMessage(null);
                                    setMessage('');
                                }}
                            />
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
                                Conectividad P2P distribuida con Identidad Soberana. RevelNest ID asegura que tus comunicaciones sean privadas y verificadas.
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
        </CssVarsProvider>
    );
}
