import { describe, expect, it } from 'vitest';

import {
    SEARCH_CONTACT_LIMIT,
    SEARCH_MESSAGE_LIMIT,
    buildSearchSections,
    chatChipTarget,
    contactChipTarget,
    groupChipTarget,
    matchesChip,
    normalizeForSearch,
    searchMessageText,
    type ChatSearchItem,
    type ConversationState,
    type SearchChatEntry,
    type SearchData,
    type SearchSection,
} from '../../../../src/features/search/globalSearch';
import type { ChatMessage, Contact, Group } from '../../../../src/types/chat';

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

const ana = contact({ upeerId: 'ana', name: 'Ana Torres', lastMessage: 'hola', lastMessageTime: '2026-10-01T10:00:00.000Z', lastMessageStatus: 'read' });
const bruno = contact({ upeerId: 'bruno', name: 'Bruno Díaz', lastMessage: 'hey', lastMessageTime: '2026-10-02T10:00:00.000Z', lastMessageStatus: 'sent' });
const inigo = contact({ upeerId: 'inigo', name: 'Íñigo Pérez', alias: 'Iñigo' });
const bloqueado = contact({ upeerId: 'blocked', name: 'Ana Bloqueada', status: 'blocked', lastMessage: 'hola', lastMessageTime: '2026-10-09T10:00:00.000Z' });
const equipo = group({ groupId: 'grp-equipo', name: 'Equipo de Ana', members: ['me', 'ana'], lastMessageTime: '2026-10-03T10:00:00.000Z' });
const vecinos = group({ groupId: 'grp-vecinos', name: 'Vecinos', members: ['me', 'ana'], lastMessageTime: '2026-10-04T10:00:00.000Z' });

const data = (messages: ChatMessage[] = []): SearchData => ({
    chats: [
        chat('contact', 'ana', 'Ana Torres', 1000, ana, state({ unread: false })),
        chat('contact', 'bruno', 'Bruno Díaz', 2000, bruno, state({ unread: true, favorite: true, pinned: true })),
        chat('group', 'grp-equipo', 'Equipo de Ana', 4000, equipo, state({ favorite: true })),
        chat('group', 'grp-vecinos', 'Vecinos', 5000, vecinos, state()),
    ],
    contacts: [
        { contact: ana, state: state() },
        { contact: bruno, state: state({ unread: true, favorite: true }) },
        { contact: inigo, state: state() },
        { contact: bloqueado, state: state() },
        { contact: contact({ upeerId: 'favorito', name: 'Favorito' }), state: state({ favorite: true }) },
    ],
    groups: [
        { group: equipo, state: state({ favorite: true }) },
        { group: vecinos, state: state() },
    ],
    messages,
});

const messages = (): ChatMessage[] => [
    message({ id: 'm1', upeerId: 'ana', message: 'Hola Ana', date: 3000 }),
    message({ id: 'm2', upeerId: 'grp-equipo', groupId: 'grp-equipo', message: 'Reunión de Ana', date: 4000 }),
    message({ id: 'm3', upeerId: 'ana', message: '{"type":"file","fileName":"ana.pdf"}', date: 5000 }),
    message({ id: 'm4', upeerId: 'ana', message: '__SYS__|Ana se unió', date: 6000 }),
    message({ id: 'm5', upeerId: 'grp-vecinos', groupId: 'grp-vecinos', message: 'Hola Ana y vecinos', date: 2000 }),
    message({ id: 'm6', upeerId: 'blocked', message: 'Ana bloqueada dice hola', date: 7000 }),
];

const kinds = (sections: SearchSection[]) => sections.map((section) => section.kind);
const messagesSection = (sections: SearchSection[]) => sections.find((section) => section.kind === 'messages');
const messageIds = (sections: SearchSection[]) => {
    const section = messagesSection(sections);
    return section && section.kind === 'messages' ? section.items.map((item) => item.id) : [];
};
const chatIds = (sections: SearchSection[]) => {
    const section = sections.find((item) => item.kind === 'chats');
    return section && section.kind === 'chats' ? section.items.map((item: ChatSearchItem) => (item.kind === 'group' ? item.group.groupId : item.contact.upeerId)) : [];
};

describe('normalizeForSearch', () => {
    it('quita diacríticos, mayúsculas y espacios de los extremos', () => {
        expect(normalizeForSearch('  Café  ')).toBe('cafe');
        expect(normalizeForSearch('ÑANDÚ')).toBe('nandu');
    });
});

describe('searchMessageText', () => {
    it('descarta adjuntos y limpia el prefijo de sistema', () => {
        expect(searchMessageText('{"type":"file"}')).toBeNull();
        expect(searchMessageText('__SYS__|Ana se unió')).toBe('Ana se unió');
        expect(searchMessageText('  ')).toBeNull();
    });
});

describe('matchesChip por tipo de entidad', () => {
    it('aplica el mismo criterio a chats, contactos, grupos y mensajes', () => {
        const empty = state();
        const unread = state({ unread: true });
        const favorite = state({ favorite: true });

        expect(matchesChip('all', { kind: 'contact', state: empty })).toBe(true);
        expect(matchesChip('unread', { kind: 'contact', state: unread })).toBe(true);
        expect(matchesChip('favorites', { kind: 'contact', state: favorite })).toBe(true);
        expect(matchesChip('groups', { kind: 'contact', state: favorite })).toBe(false);

        expect(matchesChip('groups', { kind: 'group', state: empty })).toBe(true);
        expect(matchesChip('unread', { kind: 'group', state: empty })).toBe(false);

        expect(matchesChip('groups', { kind: 'message', state: empty, isGroup: true })).toBe(true);
        expect(matchesChip('groups', { kind: 'message', state: empty, isGroup: false })).toBe(false);
        expect(matchesChip('unread', { kind: 'message', state: unread, isGroup: false })).toBe(true);
        expect(matchesChip('favorites', { kind: 'message', state: favorite, isGroup: true })).toBe(true);
    });

    it('mapea cada entrada a su sujeto de chip', () => {
        const entries = data();
        expect(chatChipTarget(entries.chats[0]).kind).toBe('contact');
        expect(chatChipTarget(entries.chats[3]).kind).toBe('group');
        expect(contactChipTarget(entries.contacts[0]).kind).toBe('contact');
        expect(groupChipTarget(entries.groups[0]).kind).toBe('group');
    });
});

describe('buildSearchSections', () => {
    it('no devuelve secciones sin término', () => {
        expect(buildSearchSections('   ', 'all', data(messages()))).toEqual([]);
    });

    it('mantiene el orden fijo de secciones', () => {
        expect(kinds(buildSearchSections('ana', 'all', data(messages())))).toEqual(['chats', 'contacts', 'groups', 'messages']);
    });

    it('con «Todos» reparte chats, contactos, grupos y mensajes sin repetir elementos', () => {
        const sections = buildSearchSections('ana', 'all', data(messages()));
        expect(chatIds(sections)).toEqual(['grp-equipo', 'ana']);

        const contacts = sections.find((section) => section.kind === 'contacts');
        expect(contacts?.kind === 'contacts' ? contacts.items.map((item) => item.contact.upeerId) : []).toEqual([]);

        const groups = sections.find((section) => section.kind === 'groups');
        expect(groups?.kind === 'groups' ? groups.items.map((item) => [item.group.groupId, item.sharedBy]) : []).toEqual([['grp-vecinos', 'Ana Torres']]);

        expect(messageIds(sections)).toEqual(['m4', 'm2', 'm1', 'm5']);
        expect(messageIds(sections)).not.toContain('m3');
        expect(messageIds(sections)).not.toContain('m6');
    });

    it('con «No leídos» solo deja conversaciones, contactos y mensajes de chats con no leídos', () => {
        const sections = buildSearchSections('ana', 'unread', data(messages()));
        expect(chatIds(sections)).toEqual([]);
        expect(messageIds(sections)).toEqual([]);

        const contacts = sections.find((section) => section.kind === 'contacts');
        expect(contacts?.kind === 'contacts' ? contacts.items : []).toEqual([]);

        const conNoLeidos = buildSearchSections('bruno', 'unread', data([
            message({ id: 'm7', upeerId: 'bruno', message: 'Bruno hola', date: 1000 }),
        ]));
        expect(chatIds(conNoLeidos)).toEqual(['bruno']);
        expect(messageIds(conNoLeidos)).toEqual(['m7']);
    });

    it('con «Favoritos» filtra cada sujeto por su propio estado', () => {
        const sections = buildSearchSections('ana', 'favorites', data(messages()));
        expect(chatIds(sections)).toEqual(['grp-equipo']);

        const contacts = sections.find((section) => section.kind === 'contacts');
        expect(contacts?.kind === 'contacts' ? contacts.items.map((item) => item.contact.upeerId) : []).toEqual([]);

        const groups = sections.find((section) => section.kind === 'groups');
        expect(groups?.kind === 'groups' ? groups.items.map((item) => item.group.groupId) : []).toEqual([]);
        expect(messageIds(sections)).toEqual(['m2']);
    });

    it('con «Grupos» oculta Contactos y deja solo grupos y sus mensajes', () => {
        const sections = buildSearchSections('ana', 'groups', data(messages()));
        expect(kinds(sections)).toEqual(['chats', 'contacts', 'groups', 'messages']);
        expect(chatIds(sections)).toEqual(['grp-equipo']);

        const contacts = sections.find((section) => section.kind === 'contacts');
        expect(contacts?.total).toBe(0);
        expect(contacts?.items).toEqual([]);

        const groups = sections.find((section) => section.kind === 'groups');
        expect(groups?.kind === 'groups' ? groups.items.map((item) => item.group.groupId) : []).toEqual(['grp-vecinos']);

        expect(messageIds(sections)).toEqual(['m2', 'm5']);
    });

    it('aplica los topes por sección conservando el total', () => {
        const muchos = Array.from({ length: 7 }, (_, index) => (
            contact({ upeerId: `mateo-${index}`, name: `Mateo ${index}` })
        ));
        const chatty = Array.from({ length: 12 }, (_, index) => (
            message({ id: `mm-${index}`, upeerId: 'mateo-0', message: `Mateo ${index}`, date: index })
        ));
        const sections = buildSearchSections('mateo', 'all', {
            chats: [],
            contacts: muchos.map((item) => ({ contact: item, state: state() })),
            groups: [],
            messages: chatty,
        });
        const contacts = sections.find((section) => section.kind === 'contacts');
        expect(contacts?.kind === 'contacts' ? contacts.items.length : 0).toBe(SEARCH_CONTACT_LIMIT);
        expect(contacts?.total).toBe(7);
        expect(messageIds(sections)).toHaveLength(SEARCH_MESSAGE_LIMIT);
        expect(messagesSection(sections)?.total).toBe(12);

        const ampliadas = buildSearchSections('mateo', 'all', {
            chats: [],
            contacts: muchos.map((item) => ({ contact: item, state: state() })),
            groups: [],
            messages: chatty,
        }, { contacts: 7, messages: 12 });
        const contactosAmpliados = ampliadas.find((section) => section.kind === 'contacts');
        expect(contactosAmpliados?.kind === 'contacts' ? contactosAmpliados.items.length : 0).toBe(7);
        expect(messageIds(ampliadas)).toHaveLength(12);
    });

    it('ordena los chats por fijado y luego por recencia', () => {
        const sections = buildSearchSections('ana', 'all', data());
        expect(chatIds(sections)).toEqual(['grp-equipo', 'ana']);
        const fijado = buildSearchSections('bruno', 'all', data());
        expect(chatIds(fijado)).toEqual(['bruno']);
    });

    it('deja fuera a los contactos bloqueados', () => {
        const sections = buildSearchSections('ana bloqueada', 'all', data(messages()));
        expect(chatIds(sections)).toEqual([]);
        const contacts = sections.find((section) => section.kind === 'contacts');
        expect(contacts?.kind === 'contacts' ? contacts.items : []).toEqual([]);
        expect(messageIds(sections)).toEqual([]);
    });

    it('normaliza acentos en contactos y en mensajes', () => {
        const sections = buildSearchSections('inigo', 'all', data([
            message({ id: 'm8', upeerId: 'ana', message: 'Íñigo llamó', date: 100 }),
        ]));
        expect(chatIds(sections)).toEqual([]);
        const contacts = sections.find((section) => section.kind === 'contacts');
        expect(contacts?.kind === 'contacts' ? contacts.items.map((item) => item.contact.upeerId) : []).toEqual(['inigo']);
        expect(messageIds(sections)).toEqual(['m8']);
    });

    it('no repite un grupo compartido con varios contactos que coinciden', () => {
        const compartido = group({ groupId: 'grp-compartido', name: 'Compartido', members: ['me', 'ana', 'ana-2'] });
        const sections = buildSearchSections('a', 'groups', {
            chats: [],
            contacts: [
                { contact: ana, state: state() },
                { contact: contact({ upeerId: 'ana-2', name: 'Ana Segunda' }), state: state() },
            ],
            groups: [{ group: compartido, state: state() }],
            messages: [],
        });
        const groups = sections.find((section) => section.kind === 'groups');
        expect(groups?.kind === 'groups' ? groups.items : []).toHaveLength(1);
    });
});
