import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { ChatSearchBar } from '../../../../src/features/chat/ChatSearchBar.js';

const setPendingScrollMsgId = vi.fn();

vi.mock('../../../../src/store/useNavigationStore.js', () => ({
    useNavigationStore: <T,>(selector: (state: { setPendingScrollMsgId: (id: string | null) => void }) => T) =>
        selector({ setPendingScrollMsgId }),
}));

describe('ChatSearchBar', () => {
    const rows = [
        { id: 'msg-1', chatUpeerId: 'peer@300::1', message: 'Hola, ¿cómo estás?', timestamp: 1700000000000, isMine: true, isDeleted: false },
        { id: 'msg-2', chatUpeerId: 'peer@300::1', message: '{"kind":"file","name":"doc.pdf"}', timestamp: 1700000001000, isMine: false, isDeleted: false },
        { id: 'msg-3', chatUpeerId: 'other@300::2', message: 'Mensaje de otra conversación', timestamp: 1700000002000, isMine: false, isDeleted: false },
        { id: 'msg-4', chatUpeerId: 'peer@300::1', message: 'Mensaje borrado', timestamp: 1700000003000, isMine: false, isDeleted: true },
    ];

    beforeEach(() => {
        setPendingScrollMsgId.mockClear();
        Object.defineProperty(window, 'upeer', {
            configurable: true,
            value: {
                searchMessages: vi.fn(async () => rows),
            },
        });
    });

    it('does not search when the query is empty', async () => {
        render(<ChatSearchBar conversationKey="peer@300::1" onClose={() => undefined} />);

        expect(screen.getByPlaceholderText('Buscar mensajes…')).toBeDefined();
        await new Promise((resolve) => setTimeout(resolve, 350));
        expect(window.upeer.searchMessages).not.toHaveBeenCalled();
    });

    it('shows only the results of the current conversation', async () => {
        render(<ChatSearchBar conversationKey="peer@300::1" onClose={() => undefined} />);

        fireEvent.change(screen.getByPlaceholderText('Buscar mensajes…'), { target: { value: 'hola' } });

        await waitFor(() => {
            expect(window.upeer.searchMessages).toHaveBeenCalledWith('hola');
        });
        const items = await screen.findAllByRole('button');
        const labels = items.map((item) => item.getAttribute('aria-label') || '');
        expect(labels.some((label) => label.includes('Hola, ¿cómo estás?'))).toBe(true);
        expect(labels.some((label) => label.includes('Archivo adjunto'))).toBe(true);
        expect(labels.some((label) => label.includes('otra conversación'))).toBe(false);
        expect(labels.some((label) => label.includes('eliminado'))).toBe(false);
    });

    it('scrolls to the message and closes on result click', async () => {
        const onClose = vi.fn();
        render(<ChatSearchBar conversationKey="peer@300::1" onClose={onClose} />);

        fireEvent.change(screen.getByPlaceholderText('Buscar mensajes…'), { target: { value: 'Hola' } });

        const resultButton = await screen.findByRole('button', { name: /Ir al mensaje: Hola, ¿cómo estás\?/ });
        fireEvent.click(resultButton);

        expect(setPendingScrollMsgId).toHaveBeenCalledWith('msg-1');
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('closes the bar with the close button', () => {
        const onClose = vi.fn();
        render(<ChatSearchBar conversationKey="peer@300::1" onClose={onClose} />);

        fireEvent.click(screen.getByRole('button', { name: 'Cerrar búsqueda' }));

        expect(onClose).toHaveBeenCalledTimes(1);
    });
});