import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
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

const message: ChatMessage = {
    id: 'msg-1',
    upeerId: 'peer-a',
    isMine: false,
    message: 'Hola',
    status: 'read',
    timestamp: '10:00',
    date: 1710000000000,
};

const renderChatArea = (peerActivity: 'typing' | 'recording' | null, chatHistory: ChatMessage[] = [message]) =>
    render(
        <ChatArea
            chatHistory={chatHistory}
            myIp=""
            contacts={[]}
            onReply={vi.fn()}
            onReact={vi.fn()}
            onEdit={vi.fn()}
            onDelete={vi.fn()}
            peerActivity={peerActivity}
        />,
    );

describe('ChatArea actividad del contacto', () => {
    it('muestra la burbuja de escribiendo al final de la conversación', () => {
        renderChatArea('typing');

        expect(screen.getByLabelText('Escribiendo')).toBeTruthy();
        expect(screen.getAllByTestId('typing-dot')).toHaveLength(3);
    });

    it('muestra la burbuja de grabación de audio', () => {
        const { container } = renderChatArea('recording');

        expect(screen.getByLabelText('Grabando nota de voz')).toBeTruthy();
        expect(container.querySelector('svg.lucide-mic')).toBeTruthy();
    });

    it('mantiene la conversación vacía sin actividad', () => {
        renderChatArea(null, []);

        expect(screen.queryByLabelText('Escribiendo')).toBeNull();
        expect(screen.queryByLabelText('Grabando nota de voz')).toBeNull();
    });

    it('muestra la actividad aunque todavía no haya mensajes', () => {
        renderChatArea('typing', []);

        expect(screen.getByLabelText('Escribiendo')).toBeTruthy();
    });
});
