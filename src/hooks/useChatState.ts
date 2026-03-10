import { useState, useEffect, useCallback, useRef } from 'react';
import { ChatMessage, Contact } from '../types/chat.js';

export function useChatState() {
    const [networkAddress, setNetworkAddress] = useState<string>('');
    const [targetUpeerId, setTargetUpeerId] = useState('');
    const [message, setMessage] = useState('');
    const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
    const [contacts, setContacts] = useState<Contact[]>([]);
    const [typingStatus, setTypingStatus] = useState<Record<string, NodeJS.Timeout>>({});
    const [replyToMessage, setReplyToMessage] = useState<ChatMessage | null>(null);
    const [editingMessage, setEditingMessage] = useState<ChatMessage | null>(null);
    const [myIdentity, setMyIdentity] = useState<{ address: string | null, upeerId: string, publicKey: string, alias?: string | null, avatar?: string | null } | null>(null);
    const [incomingRequests, setIncomingRequests] = useState<Record<string, { publicKey: string, avatar?: string, receivedAt?: number, untrustworthy?: any, vouchScore?: number }>>({});
    const [untrustworthyAlert, setUntrustworthyAlert] = useState<null | any>(null);
    const [untrustworthyAlerts, setUntrustworthyAlerts] = useState<Record<string, any>>({});

    // BUG DV fix: usar ref en lugar de window global para evitar polución de scope
    const lastTypingSentRef = useRef<number>(0);

    // BUG DP fix: ref que siempre apunta al targetUpeerId actual, accesible
    // desde listeners IPC registrados una sola vez sin stale-closure.
    const targetUpeerIdRef = useRef('');
    useEffect(() => {
        targetUpeerIdRef.current = targetUpeerId;
    }, [targetUpeerId]);

    // BUG EH fix: ref para myIdentity, evita stale-closure en addFileTransferMessage.
    // myIdentity se carga de forma asíncrona; si addFileTransferMessage capturara
    // el valor directamente lo vería siempre como null hasta el próximo render.
    const myIdentityRef = useRef(myIdentity);
    useEffect(() => {
        myIdentityRef.current = myIdentity;
    }, [myIdentity]);

    const refreshContacts = useCallback(() => {
        window.upeer.getContacts().then(setContacts);
    }, []);

    /** Refresca toda la información del usuario — usar tras cambio de cuenta. */
    const refreshData = useCallback(() => {
        window.upeer.getMyNetworkAddress().then(setNetworkAddress);
        window.upeer.getMyIdentity().then(setMyIdentity);
        window.upeer.getContacts().then(setContacts);
        setTargetUpeerId('');
        setChatHistory([]);
        setIncomingRequests({});
    }, []);

    // BUG DP fix: todos los listeners IPC se registran UNA SOLA VEZ en useEffect([]).
    // El ref targetUpeerIdRef se usa para acceder al ID actual sin stale-closure.
    // El intervalo de refresco también vive aquí para no re-crearse en cada cambio de contacto.
    useEffect(() => {
        window.upeer.getMyNetworkAddress().then(setNetworkAddress);
        window.upeer.getMyIdentity().then(setMyIdentity);

        // Cargar contactos y pre-poblar incomingRequests para solicitudes ya persistidas en BD
        window.upeer.getContacts().then((loaded: any[]) => {
            setContacts(loaded);
            const persisted: Record<string, any> = {};
            for (const c of loaded) {
                if (c.status === 'incoming') {
                    persisted[c.upeerId] = {
                        publicKey: c.publicKey || '',
                        avatar: c.avatar || undefined,
                        receivedAt: c.lastSeen ? new Date(c.lastSeen).getTime() : Date.now(),
                        untrustworthy: null,
                        vouchScore: c.vouchScore,
                    };
                }
            }
            if (Object.keys(persisted).length > 0) {
                setIncomingRequests(prev => ({ ...persisted, ...prev }));
            }
        });

        window.upeer.onReceive((data: any) => {
            refreshContacts();
            setChatHistory(prev => {
                const currentId = targetUpeerIdRef.current;
                if (data.upeerId === currentId) {
                    if (data.id && prev.some(m => m.id === data.id)) return prev;
                    if (data.id) window.upeer.sendReadReceipt(currentId, data.id);
                    return [...prev, {
                        ...data,
                        status: 'read',
                        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                    }];
                }
                return prev;
            });
        });

        window.upeer.onContactRequest(async (data: any) => {
            // Check if contact already exists and is connected
            const currentContacts = await window.upeer.getContacts();
            const existingContact = currentContacts.find((c: any) => c.upeerId === data.upeerId);

            // Only add request if contact doesn't exist or is not already connected
            if (!existingContact || existingContact.status !== 'connected') {
                setIncomingRequests(prev => ({
                    ...prev,
                    [data.upeerId]: {
                        publicKey: data.publicKey,
                        avatar: data.avatar || prev[data.upeerId]?.avatar || undefined,
                        receivedAt: prev[data.upeerId]?.receivedAt ?? Date.now(),
                        untrustworthy: null,
                        vouchScore: data.vouchScore ?? prev[data.upeerId]?.vouchScore,
                    }
                }));
            }
            refreshContacts();
        });

        window.upeer.onHandshakeFinished((data: any) => {
            refreshContacts();
            setTargetUpeerId(prev => {
                if (prev.startsWith('pending-')) return data.upeerId;
                return prev;
            });
        });

        window.upeer.onContactUntrustworthy((data: any) => {
            setUntrustworthyAlert(data);
            // Store alert for this specific contact
            setUntrustworthyAlerts(prev => ({ ...prev, [data.upeerId]: data }));
            // Also update incoming request if it exists
            setIncomingRequests(prev => {
                if (prev[data.upeerId]) {
                    return {
                        ...prev,
                        [data.upeerId]: {
                            ...prev[data.upeerId],
                            untrustworthy: data
                        }
                    };
                }
                return prev;
            });
        });

        window.upeer.onMessageDelivered((data: any) => {
            refreshContacts();
            setChatHistory(prev => prev.map(msg =>
                msg.id === data.id && msg.status !== 'read' ? { ...msg, status: 'delivered' } : msg
            ));
        });

        window.upeer.onMessageRead((data: any) => {
            refreshContacts();
            setChatHistory(prev => prev.map(msg =>
                msg.id === data.id ? { ...msg, status: 'read' } : msg
            ));
        });

        window.upeer.onMessageReactionUpdated((data: any) => {
            setChatHistory(prev => prev.map(msg => {
                if (msg.id === data.msgId) {
                    const reactions = msg.reactions || [];
                    if (data.remove) {
                        return { ...msg, reactions: reactions.filter((r: any) => !(r.upeerId === data.upeerId && r.emoji === data.emoji)) };
                    } else {
                        // Avoid duplicates in UI
                        if (reactions.some((r: any) => r.upeerId === data.upeerId && r.emoji === data.emoji)) return msg;
                        return { ...msg, reactions: [...reactions, { upeerId: data.upeerId, emoji: data.emoji }] };
                    }
                }
                return msg;
            }));
        });

        window.upeer.onMessageUpdated((data: any) => {
            setChatHistory(prev => prev.map(msg =>
                msg.id === data.id ? { ...msg, message: data.content, isEdited: true } : msg
            ));
        });

        window.upeer.onMessageDeleted((data: any) => {
            setChatHistory(prev => prev.map(msg =>
                msg.id === data.id ? { ...msg, message: "Mensaje eliminado", isDeleted: true } : msg
            ));
        });

        window.upeer.onMessageStatusUpdated((data: any) => {
            setChatHistory(prev => prev.map(msg =>
                msg.id === data.id ? { ...msg, status: data.status } : msg
            ));
        });

        window.upeer.onTyping((data: any) => {
            const { upeerId } = data;
            setTypingStatus(prev => {
                if (prev[upeerId]) clearTimeout(prev[upeerId]);
                const timeout = setTimeout(() => {
                    setTypingStatus(curr => {
                        const newState = { ...curr };
                        delete newState[upeerId];
                        return newState;
                    });
                }, 3000);
                return { ...prev, [upeerId]: timeout };
            });
        });

        window.upeer.onPresence((data: any) => {
            setContacts(prev => prev.map(c => {
                if (c.upeerId !== data.upeerId) return c;
                return {
                    ...c,
                    lastSeen: data.lastSeen,
                    ...(data.alias ? { name: data.alias } : {}),
                    ...(data.avatar ? { avatar: data.avatar } : {}),
                };
            }));
        });

        const interval = setInterval(refreshContacts, 10000);
        return () => clearInterval(interval);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        if (targetUpeerId) {
            window.upeer.getMessages(targetUpeerId).then(msgs => {
                setChatHistory(msgs.reverse().map((m: any) => {
                    if (!m.isMine && m.status !== 'read') {
                        window.upeer.sendReadReceipt(targetUpeerId, m.id);
                        m.status = 'read';
                    }
                    return {
                        id: m.id,
                        upeerId: m.chatUpeerId,
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
    }, [targetUpeerId]);

    const handleSend = async () => {
        if (!targetUpeerId || !message) return;
        const sentMessageId = await window.upeer.sendMessage(targetUpeerId, message, replyToMessage?.id);

        if (sentMessageId) {
            setChatHistory(prev => [...prev, {
                id: sentMessageId,
                upeerId: targetUpeerId,
                isMine: true,
                message: message,
                status: targetUpeerId === myIdentity?.upeerId ? 'read' : 'sent',
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                replyTo: replyToMessage?.id
            }]);
        }

        setReplyToMessage(null);
        refreshContacts();
        setMessage('');
    };

    // BUG DV fix: ref en lugar de window global para no contaminar el scope global
    const handleTyping = () => {
        if (!targetUpeerId) return;
        const now = Date.now();
        if (now - lastTypingSentRef.current > 2500) {
            window.upeer.sendTypingIndicator(targetUpeerId);
            lastTypingSentRef.current = now;
        }
    };

    const handleAddContact = (idAtAddress: string, name: string) => {
        window.upeer.addContact(idAtAddress, name).then((res) => {
            refreshContacts();
            if (res.upeerId) setTargetUpeerId(res.upeerId);
        });
    };

    const handleAcceptContact = () => {
        const request = incomingRequests[targetUpeerId];
        if (request?.publicKey) {
            window.upeer.acceptContactRequest(targetUpeerId, request.publicKey).then(() => {
                refreshContacts();
                // Remove from incoming requests after accepting
                setIncomingRequests(prev => {
                    const newRequests = { ...prev };
                    delete newRequests[targetUpeerId];
                    return newRequests;
                });
                // Also remove from untrustworthy alerts
                setUntrustworthyAlerts((prev: Record<string, any>) => {
                    const newAlerts = { ...prev };
                    delete newAlerts[targetUpeerId];
                    return newAlerts;
                });
                // Clear global alert if it's for this contact
                setUntrustworthyAlert((prev: any) => {
                    if (prev && prev.upeerId === targetUpeerId) {
                        return null;
                    }
                    return prev;
                });
            });
        }
    };

    const handleDeleteContact = (id?: string) => {
        const targetId = id || targetUpeerId;
        if (!targetId) return;

        window.upeer.deleteContact(targetId).then(() => {
            setIncomingRequests(prev => {
                const next = { ...prev };
                delete next[targetId];
                return next;
            });
            refreshContacts();
            if (targetId === targetUpeerId) {
                setTargetUpeerId('');
            }
        });
    };

    const handleBlockContact = (id?: string) => {
        const targetId = id || targetUpeerId;
        if (!targetId) return;

        window.upeer.blockContact(targetId).then(() => {
            setIncomingRequests(prev => {
                const next = { ...prev };
                delete next[targetId];
                return next;
            });
            setUntrustworthyAlerts(prev => {
                const next = { ...prev };
                delete next[targetId];
                return next;
            });
            refreshContacts();
            if (targetId === targetUpeerId) {
                setTargetUpeerId('');
            }
        });
    };

    const handleReaction = (msgId: string, emoji: string, remove: boolean) => {
        if (!targetUpeerId) return;
        window.upeer.sendChatReaction(targetUpeerId, msgId, emoji, remove);
        // Optimistic update
        setChatHistory(prev => prev.map(msg => {
            if (msg.id === msgId) {
                const reactions = msg.reactions || [];
                const myId = myIdentity?.upeerId || 'me';
                if (remove) {
                    return { ...msg, reactions: reactions.filter((r: any) => !(r.upeerId === myId && r.emoji === emoji)) };
                } else {
                    if (reactions.some((r: any) => r.upeerId === myId && r.emoji === emoji)) return msg;
                    return { ...msg, reactions: [...reactions, { upeerId: myId, emoji }] };
                }
            }
            return msg;
        }));
    };

    const handleUpdateMessage = (msgId: string, newContent: string) => {
        if (!targetUpeerId) return;
        window.upeer.sendChatUpdate(targetUpeerId, msgId, newContent);
        setChatHistory(prev => prev.map(msg =>
            msg.id === msgId ? { ...msg, message: newContent, isEdited: true } : msg
        ));
        setEditingMessage(null);
        setMessage('');
    };

    const handleDeleteMessage = (msgId: string) => {
        if (!targetUpeerId) return;
        window.upeer.sendChatDelete(targetUpeerId, msgId);
        setChatHistory(prev => prev.map(msg =>
            msg.id === msgId ? { ...msg, message: "Mensaje eliminado", isDeleted: true } : msg
        ));
    };

    const addFileTransferMessage = useCallback((
        upeerId: string,
        fileId: string,
        fileName: string,
        fileSize: number,
        mimeType: string,
        fileHash: string,
        thumbnail?: string,
        caption?: string,
        isMine = true
    ) => {
        // BUG EG fix: eliminados console.log que exponían fileId/fileName en prod.
        if (!upeerId) return;

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
            // BUG EH fix: usar myIdentityRef.current en vez de myIdentity capturado
            // en el cierre — evita el stale-closure cuando myIdentity carga async.
            return [...prev, {
                id: msgId,
                upeerId: upeerId,
                isMine,
                message: messageContent,
                status: (isMine && upeerId === myIdentityRef.current?.upeerId) ? 'read' : 'sent',
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
        incomingRequests,
        untrustworthyAlert,
        untrustworthyAlerts,
        clearUntrustworthyAlert,
        handleSend,
        handleTyping,
        handleAddContact,
        handleAcceptContact,
        handleDeleteContact,
        handleBlockContact,
        handleReaction,
        handleUpdateMessage,
        handleDeleteMessage,
        addFileTransferMessage,
        updateFileTransferMessage,
        refreshContacts,
        refreshData
    };
}
