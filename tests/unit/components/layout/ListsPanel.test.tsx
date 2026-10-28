import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { ListsPanel } from '../../../../src/components/layout/sidebar/ListsPanel.js';
import { useChatListsStore } from '../../../../src/store/useChatListsStore.js';

const chats = [
    { id: 'alice', name: 'Alice' },
    { id: 'grp-1', name: 'Grupo Uno' },
];

const renderPanel = (handlers: { onApply?: (id: string) => void; onBack?: () => void } = {}) => {
    const spies = { onApply: handlers.onApply ?? vi.fn(), onBack: handlers.onBack ?? vi.fn() };
    render(<ListsPanel chats={chats} {...spies} />);
    return spies;
};

describe('ListsPanel', () => {
    beforeEach(() => {
        localStorage.clear();
        useChatListsStore.setState({ lists: [] });
    });

    it('explica qué es una lista cuando no hay ninguna', () => {
        renderPanel();
        expect(screen.getByText(/Una lista agrupa los chats/)).toBeDefined();
    });

    it('crea una lista desde el diálogo', () => {
        renderPanel();

        fireEvent.click(screen.getByRole('button', { name: 'Crear' }));
        fireEvent.change(screen.getByLabelText('Nombre de la lista'), { target: { value: 'Trabajo' } });
        fireEvent.click(screen.getAllByRole('button', { name: 'Crear' }).at(-1) as HTMLElement);

        expect(useChatListsStore.getState().lists.map((list) => list.name)).toEqual(['Trabajo']);
        expect(screen.getByText('Trabajo')).toBeDefined();
    });

    it('aplica la lista al pulsar ver', () => {
        useChatListsStore.setState({ lists: [{ id: 'list-1', name: 'Trabajo', chatIds: ['alice'] }] });
        const spies = renderPanel();

        fireEvent.click(screen.getByRole('button', { name: 'Ver la lista Trabajo' }));

        expect(spies.onApply).toHaveBeenCalledWith('list-1');
    });

    it('añade y quita chats de la lista', () => {
        useChatListsStore.setState({ lists: [{ id: 'list-1', name: 'Trabajo', chatIds: [] }] });
        renderPanel();

        fireEvent.click(screen.getByRole('button', { name: 'Elegir chats de Trabajo' }));
        fireEvent.click(screen.getByRole('checkbox', { name: 'Incluir Alice en la lista' }));

        expect(useChatListsStore.getState().lists[0].chatIds).toEqual(['alice']);

        fireEvent.click(screen.getByRole('checkbox', { name: 'Incluir Alice en la lista' }));
        expect(useChatListsStore.getState().lists[0].chatIds).toEqual([]);
    });

    it('elimina la lista', () => {
        useChatListsStore.setState({ lists: [{ id: 'list-1', name: 'Trabajo', chatIds: ['alice'] }] });
        renderPanel();

        fireEvent.click(screen.getByRole('button', { name: 'Eliminar la lista Trabajo' }));

        expect(useChatListsStore.getState().lists).toEqual([]);
    });

    it('renombra la lista', () => {
        useChatListsStore.setState({ lists: [{ id: 'list-1', name: 'Trabajo', chatIds: [] }] });
        renderPanel();

        fireEvent.click(screen.getByRole('button', { name: 'Renombrar la lista Trabajo' }));
        fireEvent.change(screen.getByLabelText('Nombre de la lista'), { target: { value: 'Curro' } });
        fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

        expect(useChatListsStore.getState().lists[0].name).toBe('Curro');
    });
});
