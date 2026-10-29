import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MessageReactions } from '../../../../../src/features/chat/message/MessageReactions.js';

vi.mock('../../../../../src/store/useChatStore.js', () => ({
    useChatStore: (selector: (state: { myIdentity: { upeerId: string } }) => unknown) =>
        selector({ myIdentity: { upeerId: 'mine' } }),
}));

describe('MessageReactions', () => {
    it('quita la reacción propia al pulsar su chip', () => {
        const onToggle = vi.fn();
        render(<MessageReactions reactions={[{ upeerId: 'mine', emoji: '👍' }]} isMe onToggleReact={onToggle} />);

        fireEvent.click(screen.getByText('👍'));
        expect(onToggle).toHaveBeenCalledWith('👍', true);
    });

    it('añade la reacción propia al pulsar el chip de otro', () => {
        const onToggle = vi.fn();
        render(<MessageReactions reactions={[{ upeerId: 'peer', emoji: '❤️' }]} isMe onToggleReact={onToggle} />);

        fireEvent.click(screen.getByText('❤️'));
        expect(onToggle).toHaveBeenCalledWith('❤️', false);
    });

    it('cuenta los actores de cada emoji', () => {
        render(<MessageReactions reactions={[{ upeerId: 'mine', emoji: '😂' }, { upeerId: 'peer', emoji: '😂' }]} isMe={false} onToggleReact={vi.fn()} />);

        expect(screen.getByText('2')).toBeDefined();
    });

    it('no pinta nada sin reacciones', () => {
        const { container } = render(<MessageReactions reactions={[]} isMe onToggleReact={vi.fn()} />);

        expect(container.firstChild).toBeNull();
    });
});
