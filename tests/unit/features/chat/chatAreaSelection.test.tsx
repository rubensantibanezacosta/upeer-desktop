import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ChatMessage } from '../../../../src/types/chat.js';

const setPendingScrollMsgId = vi.fn();

vi.mock('../../../../src/store/useNavigationStore.js', () => ({
    useNavigationStore: () => ({ pendingScrollMsgId: null, setPendingScrollMsgId }),
}));

vi.mock('../../../../src/store/useChatStore.js', () => ({
    useChatStore: (selector?: (state: Record<string, unknown>) => unknown) => {
        const state = {
            isWindowedHistory: false,
            reloadLatestHistory: vi.fn(),
            loadOlderHistory: vi.fn(),
            syncStatus: { pendingEntityIds: [] },
        };
        return selector ? selector(state) : state;
    },
}));

import { ChatArea } from '../../../../src/features/chat/ChatArea.js';
import { useChatActionsStore } from '../../../../src/store/useChatActionsStore.js';

const mine = (id: string, text: string): ChatMessage => ({
    id,
    upeerId: 'peer-a',
    isMine: true,
    message: text,
    status: 'read',
    timestamp: '10:00',
    date: 1710000000000,
});

const theirs = (id: string, text: string): ChatMessage => ({
    id,
    upeerId: 'peer-a',
    isMine: false,
    message: text,
    status: 'read',
    timestamp: '10:01',
    date: 1710000060000,
});

const history = [mine('m1', 'primero'), theirs('m2', 'segundo'), mine('m3', 'tercero')];

const writeClipboardText = vi.fn().mockResolvedValue({ success: true });

const renderChatArea = (props: Partial<React.ComponentProps<typeof ChatArea>> = {}) => {
    const handlers = {
        onReply: vi.fn(),
        onReact: vi.fn(),
        onEdit: vi.fn(),
        onDelete: vi.fn(),
        onForwardMany: vi.fn(),
    };
    render(
        <ChatArea
            chatHistory={history}
            myIp=""
            contacts={[]}
            {...handlers}
            {...props}
        />,
    );
    return handlers;
};

const enterSelectionFrom = async (msgId: string) => {
    const wrapper = document.getElementById(`msg-${msgId}`) as HTMLElement;
    fireEvent.mouseEnter(wrapper);
    fireEvent.click(screen.getByLabelText(`Abrir acciones del mensaje ${msgId}`));
    fireEvent.click(await screen.findByText('Seleccionar'));
    await waitFor(() => expect(screen.getByTestId('selection-toolbar')).toBeDefined());
};

describe('ChatArea selección múltiple', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        useChatActionsStore.setState({ messagePrefs: {}, contactPrefs: {}, groupPrefs: {} });
        Object.assign(window, {
            upeer: { ...(window as unknown as { upeer?: object }).upeer, writeClipboardText },
        });
    });

    it('entra en selección desde el menú del mensaje', async () => {
        renderChatArea();
        expect(screen.queryByTestId('selection-toolbar')).toBeNull();

        await enterSelectionFrom('m1');

        expect(screen.getByTestId('selection-toolbar')).toBeDefined();
        expect(screen.getByText('1 seleccionado')).toBeDefined();
        expect(document.getElementById('msg-m1')?.getAttribute('data-selected')).toBe('true');
    });

    it('suma y resta mensajes al pulsarlos', async () => {
        renderChatArea();
        await enterSelectionFrom('m1');

        fireEvent.click(document.getElementById('msg-m2') as HTMLElement);
        expect(screen.getByText('2 seleccionados')).toBeDefined();

        fireEvent.click(document.getElementById('msg-m2') as HTMLElement);
        expect(screen.getByText('1 seleccionado')).toBeDefined();

        fireEvent.click(document.getElementById('msg-m1') as HTMLElement);
        expect(document.getElementById('msg-m1')?.getAttribute('data-selected')).toBeNull();
        expect(screen.queryByTestId('selection-toolbar')).toBeNull();
    });

    it('destaca todos los seleccionados y sale del modo', async () => {
        renderChatArea();
        await enterSelectionFrom('m1');
        fireEvent.click(document.getElementById('msg-m2') as HTMLElement);

        fireEvent.click(screen.getByLabelText('Destacar seleccionados'));

        await waitFor(() => expect(screen.queryByTestId('selection-toolbar')).toBeNull());
        const prefs = useChatActionsStore.getState().messagePrefs;
        expect(prefs.m1?.starred).toBe(true);
        expect(prefs.m2?.starred).toBe(true);
        expect(prefs.m3?.starred).toBeUndefined();
    });

    it('elimina solo los mensajes propios', async () => {
        const handlers = renderChatArea();
        await enterSelectionFrom('m1');
        fireEvent.click(document.getElementById('msg-m2') as HTMLElement);
        fireEvent.click(document.getElementById('msg-m3') as HTMLElement);

        fireEvent.click(screen.getByLabelText('Eliminar seleccionados'));

        expect(handlers.onDelete.mock.calls.map(([id]) => id)).toEqual(['m1', 'm3']);
    });

    it('copia el texto en orden de conversación', async () => {
        renderChatArea();
        await enterSelectionFrom('m3');
        fireEvent.click(document.getElementById('msg-m1') as HTMLElement);

        fireEvent.click(screen.getByLabelText('Copiar seleccionados'));

        await waitFor(() => expect(writeClipboardText).toHaveBeenCalledWith('primero\ntercero'));
    });

    it('reenvía los seleccionados en orden', async () => {
        const handlers = renderChatArea();
        await enterSelectionFrom('m3');
        fireEvent.click(document.getElementById('msg-m1') as HTMLElement);

        fireEvent.click(screen.getByLabelText('Reenviar seleccionados'));

        expect(handlers.onForwardMany).toHaveBeenCalledTimes(1);
        const forwarded = handlers.onForwardMany.mock.calls[0][0] as ChatMessage[];
        expect(forwarded.map((msg) => msg.id)).toEqual(['m1', 'm3']);
    });

    it('sale del modo con la X', async () => {
        renderChatArea();
        await enterSelectionFrom('m1');

        fireEvent.click(screen.getByLabelText('Salir de la selección'));

        await waitFor(() => expect(screen.queryByTestId('selection-toolbar')).toBeNull());
        expect(document.getElementById('msg-m1')?.getAttribute('data-selected')).toBeNull();
    });
});
