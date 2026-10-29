import { describe, expect, it, vi } from 'vitest';
import { buildContactInfoActions } from '../../../../src/components/layout/contactInfoPanelSupport.js';
import type { Contact } from '../../../../src/types/chat.js';

function contact(overrides: Partial<Contact> = {}): Contact {
    return { upeerId: 'b'.repeat(64), name: 'Ana', address: '', status: 'connected', ...overrides };
}

const noop = () => undefined;

function build(target: Contact) {
    return buildContactInfoActions({
        contact: target,
        onShare: noop,
        onArchive: noop,
        onMute: noop,
        onFavorite: noop,
        onClearChat: noop,
        onBlockContact: vi.fn(),
        onDeleteRequest: vi.fn(),
    });
}

describe('acciones del panel de información', () => {
    it('ofrece bloquear y eliminar con un contacto normal', () => {
        const { dangerActions } = build(contact());

        expect(dangerActions.map((action) => action.key)).toEqual(['clear', 'block', 'delete']);
    });

    it('no ofrece bloquear ni eliminar contra uno mismo', () => {
        const { dangerActions } = build(contact({ upeerId: 'me', name: 'Rubén', isSelf: true }));

        expect(dangerActions.map((action) => action.key)).toEqual(['clear']);
    });

    it('no ofrece favoritos en el chat propio', () => {
        const { utilityActions } = build(contact({ upeerId: 'me', name: 'Rubén', isSelf: true }));

        expect(utilityActions.map((action) => action.key)).toEqual(['share', 'mute', 'archive']);
    });

    it('mantiene favoritos con un contacto normal', () => {
        const { utilityActions } = build(contact());

        expect(utilityActions.map((action) => action.key)).toContain('favorite');
    });
});
