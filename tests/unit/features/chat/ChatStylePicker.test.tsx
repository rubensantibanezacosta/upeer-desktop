import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { ChatStylePicker } from '../../../../src/features/chat/style/ChatStylePicker.js';
import { CHAT_STYLE_PRESETS } from '../../../../src/features/chat/style/chatStyle.js';

describe('ChatStylePicker', () => {
    it('pinta una opción por preset', () => {
        render(<ChatStylePicker open value="default" onSelect={vi.fn()} onClose={vi.fn()} />);

        for (const preset of CHAT_STYLE_PRESETS) {
            expect(document.querySelector(`[data-chat-style-option="${preset.id}"]`)).not.toBeNull();
        }
    });

    it('marca solo el preset activo', () => {
        render(<ChatStylePicker open value="forest" onSelect={vi.fn()} onClose={vi.fn()} />);

        const forest = document.querySelector('[data-chat-style-option="forest"]');
        const ocean = document.querySelector('[data-chat-style-option="ocean"]');

        expect(forest?.getAttribute('aria-checked')).toBe('true');
        expect(ocean?.getAttribute('aria-checked')).toBe('false');
    });

    it('devuelve el id elegido', () => {
        const onSelect = vi.fn();
        render(<ChatStylePicker open value="default" onSelect={onSelect} onClose={vi.fn()} />);

        fireEvent.click(document.querySelector('[data-chat-style-option="night"]') as HTMLElement);

        expect(onSelect).toHaveBeenCalledWith('night');
    });

    it('muestra la etiqueta de cada preset', () => {
        render(<ChatStylePicker open value="default" onSelect={vi.fn()} onClose={vi.fn()} />);

        expect(screen.getByText('Predeterminado')).toBeDefined();
        expect(screen.getByText('Océano')).toBeDefined();
    });
});
