import type { ChatMessage, Contact, Group } from '../../types/chat.js';
import type { SidebarFilter } from '../../store/useNavigationStore.js';

export const SEARCH_CONTACT_LIMIT = 5;
export const SEARCH_MESSAGE_LIMIT = 10;

export interface ChipSubject {
    isFavorite: boolean;
    unread: boolean;
    isGroup: boolean;
}

export const matchesChip = (chip: SidebarFilter, subject: ChipSubject): boolean => {
    if (chip === 'unread') return subject.unread;
    if (chip === 'favorites') return subject.isFavorite;
    if (chip === 'groups') return subject.isGroup;
    return true;
};

export const normalizeForSearch = (value: string): string =>
    value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

interface ConversationState {
    isFavorite?: boolean;
    pinned?: boolean;
    unread?: boolean;
}

interface ResolvedState {
    isFavorite: boolean;
    pinned: boolean;
    unread: boolean;
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

export interface SearchSources {
    query: string;
    chip: SidebarFilter;
    contacts: Contact[];
    groups: Group[];
    conversationState: Record<string, ConversationState>;
    messages: ChatMessage[];
}

const stateOf = (sources: SearchSources, id: string): ResolvedState => {
    const state = sources.conversationState[id];
    return { isFavorite: !!state?.isFavorite, pinned: !!state?.pinned, unread: !!state?.unread };
};

const timeValue = (value: string | undefined): number => (value ? Date.parse(value) || 0 : 0);

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

const groupMatches = (group: Group, term: string): boolean => normalizeForSearch(group.name).includes(term);

const hasConversation = (contact: Contact): boolean => Boolean(contact.lastMessage || contact.lastMessageTime);

const messageChatId = (message: ChatMessage): string => message.groupId ?? message.upeerId;

const buildChats = (sources: SearchSources, term: string): ChatSearchItem[] =>
    [
        ...sources.contacts
            .filter((contact) => contact.status !== 'blocked' && hasConversation(contact) && contactMatches(contact, term))
            .map((contact) => ({ kind: 'contact' as const, contact, time: timeValue(contact.lastMessageTime), id: contact.upeerId })),
        ...sources.groups
            .filter((group) => groupMatches(group, term))
            .map((group) => ({ kind: 'group' as const, group, time: timeValue(group.lastMessageTime), id: group.groupId })),
    ]
        .map((entry) => ({ entry, state: stateOf(sources, entry.id) }))
        .filter(({ entry, state }) => matchesChip(sources.chip, { ...state, isGroup: entry.kind === 'group' }))
        .sort((left, right) => {
            if (left.state.pinned !== right.state.pinned) return left.state.pinned ? -1 : 1;
            return right.entry.time - left.entry.time;
        })
        .map(({ entry }) => (entry.kind === 'group'
            ? { kind: 'group', group: entry.group, time: entry.time }
            : { kind: 'contact', contact: entry.contact, time: entry.time }));

const buildGroups = (sources: SearchSources, term: string, usedChats: Set<string>): GroupSearchItem[] => {
    const matchingContactIds = new Set(
        sources.contacts.filter((contact) => contactMatches(contact, term)).map((contact) => contact.upeerId),
    );
    return sources.groups
        .filter((group) => !usedChats.has(group.groupId))
        .map((group) => {
            const byName = groupMatches(group, term);
            const sharedBy = byName
                ? undefined
                : sources.contacts.find((contact) => matchingContactIds.has(contact.upeerId) && group.members.includes(contact.upeerId))?.name;
            return { group, byName, sharedBy };
        })
        .filter((entry) => entry.byName || entry.sharedBy !== undefined)
        .filter(({ group }) => matchesChip(sources.chip, { ...stateOf(sources, group.groupId), isGroup: true }))
        .sort((left, right) => timeValue(right.group.lastMessageTime) - timeValue(left.group.lastMessageTime))
        .map(({ group, sharedBy }) => ({ group, sharedBy }));
};

export const buildSearchSections = (
    sources: SearchSources,
    contactLimit = SEARCH_CONTACT_LIMIT,
    messageLimit = SEARCH_MESSAGE_LIMIT,
): SearchSection[] => {
    const term = normalizeForSearch(sources.query);
    if (!term) return [];

    const chats = buildChats(sources, term);
    const usedChats = new Set(chats.map((item) => (item.kind === 'group' ? item.group.groupId : item.contact.upeerId)));

    const contacts = sources.chip === 'groups'
        ? []
        : sources.contacts
            .filter((contact) => contact.status !== 'blocked'
                && !usedChats.has(contact.upeerId)
                && contactMatches(contact, term)
                && matchesChip(sources.chip, { ...stateOf(sources, contact.upeerId), isGroup: false }))
            .sort((left, right) => contactRank(left, term) - contactRank(right, term) || left.name.localeCompare(right.name));

    const messages = sources.messages
        .filter((message) => matchesChip(sources.chip, {
            ...stateOf(sources, messageChatId(message)),
            isGroup: !!message.groupId,
        }))
        .slice()
        .sort((left, right) => (right.date ?? 0) - (left.date ?? 0));

    const groups = buildGroups(sources, term, usedChats);

    return [
        { kind: 'chats', total: chats.length, items: chats },
        {
            kind: 'contacts',
            total: contacts.length,
            items: contacts.slice(0, contactLimit).map((contact) => ({
                contact,
                subtitle: contact.alias && contact.alias !== contact.name ? contact.alias : contact.upeerId.slice(0, 12),
            })),
        },
        { kind: 'groups', total: groups.length, items: groups },
        { kind: 'messages', total: messages.length, items: messages.slice(0, messageLimit) },
    ].filter((section) => section.total > 0) as SearchSection[];
};
