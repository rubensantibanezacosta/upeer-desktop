import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { ChatSearchView } from '../../../../src/features/chat/ChatSearchView.js';

const setPendingScrollMsgId = vi.fn();

vi.mock('../../../../src/store/useNavigationStore.js', () => ({
    useNavigationStore: <T,>(selector: (state: { setPendingScrollMsgId: (id: string | null) => void }) => T) =>
        selector({ setPendingScrollMsgId }),
}));

const at = (day: number, hour: number) => new Date(2026, 9, day, hour, 0, 0).getTime();
const row = (id: string, message: string, timestamp: number, isMine = true) => ({
    id,
    chatUpeerId: 'peer',
    message,
    timestamp,
    isMine,
    isDeleted: false,
});

const firstPage = [
    row('m1', 'Hola, ¿cómo estás?', at(20, 10)),
    row('m2', 'otra cosa', at(20, 9)),
    row('m3', '{"type":"file","fileName":"doc.pdf"}', at(19, 9), false),
];

describe('ChatSearchView', () => {
    beforeEach(() => {
        setPendingScrollMsgId.mockClear();
        Object.defineProperty(window, 'upeer', {
            configurable: true,
            value: { searchChatMessages: vi.fn(async () => firstPage) },
        });
    });

    it('no busca con el término vacío', async () => {
        render(<ChatSearchView conversationKey="peer" onBack={() => undefined} />);

        expect(screen.getByText('Busca en toda la conversación')).toBeDefined();
        await new Promise((resolve) => setTimeout(resolve, 350));
        expect(window.upeer.searchChatMessages).not.toHaveBeenCalled();
    });

    it('pide la primera página del chat y agrupa por día', async () => {
        render(<ChatSearchView conversationKey="peer" onBack={() => undefined} />);

        fireEvent.change(screen.getByLabelText('Buscar mensajes en esta conversación'), { target: { value: 'hola' } });

        await waitFor(() => {
            expect(window.upeer.searchChatMessages).toHaveBeenCalledWith('peer', 'hola', 40, 0, undefined);
        });
        expect(await screen.findByText('20/10/2026')).toBeDefined();
        expect(screen.getByText('19/10/2026')).toBeDefined();
        expect(screen.queryByText(/últimos 50/)).toBeNull();
    });

    it('carga la siguiente página al llegar al final del scroll', async () => {
        const secondPage = [row('m4', 'hola desde el fondo', at(18, 9))];
        (window.upeer.searchChatMessages as ReturnType<typeof vi.fn>).mockImplementation(async (_chat, _query, limit, offset) =>
            (offset === 0 ? firstPage.concat(Array.from({ length: 37 }, (_, index) => row(`fill-${index}`, 'hola', at(17, 1)))) : secondPage).slice(0, limit));

        render(<ChatSearchView conversationKey="peer" onBack={() => undefined} />);
        fireEvent.change(screen.getByLabelText('Buscar mensajes en esta conversación'), { target: { value: 'hola' } });
        await waitFor(() => expect(window.upeer.searchChatMessages).toHaveBeenCalledTimes(1));

        const scroller = screen.getAllByRole('list')[0].parentElement as HTMLDivElement;
        Object.defineProperty(scroller, 'scrollHeight', { configurable: true, value: 1000 });
        Object.defineProperty(scroller, 'clientHeight', { configurable: true, value: 400 });
        Object.defineProperty(scroller, 'scrollTop', { configurable: true, value: 600 });
        fireEvent.scroll(scroller);

        await waitFor(() => {
            expect(window.upeer.searchChatMessages).toHaveBeenLastCalledWith('peer', 'hola', 40, 40, undefined);
        });
        expect(await screen.findByRole('button', { name: /Ir al mensaje: hola desde el fondo/ })).toBeDefined();
    });

    it('filtra por un día concreto desde el calendario', async () => {
        render(<ChatSearchView conversationKey="peer" onBack={() => undefined} />);
        fireEvent.change(screen.getByLabelText('Buscar mensajes en esta conversación'), { target: { value: 'hola' } });
        await screen.findByText('20/10/2026');

        fireEvent.click(screen.getByLabelText('Filtrar por fecha'));
        fireEvent.click(screen.getByLabelText('Filtrar por 19 de octubre 2026'));

        const from = new Date(2026, 9, 19, 0, 0, 0).getTime();
        const to = new Date(2026, 9, 20, 0, 0, 0).getTime();
        await waitFor(() => {
            expect(window.upeer.searchChatMessages).toHaveBeenLastCalledWith('peer', 'hola', 40, 0, { from, to });
        });
        expect(await screen.findByText('Filtrando el 19/10/2026')).toBeDefined();
    });

    it('permite cambiar de mes y quitar el filtro de fecha', async () => {
        render(<ChatSearchView conversationKey="peer" onBack={() => undefined} />);
        fireEvent.change(screen.getByLabelText('Buscar mensajes en esta conversación'), { target: { value: 'hola' } });
        await screen.findByText('20/10/2026');

        fireEvent.click(screen.getByLabelText('Filtrar por fecha'));
        fireEvent.click(screen.getByLabelText('Mes siguiente'));
        expect(screen.getByText('noviembre 2026')).toBeDefined();
        fireEvent.click(screen.getByLabelText('Mes anterior'));
        expect(screen.getByText('octubre 2026')).toBeDefined();

        fireEvent.click(screen.getByLabelText('Filtrar por 20 de octubre 2026'));
        fireEvent.click(await screen.findByLabelText('Quitar el filtro de fecha activo'));

        await waitFor(() => {
            expect(window.upeer.searchChatMessages).toHaveBeenLastCalledWith('peer', 'hola', 40, 0, undefined);
        });
    });

    it('resalta el término y abre el mensaje al pulsarlo', async () => {
        const onBack = vi.fn();
        render(<ChatSearchView conversationKey="peer" onBack={onBack} />);
        fireEvent.change(screen.getByLabelText('Buscar mensajes en esta conversación'), { target: { value: 'hola' } });

        const result = await screen.findByRole('button', { name: /Ir al mensaje: Hola, ¿cómo estás\?/ });
        const marked = Array.from(result.querySelectorAll('span')).map((span) => span.textContent);
        expect(marked).toContain('Hola');

        fireEvent.click(result);
        expect(setPendingScrollMsgId).toHaveBeenCalledWith('m1');
        expect(onBack).toHaveBeenCalledOnce();
    });

    it('avisa cuando no hay resultados', async () => {
        (window.upeer.searchChatMessages as ReturnType<typeof vi.fn>).mockImplementation(async () => []);
        render(<ChatSearchView conversationKey="peer" onBack={() => undefined} />);

        fireEvent.change(screen.getByLabelText('Buscar mensajes en esta conversación'), { target: { value: 'nada' } });

        expect(await screen.findByText('No se han encontrado mensajes')).toBeDefined();
    });
});
