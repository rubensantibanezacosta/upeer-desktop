import type { Contact, Group } from '../../types/chat.js';
import type { ChatActionPrefs } from '../../store/useChatActionsStore.js';
import { isContactUnread, isGroupUnread } from '../../utils/chatUnread.js';
import type { ConversationState, SearchChatEntry, SearchContactEntry, SearchEntities, SearchGroupEntry } from './globalSearch.js';
import { timeValue } from './globalSearch.js';

type Prefs = Record<string, ChatActionPrefs | undefined>;

export const contactState = (contact: Contact, prefs?: Prefs): ConversationState => ({
    favorite: !!contact.isFavorite,
    pinned: !!prefs?.[contact.upeerId]?.pinned,
    unread: isContactUnread(contact, prefs?.[contact.upeerId]),
});

export const groupState = (group: Group, prefs?: Prefs): ConversationState => ({
    favorite: !!group.isFavorite,
    pinned: !!prefs?.[group.groupId]?.pinned,
    unread: isGroupUnread(group, prefs?.[group.groupId]),
});

export const buildChatEntry = (contact: Contact, prefs?: Prefs): SearchChatEntry => ({
    kind: 'contact',
    id: contact.upeerId,
    title: contact.name,
    time: timeValue(contact.lastMessageTime),
    contact,
    state: contactState(contact, prefs),
});

export const buildGroupChatEntry = (group: Group, prefs?: Prefs): SearchChatEntry => ({
    kind: 'group',
    id: group.groupId,
    title: group.name,
    time: timeValue(group.lastMessageTime),
    group,
    state: groupState(group, prefs),
});

export interface SearchPrefs {
    contactPrefs?: Prefs;
    groupPrefs?: Prefs;
}

export const buildSearchEntities = (contacts: Contact[], groups: Group[], prefs: SearchPrefs = {}): SearchEntities => ({
    chats: [
        ...contacts
            .filter((contact) => contact.status !== 'blocked')
            .map((contact) => buildChatEntry(contact, prefs.contactPrefs)),
        ...groups.map((group) => buildGroupChatEntry(group, prefs.groupPrefs)),
    ],
    contacts: contacts.map<SearchContactEntry>((contact) => ({ contact, state: contactState(contact, prefs.contactPrefs) })),
    groups: groups.map<SearchGroupEntry>((group) => ({ group, state: groupState(group, prefs.groupPrefs) })),
});
