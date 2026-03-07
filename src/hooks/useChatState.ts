import { useState, useEffect, useCallback } from 'react';
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
    const [incomingRequests, setIncomingRequests] = useState<Record<string, { publicKey: string, untrustworthy?: any }>>({});
    const [untrustworthyAlert, setUntrustworthyAlert] = useState<null | any>(null);
    const [untrustworthyAlerts, setUntrustworthyAlerts] = useState<Record<string, any>>({});

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
                    if (data.id && prev.some(m => m.id === data.id)) return prev;
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

        window.revelnest.onContactRequest(async (data: any) => {
            // Check if contact already exists and is connected
            const currentContacts = await window.revelnest.getContacts();
            const existingContact = currentContacts.find((c: any) => c.revelnestId === data.revelnestId);

            // Only add request if contact doesn't exist or is not already connected
            if (!existingContact || existingContact.status !== 'connected') {
                setIncomingRequests(prev => ({
                    ...prev,
                    [data.revelnestId]: {
                        publicKey: data.publicKey,
                        untrustworthy: null // Will be set if onContactUntrustworthy arrives
                    }
                }));
            }
            refreshContacts();
        });

        window.revelnest.onHandshakeFinished((data: any) => {
            refreshContacts();
            setTargetRevelnestId(prev => {
                if (prev.startsWith('pending-')) return data.revelnestId;
                return prev;
            });
        });

        window.revelnest.onContactUntrustworthy((data: any) => {
            console.warn('Contacto no confiable detectado:', data);
            setUntrustworthyAlert(data);
            // Store alert for this specific contact
            setUntrustworthyAlerts(prev => ({ ...prev, [data.revelnestId]: data }));
            // Also update incoming request if it exists
            setIncomingRequests(prev => {
                if (prev[data.revelnestId]) {
                    return {
                        ...prev,
                        [data.revelnestId]: {
                            ...prev[data.revelnestId],
                            untrustworthy: data
                        }
                    };
                }
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
                status: targetRevelnestId === myIdentity?.revelnestId ? 'read' : 'sent',
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
        const request = incomingRequests[targetRevelnestId];
        if (request?.publicKey) {
            window.revelnest.acceptContactRequest(targetRevelnestId, request.publicKey).then(() => {
                refreshContacts();
                // Remove from incoming requests after accepting
                setIncomingRequests(prev => {
                    const newRequests = { ...prev };
                    delete newRequests[targetRevelnestId];
                    return newRequests;
                });
                // Also remove from untrustworthy alerts
                setUntrustworthyAlerts((prev: Record<string, any>) => {
                    const newAlerts = { ...prev };
                    delete newAlerts[targetRevelnestId];
                    return newAlerts;
                });
                // Clear global alert if it's for this contact
                setUntrustworthyAlert((prev: any) => {
                    if (prev && prev.revelnestId === targetRevelnestId) {
                        return null;
                    }
                    return prev;
                });
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
            msg.id === msgId ? { ...msg, message: "Mensaje eliminado", isDeleted: true } : msg
        ));
    };

    const addFileTransferMessage = useCallback((
        revelnestId: string,
        fileId: string,
        fileName: string,
        fileSize: number,
        mimeType: string,
        fileHash: string,
        thumbnail?: string,
        caption?: string,
        isMine: boolean = true
    ) => {
        console.log('addFileTransferMessage called:', { revelnestId, fileId, fileName, fileSize, isMine });
        if (!revelnestId) return;

        // Create structured JSON message consistent with backend
        const fileMessage = {
            type: 'file',
            transferId: fileId,
            fileName,
            fileSize,
            mimeType,
            fileHash,
            thumbnail: thumbnail || '',
            caption: caption || '',
            direction: isMine ? 'sending' : 'receiving'
        };

        const messageContent = JSON.stringify(fileMessage);
        const msgId = fileId; // Support stable ID to match backend DB and prevent duplicates

        setChatHistory(prev => {
            console.log('Adding file transfer message to chat history:', msgId);
            return [...prev, {
                id: msgId,
                revelnestId: revelnestId,
                isMine,
                message: messageContent,
                status: (isMine && revelnestId === myIdentity?.revelnestId) ? 'read' : 'sent',
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            }];
        });
    }, []);

    const updateFileTransferMessage = useCallback((
        fileId: string,
        updates: {
            fileHash?: string;
            thumbnail?: string;
            transferState?: 'pending' | 'active' | 'completed' | 'failed' | 'cancelled';
            direction?: 'sending' | 'receiving';
        }
    ) => {
        setChatHistory(prev => prev.map(msg => {
            // Check if it's a JSON file message for this fileId
            if (msg.message.startsWith('{') && msg.message.endsWith('}')) {
                try {
                    const parsed = JSON.parse(msg.message);
                    if (parsed.type === 'file' && (parsed.transferId === fileId || parsed.fileId === fileId)) {
                        const updated = { ...parsed, ...updates };
                        return { ...msg, message: JSON.stringify(updated) };
                    }
                } catch (e) { /* ignore */ }
            }

            // Legacy pipe format support
            if (msg.message.startsWith(`FILE_TRANSFER|${fileId}|`)) {
                const parts = msg.message.split('|');
                if (updates.fileHash) parts[5] = updates.fileHash;
                if (updates.thumbnail) parts[6] = updates.thumbnail;
                return { ...msg, message: parts.join('|') };
            }
            return msg;
        }));
    }, []);

    const clearUntrustworthyAlert = () => setUntrustworthyAlert(null);

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
        untrustworthyAlert,
        untrustworthyAlerts,
        clearUntrustworthyAlert,
        handleSend,
        handleTyping,
        handleAddContact,
        handleAcceptContact,
        handleDeleteContact,
        handleReaction,
        handleUpdateMessage,
        handleDeleteMessage,
        addFileTransferMessage,
        updateFileTransferMessage,
        refreshContacts
    };
}
