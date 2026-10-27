import { describe, expect, it } from 'vitest';

import { buildSearchEntities } from '../../../../src/features/search/searchData';
import type { Contact, Group } from '../../../../src/types/chat';

const ana = {
    upeerId: 'ana',
    name: 'Ana',
    address: '300::ana',
    status: 'connected',
} as Contact;

const bloqueado = {
    upeerId: 'bloqueado',
    name: 'Bloqueado',
    address: '300::bloqueado',
    status: 'blocked',
} as Contact;

const equipo = {
    groupId: 'grp-equipo',
    name: 'Equipo',
    adminUpeerId: 'me',
    members: ['me'],
    status: 'active',
} as Group;

describe('buildSearchEntities', () => {
    it('traduce preferencias a estado del chip y deja fuera del listado a los bloqueados', () => {
        const prefs = {
            contactPrefs: { ana: { archived: false, muted: false, pinned: true, unread: true } },
            groupPrefs: { 'grp-equipo': { archived: false, muted: false, pinned: false, unread: true } },
        };

        const entities = buildSearchEntities([ana, bloqueado], [equipo], prefs);

        expect(entities.chats.map((entry) => entry.id)).toEqual(['ana', 'grp-equipo']);
        expect(entities.chats[0].state).toEqual({ favorite: false, pinned: true, unread: true });
        expect(entities.contacts.find((entry) => entry.contact.upeerId === 'ana')?.state.pinned).toBe(true);
        expect(entities.groups[0].state.unread).toBe(true);
    });
});
