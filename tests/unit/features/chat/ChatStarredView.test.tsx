import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { ChatStarredView } from '../../../../src/features/chat/ChatStarredView.js';

const setPendingScrollMsgId = vi.fn();
const toggleMessage = vi.fn();

const state = {
    chatHistory: [] as unknown[],
    messagePrefs: {} as Record<string, { pinned: boolean; reported: boolean; starred: boolean }>,
};

vi.mock('../../../../src/store/useChatStore.js', () => ({
    useChatStore: <T,>(selector: (value: typeof state) => T) => selector(state),
}));

vi.mock('../../../../src/store/useChatActionsStore.js', () => ({
    useChatActionsStore: <T,>(selector: (value: typeof state & { toggleMessage: typeof toggleMessage }) => T) =>
        selector({ ...state, toggleMessage }),
}));

vi.mock('../../../../src/store/useNavigationStore.js', () => ({
    useNavigationStore: <T,>(selector: (value: { setPendingScrollMsgId: typeof setPendingScrollMsgId }) => T) =>
        selector({ setPendingScrollMsgId }),
}));

const message = (id: string, text: string, timestamp: number, isMine = false) => ({
    id,
    upeerId: 'peer',
    isMine,
    message: text,
    status: 'sent',
    timestamp: String(timestamp),
    date: timestamp,
});

const pref = (starred: boolean) => ({ pinned: false, reported: false, starred });
const at = (day: number, hour: number) => new Date(2026, 9, day, hour, 0, 0).getTime();

describe('ChatStarredView', () => {
    beforeEach(() => {
        setPendingScrollMsgId.mockClear();
        toggleMessage.mockClear();
        state.chatHistory = [];
        state.messagePrefs = {};
    });

    it('avisa cuando no hay mensajes destacados', () => {
        render(<ChatStarredView onBack={() => undefined} />);

        expect(screen.getByText('Aún no hay mensajes destacados')).toBeDefined();
        expect(screen.getByText('0 mensajes')).toBeDefined();
    });

    it('lista solo los destacados con su recuento y agrupados por día', () => {
        state.chatHistory = [
            message('m1', 'Mensaje normal', at(20, 9)),
            message('m2', 'Guardado de ayer', at(20, 10)),
            message('m3', 'Guardado de antes', at(19, 10), true),
        ];
        state.messagePrefs = { m2: pref(true), m3: pref(true) };

        render(<ChatStarredView onBack={() => undefined} />);

        expect(screen.getByText('2 mensajes')).toBeDefined();
        expect(screen.queryByText('Mensaje normal')).toBeNull();
        expect(screen.getByText('Guardado de ayer')).toBeDefined();
        expect(screen.getByText('Guardado de antes')).toBeDefined();
        expect(screen.getByText('20/10/2026')).toBeDefined();
        expect(screen.getByText('19/10/2026')).toBeDefined();
    });

    it('abre el mensaje y vuelve a la ficha', () => {
        const onBack = vi.fn();
        state.chatHistory = [message('m1', 'Guardado', at(20, 10))];
        state.messagePrefs = { m1: pref(true) };

        render(<ChatStarredView onBack={onBack} />);
        fireEvent.click(screen.getByRole('button', { name: 'Ir al mensaje destacado: Guardado' }));

        expect(setPendingScrollMsgId).toHaveBeenCalledWith('m1');
        expect(onBack).toHaveBeenCalledOnce();
    });

    it('quita el destacado sin abrir el mensaje', () => {
        const onBack = vi.fn();
        state.chatHistory = [message('m1', 'Guardado', at(20, 10))];
        state.messagePrefs = { m1: pref(true) };

        render(<ChatStarredView onBack={onBack} />);
        fireEvent.click(screen.getByRole('button', { name: 'Quitar de destacados' }));

        expect(toggleMessage).toHaveBeenCalledWith('m1', 'starred');
        expect(onBack).not.toHaveBeenCalled();
    });
});
