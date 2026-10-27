import { describe, expect, it } from 'vitest';

import {
    SEARCH_CONTACT_LIMIT,
    SEARCH_MESSAGE_LIMIT,
    buildSearchSections,
    matchesChip,
    normalizeForSearch,
    type SearchSection,
    type SearchSources,
} from '../../../../src/features/search/globalSearch';
import type { ChatMessage, Contact, Group } from '../../../../src/types/chat';
import type { SidebarFilter } from '../../../../src/store/useNavigationStore';

const contact = (overrides: Partial<Contact> & { upeerId: string }): Contact => ({
    address: '200::1',
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

const sources = (overrides: Partial<SearchSources> = {}): SearchSources => ({
    query: 'ana',
    chip: 'all',
    contacts: [],
    groups: [],
    conversationState: {},
    messages: [],
    ...overrides,
});

const kindOf = (sections: SearchSection[], kind: SearchSection['kind']) => sections.find((section) => section.kind === kind);

describe('normalizeForSearch', () => {
    it('quita diacríticos y mayúsculas', () => {
        expect(normalizeForSearch('  Café  ')).toBe('cafe');
        expect(normalizeForSearch('ÑANDÚ')).toBe('nandu');
    });
});

describe('matchesChip', () => {
    const base = { isFavorite: false, unread: false, isGroup: false };

    it('cada chip aplica su predicado y «Todos» no filtra', () => {
        expect(matchesChip('all', base)).toBe(true);
        expect(matchesChip('unread', { ...base, unread: true })).toBe(true);
        expect(matchesChip('unread', base)).toBe(false);
        expect(matchesChip('favorites', { ...base, isFavorite: true })).toBe(true);
        expect(matchesChip('groups', { ...base, isGroup: true })).toBe(true);
        expect(matchesChip('groups', base)).toBe(false);
    });
});

describe('buildSearchSections', () => {
    const ana = contact({ upeerId: 'ana', name: 'Ana Torres', lastMessageTime: '2026-10-01T10:00:00.000Z' });
    const bruno = contact({ upeerId: 'bruno', name: 'Bruno Anaya', lastMessageTime: '2026-10-02T10:00:00.000Z' });
    const equipo = group({ groupId: 'grp-equipo', name: 'Equipo Ana', members: ['me', 'ana'], lastMessageTime: '2026-10-03T10:00:00.000Z' });
    const vecinos = group({ groupId: 'grp-vecinos', name: 'Vecinos', members: ['me', 'ana'], lastMessageTime: '2026-10-04T10:00:00.000Z' });

    it('no devuelve secciones sin término', () => {
        expect(buildSearchSections(sources({ query: '   ' }))).toEqual([]);
    });

    it('ordena las secciones siempre igual y omite las vacías', () => {
        const sections = buildSearchSections(sources({
            contacts: [ana, bruno, contact({ upeerId: 'x1', name: 'Anabel' })],
            groups: [vecinos],
            messages: [message({ id: 'm1', upeerId: 'ana' })],
        }));

        expect(sections.map((section) => section.kind)).toEqual(['chats', 'contacts', 'groups', 'messages']);
        expect(sections.map((section) => section.kind)).not.toContain('llamadas');
    });

    it('un contacto con conversación solo aparece en Chats', () => {
        const sections = buildSearchSections(sources({ contacts: [ana, bruno] }));
        const chats = kindOf(sections, 'chats');

        expect(chats?.items).toHaveLength(2);
        expect(kindOf(sections, 'contacts')).toBeUndefined();
    });

    it('los contactos sin conversación se ordenan por coincidencia exacta y luego prefijo', () => {
        const sections = buildSearchSections(sources({
            query: 'ana',
            contacts: [
                contact({ upeerId: 'u1', name: 'Mariana' }),
                contact({ upeerId: 'u2', name: 'Ana Belén' }),
                contact({ upeerId: 'u3', name: 'Ana' }),
            ],
        }));

        const contacts = kindOf(sections, 'contacts');
        expect(contacts && contacts.kind === 'contacts' && contacts.items.map((item) => item.contact.name))
            .toEqual(['Ana', 'Ana Belén', 'Mariana']);
    });

    it('«Grupos» oculta Contactos y solo deja conversaciones de grupo', () => {
        const sections = buildSearchSections(sources({
            chip: 'groups',
            contacts: [ana],
            groups: [equipo],
            messages: [message({ id: 'm1', upeerId: 'ana' }), message({ id: 'm2', upeerId: 'grp-equipo', groupId: 'grp-equipo' })],
        }));

        expect(kindOf(sections, 'contacts')).toBeUndefined();
        const chats = kindOf(sections, 'chats');
        expect(chats && chats.kind === 'chats' && chats.items.every((item) => item.kind === 'group')).toBe(true);
        const messages = kindOf(sections, 'messages');
        expect(messages && messages.kind === 'messages' && messages.items.map((item) => item.id)).toEqual(['m2']);
    });

    it('con «Grupos» los grupos que ya están en Chats no se repiten', () => {
        const sections = buildSearchSections(sources({ chip: 'groups', groups: [equipo] }));

        expect(kindOf(sections, 'chats')?.items).toHaveLength(1);
        expect(kindOf(sections, 'groups')).toBeUndefined();
    });

    it('«Grupos en común» suma los grupos de los contactos que coinciden', () => {
        const sections = buildSearchSections(sources({ query: 'ana', contacts: [ana], groups: [vecinos] }));

        const groups = kindOf(sections, 'groups');
        expect(groups && groups.kind === 'groups' && groups.items).toEqual([{ group: vecinos, sharedBy: 'Ana Torres' }]);
    });

    it('«No leídos» filtra cada sección por el estado de su conversación', () => {
        const sections = buildSearchSections(sources({
            chip: 'unread',
            contacts: [ana, bruno],
            groups: [equipo],
            conversationState: { bruno: { unread: true }, 'grp-equipo': { unread: true } },
            messages: [message({ id: 'm1', upeerId: 'ana' }), message({ id: 'm2', upeerId: 'bruno' })],
        }));

        const chats = kindOf(sections, 'chats');
        expect(chats && chats.kind === 'chats' && chats.items.map((item) => (item.kind === 'contact' ? item.contact.upeerId : item.group.groupId)))
            .toEqual(['grp-equipo', 'bruno']);
        const messages = kindOf(sections, 'messages');
        expect(messages && messages.kind === 'messages' && messages.items.map((item) => item.id)).toEqual(['m2']);
    });

    it('«Favoritos» no oculta secciones pero las deja vacías sin favoritos', () => {
        const sections = buildSearchSections(sources({
            chip: 'favorites',
            contacts: [ana],
            groups: [equipo],
            conversationState: { ana: { isFavorite: true } },
        }));

        const chats = kindOf(sections, 'chats');
        expect(chats && chats.kind === 'chats' && chats.items).toHaveLength(1);
        expect(kindOf(sections, 'contacts')).toBeUndefined();
        expect(kindOf(sections, 'groups')).toBeUndefined();
    });

    it('fija los chats fijados por delante y luego ordena por recencia', () => {
        const sections = buildSearchSections(sources({
            query: 'a',
            contacts: [ana, bruno],
            conversationState: { ana: { pinned: true } },
        }));

        const chats = kindOf(sections, 'chats');
        expect(chats && chats.kind === 'chats' && chats.items.map((item) => (item.kind === 'contact' ? item.contact.upeerId : '')))
            .toEqual(['ana', 'bruno']);
    });

    it('excluye contactos bloqueados y limita contactos y mensajes contando antes del tope', () => {
        const blocked = contact({ upeerId: 'u9', name: 'Ana bloqueada', status: 'blocked' });
        const manyContacts = Array.from({ length: SEARCH_CONTACT_LIMIT + 2 }, (_, index) => contact({ upeerId: `x${index}`, name: `Contacto ${index}` }));
        const manyMessages = Array.from({ length: SEARCH_MESSAGE_LIMIT + 5 }, (_, index) => message({ id: `m${index}`, upeerId: 'ana', date: index }));

        const sections = buildSearchSections(sources({ query: 'a', contacts: [blocked, ...manyContacts], messages: manyMessages }));

        const contacts = kindOf(sections, 'contacts');
        expect(contacts && contacts.kind === 'contacts' && contacts.items).toHaveLength(SEARCH_CONTACT_LIMIT);
        expect(contacts?.total).toBe(SEARCH_CONTACT_LIMIT + 2);
        const messages = kindOf(sections, 'messages');
        expect(messages && messages.kind === 'messages' && messages.items).toHaveLength(SEARCH_MESSAGE_LIMIT);
        expect(messages?.total).toBe(SEARCH_MESSAGE_LIMIT + 5);
        expect(messages && messages.kind === 'messages' && messages.items[0].id).toBe(`m${SEARCH_MESSAGE_LIMIT + 4}`);
    });

    it('busca sin acentos y por prefijo de upeerId', () => {
        const accents = contact({ upeerId: 'zoe', name: 'Zoë Ñandú' });
        const byId = contact({ upeerId: 'abc123def', name: 'Sin coincidencia' });

        expect(buildSearchSections(sources({ query: 'zoe nandu', contacts: [accents, byId] }))[0]?.total).toBe(1);
        expect(buildSearchSections(sources({ query: 'abc1', contacts: [accents, byId] }))[0]?.total).toBe(1);
    });

    it('aplica el mismo chip dentro y fuera de la búsqueda', () => {
        const filtered: SidebarFilter[] = ['all', 'unread', 'favorites', 'groups'];
        const state = { ana: { unread: true, isFavorite: true }, 'grp-equipo': { unread: true, isFavorite: true } };

        filtered.forEach((chip) => {
            const sections = buildSearchSections(sources({ chip, contacts: [ana], groups: [equipo], conversationState: state }));
            const chatItems = sections.find((section) => section.kind === 'chats')?.items ?? [];
            const expected = [
                matchesChip(chip, { isFavorite: true, unread: true, isGroup: false }) ? 'ana' : null,
                matchesChip(chip, { isFavorite: true, unread: true, isGroup: true }) ? 'grp-equipo' : null,
            ].filter(Boolean);

            expect(chatItems.map((item) => (item.kind === 'contact' ? item.contact.upeerId : item.group.groupId)).sort())
                .toEqual(expected.sort());
        });
    });
});
