import type { ChatMessage, Contact, Group } from '../types/chat.js';

export const formatMessageTimestamp = (timestamp?: number) => {
    const safeTimestamp = typeof timestamp === 'number' && Number.isFinite(timestamp)
        ? timestamp
        : Date.now();
    return new Intl.DateTimeFormat(undefined, {
        hour: '2-digit',
        minute: '2-digit',
    }).format(new Date(safeTimestamp));
};

export const mapContactMessage = (message: any) => ({
    id: message.id,
    upeerId: message.chatUpeerId,
    isMine: !!message.isMine,
    message: message.message,
    status: message.status,
    timestamp: formatMessageTimestamp(message.timestamp),
    replyTo: message.replyTo,
    reactions: message.reactions,
    isEdited: !!message.isEdited,
    isDeleted: !!message.isDeleted,
    date: message.timestamp,
});

export const mapGroupMessage = (
    chatId: string,
    message: any,
    contacts: Contact[],
    myIdentity: { alias?: string | null; name?: string | null; avatar?: string | null } | null,
) => {
    const sender = message.isMine ? myIdentity : contacts.find((contact: any) => contact.upeerId === message.senderUpeerId);
    return {
        id: message.id,
        upeerId: chatId,
        groupId: chatId,
        isMine: !!message.isMine,
        message: message.message?.startsWith('__SYS__|') ? message.message.slice(8) : message.message,
        isSystem: message.message?.startsWith('__SYS__|') || undefined,
        status: message.status,
        timestamp: formatMessageTimestamp(message.timestamp),
        replyTo: message.replyTo,
        reactions: message.reactions,
        isEdited: !!message.isEdited,
        isDeleted: !!message.isDeleted,
        senderUpeerId: message.senderUpeerId,
        senderName: (sender as any)?.name || (sender as any)?.alias || message.senderName || 'Usuario desconocido',
        senderAvatar: (sender as any)?.avatar ?? undefined,
        date: message.timestamp,
    };
};

export const buildSearchResults = (raw: any[], contacts: Contact[], groups: Group[]): ChatMessage[] => raw
    .filter((message: any) => !message.message?.startsWith('{'))
    .map((message: any) => {
        const isGroup = message.chatUpeerId?.startsWith('grp-');
        const group = isGroup ? groups.find((item: any) => item.groupId === message.chatUpeerId) : undefined;
        const contact = !isGroup ? contacts.find((item: any) => item.upeerId === message.chatUpeerId) : undefined;
        const senderContact = contacts.find((item: any) => item.upeerId === message.senderUpeerId);
        const conversationName = group?.name || contact?.name || message.chatUpeerId;
        const senderName = message.isMine ? 'Tú' : (senderContact?.name || contact?.name || 'Desconocido');
        return {
            id: message.id,
            upeerId: message.chatUpeerId,
            groupId: isGroup ? message.chatUpeerId : undefined,
            isMine: !!message.isMine,
            message: message.message,
            status: message.status,
            timestamp: formatMessageTimestamp(message.timestamp),
            senderName: conversationName,
            senderAvatar: (isGroup ? group?.avatar : contact?.avatar) ?? undefined,
            senderDisplayName: senderName,
            date: message.timestamp,
        } as ChatMessage;
    });

export const applyReactionUpdate = (message: any, actorId: string, emoji: string, remove: boolean) => {
    if (remove) {
        return {
            ...message,
            reactions: (message.reactions || []).filter((reaction: any) => !(reaction.upeerId === actorId && reaction.emoji === emoji)),
        };
    }
    if ((message.reactions || []).some((reaction: any) => reaction.upeerId === actorId && reaction.emoji === emoji)) {
        return message;
    }
    return {
        ...message,
        reactions: [...(message.reactions || []), { upeerId: actorId, emoji }],
    };
};

export const updateTransferMessageContent = (message: any, fileId: string, updates: any) => {
    if (!message.message.startsWith('{') || !message.message.endsWith('}')) {
        return message;
    }
    try {
        const parsed = JSON.parse(message.message);
        if (parsed.type !== 'file' || (parsed.transferId !== fileId && parsed.fileId !== fileId)) {
            return message;
        }
        return { ...message, message: JSON.stringify({ ...parsed, ...updates }) };
    } catch {
        return message;
    }
};
