import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SearchResultsPanel } from '../../../../../src/components/layout/sidebar/SearchResultsPanel.js';
import type { SearchSection } from '../../../../../src/features/search/globalSearch.js';

const baseProps = {
    query: 'ana',
    typingStatus: {},
    messagesLoading: false,
    onSelectContact: vi.fn(),
    onToggleFavorite: vi.fn(),
    onToggleFavoriteGroup: vi.fn(),
    onClearChat: vi.fn(),
    onSelectMessage: vi.fn(),
    onShowAllContacts: vi.fn(),
    onLoadMoreMessages: vi.fn(),
};

const contactSection = (total: number, visible: number): SearchSection => ({
    kind: 'contacts',
    total,
    items: Array.from({ length: visible }, (_, index) => ({
        contact: { upeerId: `c${index}`, name: `Contacto ${index}`, address: `300::c${index}`, status: 'connected' },
        subtitle: `c${index}`,
    })),
});

const messageSection = (total: number, visible: number): SearchSection => ({
    kind: 'messages',
    total,
    items: Array.from({ length: visible }, (_, index) => ({
        id: `m${index}`,
        upeerId: 'ana',
        isMine: false,
        message: `mensaje ${index}`,
        status: 'sent',
        timestamp: '10:00',
        date: 1000 + index,
    })),
});

describe('SearchResultsPanel', () => {
    it('el encabezado dice el total de la sección, no lo que cabe en pantalla', () => {
        render(<SearchResultsPanel {...baseProps} sections={[messageSection(43, 10)]} />);
        expect(screen.getByText('Mensajes · 43')).toBeTruthy();
        expect(screen.queryByText('Mensajes · 10')).toBeNull();
    });

    it('cada sección lleva su propio total', () => {
        render(<SearchResultsPanel {...baseProps} sections={[contactSection(7, 2), messageSection(3, 3)]} />);
        expect(screen.getByText('Contactos · 7')).toBeTruthy();
        expect(screen.getByText('Mensajes · 3')).toBeTruthy();
        expect(screen.getByText('Ver todos los contactos')).toBeTruthy();
        expect(screen.queryByText('Ver más mensajes')).toBeNull();
    });

    it('las filas se pueden enfocar para navegar con el teclado', () => {
        const { container } = render(<SearchResultsPanel {...baseProps} sections={[contactSection(2, 2), messageSection(2, 2)]} />);
        const rows = Array.from(container.querySelectorAll('[data-search-row]'));
        expect(rows.map((row) => row.getAttribute('data-search-row'))).toEqual(['c0', 'c1', 'm0', 'm1']);
        rows.forEach((row) => expect(row.getAttribute('tabindex')).toBe('-1'));
    });
});
