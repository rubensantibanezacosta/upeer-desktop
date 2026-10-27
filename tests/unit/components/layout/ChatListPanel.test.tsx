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

        expect(screen.getByText('Mensajes · 1')).toBeTruthy();
        expect(screen.queryByText('Sin conversaciones')).toBeNull();
    });
});

const anaContact = { upeerId: 'ana', name: 'Ana', address: '300::ana', status: 'connected' as const };

describe('ChatListPanel navegación por teclado', () => {
    const sections: SearchSection[] = [
        { kind: 'contacts', total: 2, items: [{ contact: anaContact, subtitle: 'ana' }, { contact: { ...anaContact, upeerId: 'bea', name: 'Bea' }, subtitle: 'bea' }] },
        { kind: 'messages', total: 1, items: [message('m1', 'Hola Ana')] },
    ];

    const renderSearch = (onSelectContact = vi.fn()) => {
        render(
            <ChatListPanel
                {...baseProps}
                entries={[{ kind: 'contact', contact: anaContact, time: 1 }]}
                sidebarSearch="a"
                searchSections={sections}
                onSelectContact={onSelectContact}
            />,
        );
        return onSelectContact;
    };

    it('la flecha abajo baja del buscador a la primera fila y recorre las demás', () => {
        renderSearch();
        const input = screen.getByPlaceholderText('Busca chats, contactos, grupos o mensajes');
        fireEvent.keyDown(input, { key: 'ArrowDown' });
        const rows = Array.from(document.querySelectorAll<HTMLElement>('[data-search-row]'));
        expect(document.activeElement).toBe(rows[0]);
        fireEvent.keyDown(rows[0], { key: 'ArrowDown' });
        expect(document.activeElement).toBe(rows[1]);
        fireEvent.keyDown(rows[1], { key: 'ArrowUp' });
        expect(document.activeElement).toBe(rows[0]);
    });

    it('Intro abre la fila enfocada', () => {
        const onSelectContact = renderSearch();
        const input = screen.getByPlaceholderText('Busca chats, contactos, grupos o mensajes');
        fireEvent.keyDown(input, { key: 'ArrowDown' });
        const row = document.querySelector<HTMLElement>('[data-search-row]') as HTMLElement;
        fireEvent.keyDown(row, { key: 'Enter' });
        expect(onSelectContact).toHaveBeenCalledWith('ana');
    });

    it('Escape limpia el término sin salir del buscador', () => {
        const onSearchChange = vi.fn();
        render(
            <ChatListPanel {...baseProps} sidebarSearch="a" searchSections={sections} onSearchChange={onSearchChange} />,
        );
        fireEvent.keyDown(screen.getByPlaceholderText('Busca chats, contactos, grupos o mensajes'), { key: 'Escape' });
        expect(onSearchChange).toHaveBeenCalledWith('');
    });
});

describe('ChatListPanel scroll de la lista', () => {
    it('recupera la posición al vaciar la búsqueda', () => {
        const entries = [{ kind: 'contact' as const, contact: anaContact, time: 1 }];
        const { rerender } = render(<ChatListPanel {...baseProps} entries={entries} />);
        const scroll = screen.getByTestId('chat-list-scroll');
        let scrollTop = 0;
        Object.defineProperty(scroll, 'scrollTop', {
            configurable: true,
            get: () => scrollTop,
            set: (value: number) => { scrollTop = value; },
        });

        scrollTop = 240;
        fireEvent.scroll(scroll);

        rerender(<ChatListPanel {...baseProps} entries={entries} sidebarSearch="a" searchSections={[{ kind: 'contacts', total: 1, items: [{ contact: anaContact, subtitle: 'ana' }] }]} />);
        scrollTop = 0;

        rerender(<ChatListPanel {...baseProps} entries={entries} />);
        expect(scrollTop).toBe(240);
    });
});
