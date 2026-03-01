import { useState, useEffect } from 'react';
import { ChatMessage, Contact } from '../types/chat.js';

export function useChatState() {
    const [networkAddress, setNetworkAddress] = useState<string>('');
    const [targetRevelnestId, setTargetRevelnestId] = useState('');
    const [message, setMessage] = useState('');
    const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
    const [contacts, setContacts] = useState<Contact[]>([]);
    const [typingStatus, setTypingStatus] = useState<Record<string, NodeJS.Timeout>>({});
    const [replyToMessage, setReplyToMessage] = useState<ChatMessage | null>(null);
    const [editingMessage, setEditingMessage] = useState<ChatMessage | null>(null);
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

        window.revelnest.onMessageReactionUpdated((data: any) => {
            setChatHistory(prev => prev.map(msg => {
                if (msg.id === data.msgId) {
                    const reactions = msg.reactions || [];
                    if (data.remove) {
                        return { ...msg, reactions: reactions.filter((r: any) => !(r.revelnestId === data.revelnestId && r.emoji === data.emoji)) };
                    } else {
                        // Avoid duplicates in UI
                        if (reactions.some((r: any) => r.revelnestId === data.revelnestId && r.emoji === data.emoji)) return msg;
                        return { ...msg, reactions: [...reactions, { revelnestId: data.revelnestId, emoji: data.emoji }] };
                    }
                }
                return msg;
            }));
        });

        window.revelnest.onMessageUpdated((data: any) => {
            setChatHistory(prev => prev.map(msg =>
                msg.id === data.id ? { ...msg, message: data.content, isEdited: true } : msg
            ));
        });

        window.revelnest.onMessageDeleted((data: any) => {
            setChatHistory(prev => prev.map(msg =>
                msg.id === data.id ? { ...msg, message: "Mensaje eliminado", isDeleted: true } : msg
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
                        revelnestId: m.chatRevelnestId,
                        isMine: !!m.isMine,
                        message: m.message,
                        status: m.status,
                        timestamp: new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                        replyTo: m.replyTo,
                        reactions: m.reactions,
                        isEdited: !!m.isEdited,
                        isDeleted: !!m.isDeleted
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
        if (now - (window as any).lastTypingSentTime > 2500 || !(window as any).lastTypingSentTime) {
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

        window.revelnest.deleteContact(targetId).then(() => {
            refreshContacts();
            if (targetId === targetRevelnestId) {
                setTargetRevelnestId('');
            }
        });
    };

    const handleReaction = (msgId: string, emoji: string, remove: boolean) => {
        if (!targetRevelnestId) return;
        window.revelnest.sendChatReaction(targetRevelnestId, msgId, emoji, remove);
        // Optimistic update
        setChatHistory(prev => prev.map(msg => {
            if (msg.id === msgId) {
                const reactions = msg.reactions || [];
                const myId = myIdentity?.revelnestId || 'me';
                if (remove) {
                    return { ...msg, reactions: reactions.filter((r: any) => !(r.revelnestId === myId && r.emoji === emoji)) };
                } else {
                    if (reactions.some((r: any) => r.revelnestId === myId && r.emoji === emoji)) return msg;
                    return { ...msg, reactions: [...reactions, { revelnestId: myId, emoji }] };
                }
            }
            return msg;
        }));
    };

    const handleUpdateMessage = (msgId: string, newContent: string) => {
        if (!targetRevelnestId) return;
        window.revelnest.sendChatUpdate(targetRevelnestId, msgId, newContent);
        setChatHistory(prev => prev.map(msg =>
            msg.id === msgId ? { ...msg, message: newContent, isEdited: true } : msg
        ));
        setEditingMessage(null);
        setMessage('');
    };

    const handleDeleteMessage = (msgId: string) => {
        if (!targetRevelnestId) return;
        window.revelnest.sendChatDelete(targetRevelnestId, msgId);
        setChatHistory(prev => prev.map(msg =>
            msg.id === msgId ? { ...msg, message: "🗑️ Mensaje eliminado", isDeleted: true } : msg
        ));
    };

    return {
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
        incomingRequests,
        handleSend,
        handleTyping,
        handleAddContact,
        handleAcceptContact,
        handleDeleteContact,
        handleReaction,
        handleUpdateMessage,
        handleDeleteMessage,
        refreshContacts
    };
}
