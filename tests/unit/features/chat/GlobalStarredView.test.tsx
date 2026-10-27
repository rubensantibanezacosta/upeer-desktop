import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { GlobalStarredView } from '../../../../src/features/chat/GlobalStarredView.js';

const setPendingScrollMsgId = vi.fn();
const getMessagesByIds = vi.fn();

const state = {
    messagePrefs: {} as Record<string, { pinned: boolean; reported: boolean; starred: boolean }>,
};

vi.mock('../../../../src/store/useChatActionsStore.js', () => ({
    useChatActionsStore: <T,>(selector: (value: typeof state) => T) => selector(state),
}));

vi.mock('../../../../src/store/useNavigationStore.js', () => ({
    useNavigationStore: <T,>(selector: (value: { setPendingScrollMsgId: typeof setPendingScrollMsgId }) => T) =>
        selector({ setPendingScrollMsgId }),
}));

const pref = (starred: boolean) => ({ pinned: false, reported: false, starred });

const contacts = [{ id: 'alice', name: 'Alice' }, { id: 'bob', name: 'Bob' }];
const groups = [{ id: 'grp-1', name: 'Equipo' }];

describe('GlobalStarredView', () => {
    beforeEach(() => {
        setPendingScrollMsgId.mockClear();
        getMessagesByIds.mockReset();
        state.messagePrefs = {};
        Object.defineProperty(window, 'upeer', {
            configurable: true,
            value: { getMessagesByIds },
        });
    });

    it('avisa cuando no hay destacados y no consulta la base', async () => {
        render(<GlobalStarredView contacts={contacts} groups={groups} onOpenChat={vi.fn()} onBack={vi.fn()} />);

        expect(screen.getByText('No hay mensajes destacados')).toBeDefined();
        await waitFor(() => expect(getMessagesByIds).not.toHaveBeenCalled());
    });

    it('reúne los destacados de varios chats con su recuento', async () => {
        state.messagePrefs = { a1: pref(true), g1: pref(true) };
        getMessagesByIds.mockResolvedValue([
            { id: 'a1', chatUpeerId: 'alice', message: 'nota de Alice', timestamp: 2000, isMine: false },
            { id: 'g1', chatUpeerId: 'grp-1', message: 'nota del grupo', timestamp: 1000, isMine: true },
        ]);

        render(<GlobalStarredView contacts={contacts} groups={groups} onOpenChat={vi.fn()} onBack={vi.fn()} />);

        await waitFor(() => expect(screen.getByText('2 mensajes')).toBeDefined());
        expect(screen.getByText('Alice')).toBeDefined();
        expect(screen.getByText('Equipo')).toBeDefined();
        expect(screen.getByText('nota de Alice')).toBeDefined();
        expect(screen.getByText('nota del grupo')).toBeDefined();
        expect(getMessagesByIds).toHaveBeenCalledWith(['a1', 'g1']);
    });

    it('abre el chat del destacado y prepara el salto al mensaje', async () => {
        const onOpenChat = vi.fn();
        state.messagePrefs = { g1: pref(true) };
        getMessagesByIds.mockResolvedValue([
            { id: 'g1', chatUpeerId: 'grp-1', message: 'nota del grupo', timestamp: 1000, isMine: true },
        ]);

        render(<GlobalStarredView contacts={contacts} groups={groups} onOpenChat={onOpenChat} onBack={vi.fn()} />);
        await waitFor(() => expect(screen.getByText('nota del grupo')).toBeDefined());

        fireEvent.click(screen.getByRole('button', { name: 'Ir al mensaje destacado de Equipo: nota del grupo' }));

        expect(setPendingScrollMsgId).toHaveBeenCalledWith('g1');
        expect(onOpenChat).toHaveBeenCalledWith('grp-1');
    });

    it('ignora los borrados que devuelve la base', async () => {
        state.messagePrefs = { a1: pref(true) };
        getMessagesByIds.mockResolvedValue([
            { id: 'a1', chatUpeerId: 'alice', message: 'borrado', timestamp: 2000, isDeleted: true },
        ]);

        render(<GlobalStarredView contacts={contacts} groups={groups} onOpenChat={vi.fn()} onBack={vi.fn()} />);

        await waitFor(() => expect(screen.getByText('No hay mensajes destacados')).toBeDefined());
    });

    it('vuelve atrás desde la cabecera', () => {
        const onBack = vi.fn();
        render(<GlobalStarredView contacts={contacts} groups={groups} onOpenChat={vi.fn()} onBack={onBack} />);

        fireEvent.click(screen.getByRole('button', { name: 'Volver a los chats' }));

        expect(onBack).toHaveBeenCalledOnce();
    });
});
