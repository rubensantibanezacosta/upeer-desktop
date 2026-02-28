import React, { useEffect, useState } from 'react';
import { CssVarsProvider, Sheet, Box, Typography } from '@mui/joy';
import { Sidebar } from './components/Sidebar.js';
import { ChatArea } from './components/ChatArea.js';
import { TopHeader } from './components/TopHeader.js';
import { InputArea } from './components/InputArea.js';
import { AddContactModal } from './components/AddContactModal.js';
import { NavigationRail } from './components/NavigationRail.js';
import { IdentityModal } from './components/IdentityModal.js';
import { ShareContactModal } from './components/ShareContactModal.js';
import ShutterSpeedIcon from '@mui/icons-material/ShutterSpeed';

interface ChatMessage {
    id?: string;
    revelnestId: string;
    isMine: boolean;
    message: string;
    status: string;
    timestamp: string;
    replyTo?: string;
}

interface Contact {
    revelnestId: string;
    address: string;
    name: string;
    status: 'pending' | 'incoming' | 'connected';
    publicKey?: string;
    lastSeen?: string;
    lastMessage?: string;
    lastMessageTime?: string;
    lastMessageIsMine?: boolean;
    lastMessageStatus?: string;
}

export default function App() {
    const [networkAddress, setNetworkAddress] = useState<string>('');
    const [targetRevelnestId, setTargetRevelnestId] = useState('');
    const [message, setMessage] = useState('');
    const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
    const [contacts, setContacts] = useState<Contact[]>([]);
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [isIdentityModalOpen, setIsIdentityModalOpen] = useState(false);
    const [isShareModalOpen, setIsShareModalOpen] = useState(false);
    const [typingStatus, setTypingStatus] = useState<Record<string, NodeJS.Timeout>>({});
    const [replyToMessage, setReplyToMessage] = useState<ChatMessage | null>(null);
    const [myIdentity, setMyIdentity] = useState<{ address: string | null, revelnestId: string, publicKey: string } | null>(null);

    const [incomingRequests, setIncomingRequests] = useState<Record<string, string>>({});

    const refreshContacts = () => {
        window.revelnest.getContacts().then(setContacts);
    };

    useEffect(() => {
        window.revelnest.getMyNetworkAddress().then(setNetworkAddress);
        window.revelnest.getMyIdentity().then(setMyIdentity);
        refreshContacts();

        window.revelnest.onReceive((data: any) => {
            refreshContacts();
            setChatHistory(prev => {
                if (data.revelnestId === targetRevelnestId) {
                    if (data.id) window.revelnest.sendReadReceipt(targetRevelnestId, data.id);
                    return [...prev, {
                        ...data,
                        status: 'read',
                        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                    }];
                }
                return prev;
            });
        });

        window.revelnest.onContactRequest((data: any) => {
            setIncomingRequests(prev => ({ ...prev, [data.revelnestId]: data.publicKey }));
            refreshContacts();
        });

        window.revelnest.onHandshakeFinished((data: any) => {
            refreshContacts();
            setTargetRevelnestId(prev => {
                if (prev.startsWith('pending-')) return data.revelnestId;
                return prev;
            });
        });

        window.revelnest.onMessageDelivered((data: any) => {
            refreshContacts();
            setChatHistory(prev => prev.map(msg =>
                msg.id === data.id && msg.status !== 'read' ? { ...msg, status: 'delivered' } : msg
            ));
        });

        window.revelnest.onMessageRead((data: any) => {
            refreshContacts();
            setChatHistory(prev => prev.map(msg =>
                msg.id === data.id ? { ...msg, status: 'read' } : msg
            ));
        });

        window.revelnest.onTyping((data: any) => {
            const { revelnestId } = data;
            setTypingStatus(prev => {
                if (prev[revelnestId]) clearTimeout(prev[revelnestId]);
                const timeout = setTimeout(() => {
                    setTypingStatus(curr => {
                        const newState = { ...curr };
                        delete newState[revelnestId];
                        return newState;
                    });
                }, 3000);
                return { ...prev, [revelnestId]: timeout };
            });
        });

        window.revelnest.onPresence((data: any) => {
            setContacts(prev => prev.map(c =>
                c.revelnestId === data.revelnestId ? { ...c, lastSeen: data.lastSeen } : c
            ));
        });

        const interval = setInterval(refreshContacts, 10000);
        return () => clearInterval(interval);
    }, [targetRevelnestId]);

    useEffect(() => {
        if (targetRevelnestId) {
            window.revelnest.getMessages(targetRevelnestId).then(msgs => {
                setChatHistory(msgs.reverse().map((m: any) => {
                    if (!m.isMine && m.status !== 'read') {
                        window.revelnest.sendReadReceipt(targetRevelnestId, m.id);
                        m.status = 'read';
                    }
                    return {
                        id: m.id,
                        revelnestId: m.chatRevelnestId, // Handle DB field name
                        isMine: !!m.isMine,
                        message: m.message,
                        status: m.status,
                        timestamp: new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                        replyTo: m.replyTo
                    };
                }));
            });
        } else {
            setChatHistory([]);
        }
    }, [targetRevelnestId]);

    const handleSend = async () => {
        if (!targetRevelnestId || !message) return;
        const sentMessageId = await window.revelnest.sendMessage(targetRevelnestId, message, replyToMessage?.id);

        if (sentMessageId) {
            setChatHistory(prev => [...prev, {
                id: sentMessageId,
                revelnestId: targetRevelnestId,
                isMine: true,
                message: message,
                status: 'sent',
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                replyTo: replyToMessage?.id
            }]);
        }

        setReplyToMessage(null);
        refreshContacts();
        setMessage('');
    };

    const handleTyping = () => {
        if (!targetRevelnestId) return;
        const now = Date.now();
        if (now - (window as any).lastTypingSentTime > 2500) {
            window.revelnest.sendTypingIndicator(targetRevelnestId);
            (window as any).lastTypingSentTime = now;
        }
    };

    const handleAddContact = (idAtAddress: string, name: string) => {
        window.revelnest.addContact(idAtAddress, name).then((res) => {
            refreshContacts();
            if (res.revelnestId) setTargetRevelnestId(res.revelnestId);
        });
    };

    const handleAcceptContact = () => {
        const pk = incomingRequests[targetRevelnestId];
        if (pk) {
            window.revelnest.acceptContactRequest(targetRevelnestId, pk).then(() => {
                refreshContacts();
            });
        }
    };

    const handleDeleteContact = (id?: string) => {
        const targetId = id || targetRevelnestId;
        if (!targetId) return;

        // We'll use a better modal in the component, but keep this as fallback/logic
        window.revelnest.deleteContact(targetId).then(() => {
            refreshContacts();
            if (targetId === targetRevelnestId) {
                setTargetRevelnestId('');
            }
        });
    };

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
                            />
                            <ChatArea
                                chatHistory={chatHistory}
                                myIp={networkAddress || ''}
                                contacts={contacts.map(c => ({ address: c.address, name: c.name }))}
                                onReply={(msg: any) => setReplyToMessage(msg)}
                            />
                            <InputArea
                                message={message}
                                setMessage={setMessage}
                                onSend={handleSend}
                                onTyping={handleTyping}
                                disabled={!targetRevelnestId || activeContact?.status !== 'connected'}
                                replyToMessage={replyToMessage}
                                onCancelReply={() => setReplyToMessage(null)}
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

                {isAddModalOpen && (
                    <AddContactModal
                        open={isAddModalOpen}
                        onClose={() => setIsAddModalOpen(false)}
                        onAdd={handleAddContact}
                    />
                )}
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
            </Sheet>
        </CssVarsProvider>
    );
}
