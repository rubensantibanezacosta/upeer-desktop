import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SidebarListPanel } from '../../../../src/components/layout/sidebar/SidebarListPanel.js';

const renderPanel = (loading: boolean) => render(
    <SidebarListPanel
        contacts={[]}
        filteredGroups={[]}
        groups={[]}
        loading={loading}
        mergedList={[]}
        onClearChat={vi.fn()}
        onFilterChange={vi.fn()}
        onOpenNew={vi.fn()}
        onSearchChange={vi.fn()}
        onSelectContact={vi.fn()}
        onSelectMessage={vi.fn()}
        onToggleFavorite={vi.fn()}
        onToggleFavoriteGroup={vi.fn()}
        searchResults={[]}
        sidebarFilter="all"
        sidebarSearch=""
        typingStatus={{}}
    />,
);

describe('SidebarListPanel empty state', () => {
    it('no anuncia que no hay conversaciones mientras se está cargando', () => {
        renderPanel(true);
        expect(screen.getByLabelText('Cargando conversaciones…')).toBeTruthy();
        expect(screen.queryByText('Sin conversaciones')).toBeNull();
    });

    it('anuncia el vacío cuando la carga ha terminado', () => {
        renderPanel(false);
        expect(screen.getByText('Sin conversaciones')).toBeTruthy();
        expect(screen.queryByLabelText('Cargando conversaciones…')).toBeNull();
    });
});
