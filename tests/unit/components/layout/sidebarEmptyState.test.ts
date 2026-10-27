import { describe, expect, it, vi } from 'vitest';
import { resolveSidebarEmptyState } from '../../../../src/components/layout/sidebar/sidebarEmptyState.js';
import type { SidebarEmptyStateInput } from '../../../../src/components/layout/sidebar/sidebarEmptyState.js';

const baseInput = (overrides: Partial<SidebarEmptyStateInput> = {}): SidebarEmptyStateInput => ({
    filter: 'all',
    loading: false,
    search: '',
    visibleCount: 0,
    sourceCount: 0,
    onOpenNew: vi.fn(),
    onShowAll: vi.fn(),
    onClearSearch: vi.fn(),
    ...overrides,
});

const emptyModel = (overrides: Partial<SidebarEmptyStateInput> = {}) => {
    const model = resolveSidebarEmptyState(baseInput(overrides));
    if (!model || model.kind !== 'empty') throw new Error(`expected an empty state, got ${model?.kind ?? 'null'}`);
    return model;
};

describe('sidebar empty state resolver', () => {
    it('renders nothing while there are conversations to show', () => {
        expect(resolveSidebarEmptyState(baseInput({ visibleCount: 2 }))).toBeNull();
        expect(resolveSidebarEmptyState(baseInput({ filter: 'unread', visibleCount: 1 }))).toBeNull();
    });

    it('uses the loading state before deciding anything else', () => {
        expect(resolveSidebarEmptyState(baseInput({ loading: true }))).toEqual({ kind: 'loading', label: 'Cargando conversaciones…' });
    });

    it('offers a new conversation when the whole list is empty', () => {
        const model = emptyModel();
        expect(model.title).toBe('Sin conversaciones');
        expect(model.action?.label).toBe('Nueva conversación');
    });

    it('offers to create a group, or to go back to every chat without the callback', () => {
        expect(emptyModel({ filter: 'groups' }).action?.label).toBe('Ver todos los chats');
        expect(emptyModel({ filter: 'groups', onCreateGroup: vi.fn() }).action?.label).toBe('Crear grupo');
    });

    it('gives unread and favorites the same shape as every other filter', () => {
        const unread = emptyModel({ filter: 'unread', sourceCount: 8 });
        const favorites = emptyModel({ filter: 'favorites', sourceCount: 8 });
        expect(unread.title).toBe('Sin mensajes no leídos');
        expect(favorites.title).toBe('Sin favoritos');
        expect(unread.action?.label).toBe('Ver todos los chats');
        expect(favorites.action?.label).toBe('Ver todos los chats');
    });

    it('replaces the filter copy with a search result state when a query filters everything out', () => {
        const model = emptyModel({ filter: 'favorites', search: '  ana  ', sourceCount: 3 });
        expect(model.title).toBe('Sin coincidencias');
        expect(model.subtitle).toContain('"ana"');
        expect(model.action?.label).toBe('Limpiar búsqueda');
        expect(model.secondaryAction?.label).toBe('Quitar filtro');
    });

    it('keeps both exits when the chip empties the search even without candidates', () => {
        const model = emptyModel({ filter: 'unread', search: 'ana', sourceCount: 0 });
        expect(model.title).toBe('Sin coincidencias');
        expect(model.action?.label).toBe('Limpiar búsqueda');
        expect(model.secondaryAction?.label).toBe('Quitar filtro');
    });

    it('offers only the search exit without a chip', () => {
        const model = emptyModel({ search: 'ana', sourceCount: 3 });
        expect(model.action?.label).toBe('Limpiar búsqueda');
        expect(model.secondaryAction).toBeUndefined();
    });

    it('keeps the filter copy when the query is set but there is nothing to search', () => {
        expect(emptyModel({ search: 'ana', sourceCount: 0 }).title).toBe('Sin conversaciones');
    });
});
