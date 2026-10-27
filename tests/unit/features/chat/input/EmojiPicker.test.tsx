import React from 'react';
import { beforeEach, describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import { EmojiPicker } from '../../../../../src/features/chat/input/EmojiPicker';

describe('EmojiPicker', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it('abre el panel con Recientes como primera pestaña', () => {
        render(<EmojiPicker onSelect={vi.fn()} />);
        fireEvent.click(screen.getByRole('button'));

        const tabs = screen.getAllByRole('tab');
        expect(tabs[0]).toHaveAttribute('aria-label', 'Recientes');
        expect(tabs[1]).toHaveAttribute('aria-label', 'Emoticonos');
        expect(tabs).toHaveLength(9);
    });

    it('avisa cuando aun no hay emojis recientes', () => {
        render(<EmojiPicker onSelect={vi.fn()} />);
        fireEvent.click(screen.getByRole('button'));
        expect(screen.getByText('Todavía no has usado ningún emoji')).toBeInTheDocument();
    });

    it('lista los emojis de la categoria elegida y avisa al elegir', () => {
        const onSelect = vi.fn();
        render(<EmojiPicker onSelect={onSelect} />);
        fireEvent.click(screen.getByRole('button'));
        fireEvent.click(screen.getByRole('tab', { name: 'Emoticonos' }));

        expect(screen.getByText('Emoticonos')).toBeInTheDocument();
        fireEvent.click(screen.getByText('😀'));
        expect(onSelect).toHaveBeenCalledWith('😀');
        expect(JSON.parse(localStorage.getItem('recentEmojis') ?? '[]')).toEqual(['😀']);
    });

    it('filtra por nombre de categoria desde el buscador', () => {
        render(<EmojiPicker onSelect={vi.fn()} />);
        fireEvent.click(screen.getByRole('button'));
        fireEvent.change(screen.getByPlaceholderText('Buscar emoji...'), { target: { value: 'comida' } });

        expect(screen.getByText('Resultados de búsqueda')).toBeInTheDocument();
        expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
    });

    it('no roba el foco del compositor al abrir el panel ni al elegir un emoji', () => {
        const onSelect = vi.fn();
        render(<EmojiPicker onSelect={onSelect} />);
        fireEvent.click(screen.getByRole('button'));

        const toggle = screen.getByRole('button', { name: 'Abrir emojis' });
        expect(pressWithoutFocus(toggle)).toBe(true);

        fireEvent.click(screen.getByRole('tab', { name: 'Emoticonos' }));
        expect(pressWithoutFocus(screen.getByText('😀'))).toBe(true);
    });

    it('devuelve el foco al compositor al cambiar de pestaña', () => {
        const onFocusComposer = vi.fn();
        render(<EmojiPicker onSelect={vi.fn()} onFocusComposer={onFocusComposer} />);
        fireEvent.click(screen.getByRole('button'));
        fireEvent.click(screen.getByRole('tab', { name: 'Emoticonos' }));

        expect(onFocusComposer).toHaveBeenCalledTimes(1);
    });
});

const pressWithoutFocus = (element: Element): boolean => {
    const event = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    element.dispatchEvent(event);
    return event.defaultPrevented;
};
