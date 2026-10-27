import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ChatListPanel } from '../../../../src/components/layout/sidebar/ChatListPanel.js';
import type { SearchSection } from '../../../../src/features/search/globalSearch.js';
import type { ChatMessage } from '../../../../src/types/chat.js';

const noLoading = { chats: false, contacts: false, groups: false, messages: false };

const baseProps = {
    entries: [],
    sidebarSearch: '',
    sidebarFilter: 'all' as const,
    searchSections: [] as SearchSection[],
    searchLoading: noLoading,
    typingStatus: {},
    onSelectContact: vi.fn(),
    onToggleFavorite: vi.fn(),
    onToggleFavoriteGroup: vi.fn(),
    onClearChat: vi.fn(),
    onOpenNew: vi.fn(),
    onFilterChange: vi.fn(),
    onSearchChange: vi.fn(),
    onSelectMessage: vi.fn(),
    onShowAllContacts: vi.fn(),
    onLoadMoreMessages: vi.fn(),
};

const message = (id: string, text: string): ChatMessage => ({
    id,
    upeerId: 'ana',
    isMine: false,
    message: text,
    status: 'sent',
    timestamp: '10:00',
    date: 1000,
});

describe('ChatListPanel empty state', () => {
    it('no anuncia que no hay conversaciones mientras se está cargando', () => {
        render(<ChatListPanel {...baseProps} loading />);
        expect(screen.getByLabelText('Cargando conversaciones…')).toBeTruthy();
        expect(screen.queryByText('Sin conversaciones')).toBeNull();
    });

    it('anuncia el vacío cuando la carga ha terminado', () => {
        render(<ChatListPanel {...baseProps} />);
        expect(screen.getByText('Sin conversaciones')).toBeTruthy();
    });

    it('con término y chip ofrece limpiar la búsqueda y quitar el filtro', () => {
        const onClearSearch = vi.fn();
        const onShowAll = vi.fn();
        render(
            <ChatListPanel
                {...baseProps}
                entries={[{ kind: 'contact', contact: { upeerId: 'ana', name: 'Ana', address: '300::ana', status: 'connected' }, time: 1 }]}
                sidebarSearch="ana"
                sidebarFilter="favorites"
                onSearchChange={onClearSearch}
                onFilterChange={onShowAll}
            />,
        );

        expect(screen.getByText('Sin coincidencias')).toBeTruthy();
        fireEvent.click(screen.getByText('Limpiar búsqueda'));
        expect(onClearSearch).toHaveBeenCalledWith('');
        fireEvent.click(screen.getByText('Quitar filtro'));
        expect(onShowAll).toHaveBeenCalledWith('all');
    });

    it('pinta las secciones con resultados y no el vacío de la lista', () => {
        render(
            <ChatListPanel
                {...baseProps}
                sidebarSearch="ana"
                searchSections={[{ kind: 'messages', total: 1, items: [message('m1', 'Hola Ana')] }]}
            />,
        );

        expect(screen.getByText('Mensajes')).toBeTruthy();
        expect(screen.queryByText('Sin conversaciones')).toBeNull();
    });
});
