import { describe, expect, it } from 'vitest';

import {
    buildSearchSections,
    visibleSearchSections,
    type ConversationState,
    type SearchChatEntry,
    type SearchData,
    type SearchSection,
} from '../../../../src/features/search/globalSearch';
import type { ChatMessage, Contact, Group } from '../../../../src/types/chat';
import type { SidebarFilter } from '../../../../src/store/useNavigationStore';

const state = (overrides: Partial<ConversationState> = {}): ConversationState => ({
    favorite: false,
    pinned: false,
    unread: false,
    ...overrides,
});

const contact = (overrides: Partial<Contact> & { upeerId: string }): Contact => ({
    address: `300::${overrides.upeerId}`,
    name: overrides.upeerId,
    status: 'connected',
    ...overrides,
} as Contact);

const group = (overrides: Partial<Group> & { groupId: string }): Group => ({
    name: overrides.groupId,
    adminUpeerId: 'me',
    members: ['me'],
    status: 'active',
    ...overrides,
} as Group);

const message = (overrides: Partial<ChatMessage> & { id: string }): ChatMessage => ({
    upeerId: 'ana',
    isMine: false,
    message: 'hola',
    timestamp: '',
    date: 0,
    ...overrides,
} as ChatMessage);

const chat = (
    kind: 'contact' | 'group',
    id: string,
    title: string,
    time: number,
    entity: Contact | Group,
    chipState: ConversationState,
): SearchChatEntry => (kind === 'contact'
    ? { kind, id, title, time, contact: entity as Contact, state: chipState }
    : { kind, id, title, time, group: entity as Group, state: chipState });

const chatIds = (sections: SearchSection[]) => {
    const section = sections.find((item) => item.kind === 'chats');
    return section && section.kind === 'chats' ? section.items.map((item) => (item.kind === 'group' ? item.group.groupId : item.contact.upeerId)) : [];
};

const messageIds = (sections: SearchSection[]) => {
    const section = sections.find((item) => item.kind === 'messages');
    return section && section.kind === 'messages' ? section.items.map((item) => item.id) : [];
};

const anaConv = contact({ upeerId: 'ana-conv', name: 'Ana Chats', lastMessage: 'hola', lastMessageTime: '2026-10-01T10:00:00.000Z', lastMessageStatus: 'read' });
const grupo = group({ groupId: 'grp-ana', name: 'Grupo Ana', members: ['me', 'ana-conv'], lastMessageTime: '2026-10-02T10:00:00.000Z' });
const compartido = group({ groupId: 'grp-compartido', name: 'Vecinos', members: ['me', 'ana-conv'], lastMessageTime: '2026-10-03T10:00:00.000Z' });

const matriz = (chip: SidebarFilter): SearchData => ({
    chats: [
        chat('contact', 'ana-conv', 'Ana Chats', 1000, anaConv, state({ unread: chip !== 'all', favorite: chip !== 'all' })),
        chat('group', 'grp-ana', 'Grupo Ana', 2000, grupo, state({ unread: chip !== 'all', favorite: chip !== 'all' })),
    ],
    contacts: [
        { contact: anaConv, state: state({ unread: chip !== 'all', favorite: chip !== 'all' }) },
        {
            contact: { ...anaConv, upeerId: 'ana-otra', name: 'Ana Sin Chat', lastMessage: undefined, lastMessageTime: undefined },
            state: state({ unread: chip !== 'all', favorite: chip !== 'all' }),
        },
    ],
    groups: [
        { group: grupo, state: state({ unread: chip !== 'all', favorite: chip !== 'all' }) },
        { group: compartido, state: state({ unread: chip !== 'all', favorite: chip !== 'all' }) },
    ],
    messages: [
        message({ id: 'c1', upeerId: 'ana-conv', message: 'Ana directo', date: 10 }),
        message({ id: 'c2', upeerId: 'grp-ana', groupId: 'grp-ana', message: 'Ana grupo', date: 20 }),
    ],
});

const kindsOf = (chip: SidebarFilter) => visibleSearchSections(buildSearchSections('ana', chip, matriz(chip))).map((section) => section.kind);

describe('matriz chip × sección', () => {
    it('«Todos» pinta las cuatro secciones', () => {
        expect(kindsOf('all')).toEqual(['chats', 'contacts', 'groups', 'messages']);
    });

    it('descarta las secciones sin filas para no pintar su encabezado', () => {
        expect(visibleSearchSections(buildSearchSections('ana', 'all', { ...matriz('all'), contacts: [], groups: [], messages: [] })))
            .toHaveLength(1);
    });

    it('«No leídos» exige estado de conversación en cada sujeto', () => {
        expect(kindsOf('unread')).toEqual(['chats', 'contacts', 'groups', 'messages']);
    });

    it('«Favoritos» deja pasar a los sujetos marcados y descarta al resto', () => {
        expect(kindsOf('favorites')).toEqual(['chats', 'contacts', 'groups', 'messages']);
    });

    it('«Grupos» deja Chats y Mensajes en clave de grupo y vacía Contactos', () => {
        const sections = buildSearchSections('ana', 'groups', matriz('groups'));
        expect(chatIds(sections)).toEqual(['grp-ana']);
        expect(messageIds(sections)).toEqual(['c2']);
        const contacts = sections.find((section) => section.kind === 'contacts');
        expect(contacts?.total).toBe(0);
        expect(kindsOf('groups')).toEqual(['chats', 'groups', 'messages']);
    });
});
