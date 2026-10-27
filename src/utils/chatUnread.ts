import type { Contact, Group } from '../types/chat.js';

interface UnreadPref {
    unread?: boolean;
}

export function isContactUnread(contact: Contact, pref?: UnreadPref): boolean {
    if (pref?.unread) return true;
    return !contact.lastMessageIsMine && !!contact.lastMessage && contact.lastMessageStatus !== 'read';
}

export function isGroupUnread(group: Group, pref?: UnreadPref): boolean {
    if (pref?.unread) return true;
    return !group.lastMessageIsMine && !!group.lastMessage && group.lastMessageStatus !== 'read';
}
