import type { ChatMessage, Contact, Group, MessageReaction, MyIdentity, RawChatMessage, TransferMessageUpdates } from '../types/chat.js';

export const formatMessageTimestamp = (timestamp?: number) => {
    const safeTimestamp = typeof timestamp === 'number' && Number.isFinite(timestamp)
        ? timestamp
        : Date.now();
    return new Intl.DateTimeFormat(undefined, {
        hour: '2-digit',
        minute: '2-digit',
    }).format(new Date(safeTimestamp));
};

export const mapContactMessage = (message: RawChatMessage): ChatMessage => ({
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
    message: RawChatMessage,
    contacts: Contact[],
    myIdentity: MyIdentity | null,
): ChatMessage => {
    const sender = message.isMine ? myIdentity : contacts.find((contact) => contact.upeerId === message.senderUpeerId);
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
        senderName: sender?.name || sender?.alias || message.senderName || 'Usuario desconocido',
        senderAvatar: sender?.avatar ?? undefined,
        date: message.timestamp,
    };
};

export const buildSearchResults = (raw: RawChatMessage[], contacts: Contact[], groups: Group[]): ChatMessage[] => raw
    .filter((message) => !message.message?.startsWith('{'))
    .map((message) => {
        const isGroup = message.chatUpeerId?.startsWith('grp-');
        const group = isGroup ? groups.find((item) => item.groupId === message.chatUpeerId) : undefined;
        const contact = !isGroup ? contacts.find((item) => item.upeerId === message.chatUpeerId) : undefined;
        const senderContact = contacts.find((item) => item.upeerId === message.senderUpeerId);
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

export const applyReactionUpdate = (message: ChatMessage, actorId: string, emoji: string, remove: boolean): ChatMessage => {
    if (remove) {
        return {
            ...message,
            reactions: (message.reactions || []).filter((reaction: MessageReaction) => !(reaction.upeerId === actorId && reaction.emoji === emoji)),
        };
    }
    if ((message.reactions || []).some((reaction: MessageReaction) => reaction.upeerId === actorId && reaction.emoji === emoji)) {
        return message;
    }
    return {
        ...message,
        reactions: [...(message.reactions || []), { upeerId: actorId, emoji }],
    };
};

export const updateTransferMessageContent = (message: ChatMessage, fileId: string, updates: TransferMessageUpdates): ChatMessage => {
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
