import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { ChatSearchPanel } from '../../../../src/features/chat/ChatSearchPanel.js';

const setPendingScrollMsgId = vi.fn();

vi.mock('../../../../src/store/useNavigationStore.js', () => ({
    useNavigationStore: <T,>(selector: (state: { setPendingScrollMsgId: (id: string | null) => void }) => T) =>
        selector({ setPendingScrollMsgId }),
}));

const DAY_ONE = new Date(2026, 9, 20, 10, 0, 0).getTime();
const DAY_TWO = new Date(2026, 9, 19, 9, 30, 0).getTime();

describe('ChatSearchPanel', () => {
    const rows = [
        { id: 'msg-1', chatUpeerId: 'peer@300::1', message: 'Hola, ¿cómo estás?', timestamp: DAY_ONE, isMine: true, isDeleted: false },
        { id: 'msg-2', chatUpeerId: 'peer@300::1', message: '{"type":"file","fileName":"doc.pdf"}', timestamp: DAY_TWO, isMine: false, isDeleted: false },
        { id: 'msg-3', chatUpeerId: 'other@300::2', message: 'Mensaje de otra conversación', timestamp: DAY_TWO, isMine: false, isDeleted: false },
        { id: 'msg-4', chatUpeerId: 'peer@300::1', message: 'Mensaje borrado', timestamp: DAY_TWO, isMine: false, isDeleted: true },
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

    it('no busca con el término vacío y explica cómo empezar', async () => {
        render(<ChatSearchPanel conversationKey="peer@300::1" onClose={() => undefined} />);

        expect(screen.getByText('Escribe para buscar en esta conversación')).toBeDefined();
        await new Promise((resolve) => setTimeout(resolve, 350));
        expect(window.upeer.searchMessages).not.toHaveBeenCalled();
    });

    it('muestra solo los resultados de la conversación agrupados por día', async () => {
        render(<ChatSearchPanel conversationKey="peer@300::1" onClose={() => undefined} />);

        fireEvent.change(screen.getByLabelText('Buscar mensajes en esta conversación'), { target: { value: 'hola' } });

        await waitFor(() => {
            expect(window.upeer.searchMessages).toHaveBeenCalledWith('hola', 50, 0);
        });
        expect(await screen.findByText('20/10/2026')).toBeDefined();
        expect(screen.getByText('19/10/2026')).toBeDefined();

        const labels = screen.getAllByRole('button').map((item) => item.getAttribute('aria-label') || '');
        expect(labels.some((label) => label.includes('Hola, ¿cómo estás?'))).toBe(true);
        expect(labels.some((label) => label.includes('doc.pdf'))).toBe(true);
        expect(labels.some((label) => label.includes('otra conversación'))).toBe(false);
        expect(labels.some((label) => label.includes('borrado'))).toBe(false);
    });

    it('resalta el término buscado dentro del resultado', async () => {
        render(<ChatSearchPanel conversationKey="peer@300::1" onClose={() => undefined} />);

        fireEvent.change(screen.getByLabelText('Buscar mensajes en esta conversación'), { target: { value: 'hola' } });

        const button = await screen.findByRole('button', { name: /Ir al mensaje: Hola, ¿cómo estás\?/ });
        const marked = Array.from(button.querySelectorAll('span')).map((span) => span.textContent);
        expect(marked).toContain('Hola');
    });

    it('filtra los resultados por día desde el menú de fechas', async () => {
        render(<ChatSearchPanel conversationKey="peer@300::1" onClose={() => undefined} />);

        fireEvent.change(screen.getByLabelText('Buscar mensajes en esta conversación'), { target: { value: 'hola' } });
        await screen.findByText('20/10/2026');

        fireEvent.click(screen.getByLabelText('Filtrar por fecha'));
        fireEvent.click(await screen.findByLabelText('Filtrar por 20/10/2026'));

        const labels = screen.getAllByRole('button').map((item) => item.getAttribute('aria-label') || '');
        expect(labels.some((label) => label.includes('Hola, ¿cómo estás?'))).toBe(true);
        expect(labels.some((label) => label.includes('doc.pdf'))).toBe(false);
    });

    it('scroll al mensaje y cierra al pulsar un resultado', async () => {
        const onClose = vi.fn();
        render(<ChatSearchPanel conversationKey="peer@300::1" onClose={onClose} />);

        fireEvent.change(screen.getByLabelText('Buscar mensajes en esta conversación'), { target: { value: 'Hola' } });

        const resultButton = await screen.findByRole('button', { name: /Ir al mensaje: Hola, ¿cómo estás\?/ });
        fireEvent.click(resultButton);

        expect(setPendingScrollMsgId).toHaveBeenCalledWith('msg-1');
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('cierra con el botón de cerrar y limpia con el de la lupa', async () => {
        const onClose = vi.fn();
        render(<ChatSearchPanel conversationKey="peer@300::1" onClose={onClose} />);

        const input = screen.getByLabelText('Buscar mensajes en esta conversación') as HTMLInputElement;
        fireEvent.change(input, { target: { value: 'hola' } });
        expect(input.value).toBe('hola');

        fireEvent.click(screen.getByLabelText('Limpiar búsqueda'));
        expect(input.value).toBe('');

        fireEvent.click(screen.getByRole('button', { name: 'Cerrar búsqueda' }));
        expect(onClose).toHaveBeenCalledTimes(1);
    });
});
