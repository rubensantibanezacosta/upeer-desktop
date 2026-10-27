import type { ChatMessage, Contact, Group } from '../../types/chat.js';
import type { SidebarFilter } from '../../store/useNavigationStore.js';

export const SEARCH_CONTACT_LIMIT = 5;
export const SEARCH_MESSAGE_LIMIT = 10;
export const SEARCH_MESSAGE_PAGE = 25;

export interface ConversationState {
    favorite: boolean;
    pinned: boolean;
    unread: boolean;
}

export type ChipTarget =
    | { kind: 'contact'; state: ConversationState }
    | { kind: 'group'; state: ConversationState }
    | { kind: 'message'; state: ConversationState; isGroup: boolean };

export const matchesChip = (chip: SidebarFilter, target: ChipTarget): boolean => {
    if (target.kind === 'message') {
        return chip === 'groups'
            ? target.isGroup
            : matchesChip(chip, { kind: target.isGroup ? 'group' : 'contact', state: target.state });
    }
    if (chip === 'all') return true;
    if (chip === 'groups') return target.kind === 'group';
    return chip === 'favorites' ? target.state.favorite : target.state.unread;
};

export const normalizeForSearch = (value: string): string =>
    value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

const SYSTEM_PREFIX = '__SYS__|';

export const searchMessageText = (content: string | undefined): string | null => {
    const raw = (content ?? '').trim();
    if (!raw || raw.startsWith('{')) return null;
    const text = raw.startsWith(SYSTEM_PREFIX) ? raw.slice(SYSTEM_PREFIX.length) : raw;
    return text.trim() || null;
};

export interface SearchChatEntry {
    kind: 'contact' | 'group';
    id: string;
    title: string;
    time: number;
    contact?: Contact;
    group?: Group;
    state: ConversationState;
}

export interface SearchContactEntry {
    contact: Contact;
    state: ConversationState;
}

export interface SearchGroupEntry {
    group: Group;
    state: ConversationState;
}

export interface SearchEntities {
    chats: SearchChatEntry[];
    contacts: SearchContactEntry[];
    groups: SearchGroupEntry[];
}

export interface SearchData extends SearchEntities {
    messages: ChatMessage[];
}

export type ChatSearchItem =
    | { kind: 'contact'; contact: Contact; time: number }
    | { kind: 'group'; group: Group; time: number };

export interface ContactSearchItem {
    contact: Contact;
    subtitle: string;
}

export interface GroupSearchItem {
    group: Group;
    sharedBy?: string;
}

export type SearchSection =
    | { kind: 'chats'; total: number; items: ChatSearchItem[] }
    | { kind: 'contacts'; total: number; items: ContactSearchItem[] }
    | { kind: 'groups'; total: number; items: GroupSearchItem[] }
    | { kind: 'messages'; total: number; items: ChatMessage[] };

export interface SearchLimits {
    contacts?: number;
    messages?: number;
}

export const chatChipTarget = (entry: SearchChatEntry): ChipTarget => ({
    kind: entry.kind === 'group' ? 'group' : 'contact',
    state: entry.state,
});

export const contactChipTarget = (entry: SearchContactEntry): ChipTarget => ({ kind: 'contact', state: entry.state });

export const groupChipTarget = (entry: SearchGroupEntry): ChipTarget => ({ kind: 'group', state: entry.state });

export const timeValue = (value: string | undefined): number => (value ? Date.parse(value) || 0 : 0);

const contactNames = (contact: Contact): string[] =>
    [contact.name, contact.alias ?? ''].filter((value) => value.length > 0);

const contactMatches = (contact: Contact, term: string): boolean => {
    if (contactNames(contact).some((name) => normalizeForSearch(name).includes(term))) return true;
    if (normalizeForSearch(contact.upeerId).startsWith(term)) return true;
    return normalizeForSearch(contact.address ?? '').includes(term);
};

const contactRank = (contact: Contact, term: string): number => {
    const names = contactNames(contact).map(normalizeForSearch);
    if (names.some((name) => name === term)) return 0;
    if (names.some((name) => name.startsWith(term))) return 1;
    return 2;
};

const chatMatches = (entry: SearchChatEntry, term: string): boolean => {
    if (entry.kind === 'contact' && entry.contact) return contactMatches(entry.contact, term);
    return normalizeForSearch(entry.title).includes(term);
};

const hasConversation = (contact: Contact): boolean => Boolean(contact.lastMessage || contact.lastMessageTime);

const buildChatRows = (data: SearchData, chip: SidebarFilter, term: string): ChatSearchItem[] =>
    data.chats
        .filter((entry) => entry.contact?.status !== 'blocked')
        .filter((entry) => entry.kind === 'group' || (entry.contact ? hasConversation(entry.contact) : false))
        .filter((entry) => matchesChip(chip, chatChipTarget(entry)) && chatMatches(entry, term))
        .sort((left, right) => Number(right.state.pinned) - Number(left.state.pinned) || right.time - left.time)
        .map((entry) => (entry.kind === 'group' && entry.group
            ? { kind: 'group', group: entry.group, time: entry.time }
            : { kind: 'contact', contact: entry.contact as Contact, time: entry.time }));

const buildContactRows = (data: SearchData, chip: SidebarFilter, term: string, usedChats: Set<string>, limit: number): SearchSection => {
    if (chip === 'groups') return { kind: 'contacts', total: 0, items: [] };
    const rows = data.contacts
        .filter((entry) => entry.contact.status !== 'blocked')
        .filter((entry) => !usedChats.has(entry.contact.upeerId))
        .filter((entry) => matchesChip(chip, contactChipTarget(entry)) && contactMatches(entry.contact, term))
        .sort((left, right) => contactRank(left.contact, term) - contactRank(right.contact, term)
            || left.contact.name.localeCompare(right.contact.name));
    return {
        kind: 'contacts',
        total: rows.length,
        items: rows.slice(0, limit).map((entry) => ({
            contact: entry.contact,
            subtitle: entry.contact.alias && entry.contact.alias !== entry.contact.name
                ? entry.contact.alias
                : entry.contact.upeerId.slice(0, 12),
        })),
    };
};

const buildGroupRows = (data: SearchData, chip: SidebarFilter, term: string, usedChats: Set<string>): SearchSection => {
    const matchingContacts = data.contacts
        .filter((entry) => entry.contact.status !== 'blocked' && contactMatches(entry.contact, term))
        .map((entry) => entry.contact);
    const listed = new Set<string>();
    const rows = data.groups
        .filter((entry) => matchesChip(chip, groupChipTarget(entry)))
        .filter((entry) => !usedChats.has(entry.group.groupId))
        .map((entry) => {
            if (normalizeForSearch(entry.group.name).includes(term)) return { group: entry.group, sharedBy: undefined };
            const shared = matchingContacts.find((contact) => entry.group.members.includes(contact.upeerId));
            return shared ? { group: entry.group, sharedBy: shared.name } : null;
        })
        .filter((entry): entry is GroupSearchItem => entry !== null)
        .filter((entry) => {
            if (listed.has(entry.group.groupId)) return false;
            listed.add(entry.group.groupId);
            return true;
        })
        .sort((left, right) => timeValue(right.group.lastMessageTime) - timeValue(left.group.lastMessageTime));
    return { kind: 'groups', total: rows.length, items: rows };
};

const conversationIndex = (data: SearchData): Map<string, { state: ConversationState; isGroup: boolean; blocked: boolean }> => {
    const index = new Map<string, { state: ConversationState; isGroup: boolean; blocked: boolean }>();
    data.chats.forEach((entry) => index.set(entry.id, {
        state: entry.state,
        isGroup: entry.kind === 'group',
        blocked: entry.contact?.status === 'blocked',
    }));
    data.contacts.filter((entry) => entry.contact.status === 'blocked').forEach((entry) => index.set(entry.contact.upeerId, {
        state: entry.state,
        isGroup: false,
        blocked: true,
    }));
    return index;
};

const messageMatchesChip = (
    message: ChatMessage,
    chip: SidebarFilter,
    index: Map<string, { state: ConversationState; isGroup: boolean; blocked: boolean }>,
): boolean => {
    const chatId = message.groupId ?? message.upeerId;
    const conversation = index.get(chatId);
    if (!conversation) return chip === 'all';
    if (conversation.blocked) return false;
    return matchesChip(chip, { kind: 'message', state: conversation.state, isGroup: conversation.isGroup });
};

const buildMessageRows = (data: SearchData, chip: SidebarFilter, term: string, limit: number): SearchSection => {
    const index = conversationIndex(data);
    const rows = data.messages
        .filter((message) => messageMatchesChip(message, chip, index))
        .map((message) => ({ message, text: searchMessageText(message.message) }))
        .filter((entry): entry is { message: ChatMessage; text: string } => entry.text !== null)
        .filter((entry) => normalizeForSearch(entry.text).includes(term))
        .sort((left, right) => (right.message.date ?? 0) - (left.message.date ?? 0))
        .map((entry) => entry.message);
    return { kind: 'messages', total: rows.length, items: rows.slice(0, limit) };
};

export const buildSearchSections = (
    query: string,
    chip: SidebarFilter,
    data: SearchData,
    limits: SearchLimits = {},
): SearchSection[] => {
    const term = normalizeForSearch(query);
    if (!term) return [];

    const chats = buildChatRows(data, chip, term);
    const usedChats = new Set(chats.map((item) => (item.kind === 'group' ? item.group.groupId : item.contact.upeerId)));
    return [
        { kind: 'chats', total: chats.length, items: chats },
        buildContactRows(data, chip, term, usedChats, limits.contacts ?? SEARCH_CONTACT_LIMIT),
        buildGroupRows(data, chip, term, usedChats),
        buildMessageRows(data, chip, term, limits.messages ?? SEARCH_MESSAGE_LIMIT),
    ];
};

export const visibleSearchSections = (sections: SearchSection[]): SearchSection[] =>
    sections.filter((section) => section.items.length > 0);
