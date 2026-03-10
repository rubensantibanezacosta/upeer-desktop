import { useState, useEffect, useCallback, useRef } from 'react';
import { Group, ChatMessage } from '../types/chat.js';

export function useGroupState(myUpeerId: string | undefined) {
    const [groups, setGroups] = useState<Group[]>([]);
    const [groupChatHistory, setGroupChatHistory] = useState<ChatMessage[]>([]);
    const [activeGroupId, setActiveGroupId] = useState<string>('');

    // BUG DQ fix: ref que siempre apunta al activeGroupId actual, accesible
    // desde los listeners IPC registrados una sola vez sin stale-closure.
    const activeGroupIdRef = useRef('');
    useEffect(() => {
        activeGroupIdRef.current = activeGroupId;
    }, [activeGroupId]);

    const refreshGroups = useCallback(() => {
        window.upeer.getGroups().then((raw: any[]) => {
            setGroups(raw.map((g: any) => ({
                ...g,
                avatar: g.avatar || undefined,
                members: Array.isArray(g.members) ? g.members : JSON.parse(g.members || '[]')
            })));
        });
    }, []);

    // Load groups on mount
    useEffect(() => {
        refreshGroups();
    }, [refreshGroups]);

    // Load chat history when active group changes
    useEffect(() => {
        if (activeGroupId) {
            window.upeer.getMessages(activeGroupId).then((msgs: any[]) => {
                setGroupChatHistory(msgs.reverse().map((m: any) => ({
                    id: m.id,
                    upeerId: activeGroupId,
                    groupId: activeGroupId,
                    isMine: !!m.isMine,
                    message: m.message?.startsWith('__SYS__|') ? m.message.slice(8) : m.message,
                    isSystem: m.message?.startsWith('__SYS__|') || undefined,
                    status: m.status,
                    timestamp: new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                    replyTo: m.replyTo,
                    reactions: m.reactions,
                    isEdited: !!m.isEdited,
                    isDeleted: !!m.isDeleted,
                    senderUpeerId: m.senderUpeerId,
                    senderName: m.senderName
                })));
            });
        } else {
            setGroupChatHistory([]);
        }
    }, [activeGroupId]);

    // BUG DQ fix: todos los listeners de grupo se registran UNA SOLA VEZ en useEffect([]).
    // Se usa activeGroupIdRef para filtrar mensajes sin re-registrar al cambiar de grupo.
    useEffect(() => {
        window.upeer.onGroupMessage((data: any) => {
            // Actualización optimista: mueve el grupo al top sin esperar al IPC
            setGroups(prev => prev.map(g =>
                g.groupId === data.groupId
                    ? { ...g, lastMessage: data.message, lastMessageTime: new Date().toISOString() }
                    : g
            ));
            refreshGroups();
            setGroupChatHistory(prev => {
                const currentGroupId = activeGroupIdRef.current;
                if (data.groupId === currentGroupId) {
                    if (data.id && prev.some(m => m.id === data.id)) return prev;
                    return [...prev, {
                        id: data.id,
                        upeerId: data.groupId,
                        groupId: data.groupId,
                        isMine: false,
                        message: data.message,
                        isSystem: data.isSystem || undefined,
                        status: data.status || 'delivered',
                        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                        replyTo: data.replyTo,
                        senderUpeerId: data.senderUpeerId,
                        senderName: data.senderName
                    }];
                }
                return prev;
            });
        });

        window.upeer.onGroupInvite((_data: any) => {
            refreshGroups();
        });

        window.upeer.onGroupUpdated((_data: any) => {
            refreshGroups();
        });

        window.upeer.onGroupMessageDelivered((data: any) => {
            setGroupChatHistory(prev => prev.map(msg =>
                msg.id === data.id && msg.status === 'sent' ? { ...msg, status: 'delivered' } : msg
            ));
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleSendGroupMessage = useCallback(async (message: string) => {
        if (!activeGroupId || !message) return;

        const sentId = await window.upeer.sendGroupMessage(activeGroupId, message);
        if (sentId) {
            const now = new Date().toISOString();
            setGroupChatHistory(prev => [...prev, {
                id: sentId,
                upeerId: activeGroupId,
                groupId: activeGroupId,
                isMine: true,
                message,
                status: 'sent',
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                senderUpeerId: myUpeerId
            }]);
            // Actualización optimista: mueve el grupo al top del sidebar inmediatamente
            setGroups(prev => prev.map(g =>
                g.groupId === activeGroupId
                    ? { ...g, lastMessage: message, lastMessageTime: now }
                    : g
            ));
        }
        refreshGroups();
    }, [activeGroupId, myUpeerId, refreshGroups]);

    const handleCreateGroup = useCallback(async (name: string, memberIds: string[], avatar?: string) => {
        const result = await window.upeer.createGroup(name, memberIds, avatar);
        if (result.success) {
            refreshGroups();
            setActiveGroupId(result.groupId);
        }
        return result;
    }, [refreshGroups]);

    const handleUpdateGroup = useCallback(async (groupId: string, fields: { name?: string; avatar?: string | null }) => {
        await window.upeer.updateGroup(groupId, fields);
        refreshGroups();
    }, [refreshGroups]);

    const handleLeaveGroup = useCallback(async (groupId: string) => {
        await window.upeer.leaveGroup(groupId);
        // Clear active group if it was the one we just left
        setActiveGroupId(prev => prev === groupId ? '' : prev);
        refreshGroups();
    }, [refreshGroups]);

    return {
        groups,
        groupChatHistory,
        activeGroupId,
        setActiveGroupId,
        handleSendGroupMessage,
        handleCreateGroup,
        handleUpdateGroup,
        handleLeaveGroup,
        refreshGroups
    };
}
