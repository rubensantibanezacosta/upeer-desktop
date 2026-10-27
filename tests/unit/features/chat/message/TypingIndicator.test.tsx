import React from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TypingIndicator } from '../../../../../src/features/chat/message/TypingIndicator.js';

describe('TypingIndicator', () => {
    it('muestra tres puntos animados cuando el contacto está escribiendo', () => {
        render(<TypingIndicator activity="typing" />);

        expect(screen.getByLabelText('Escribiendo')).toBeTruthy();
        expect(screen.getAllByTestId('typing-dot')).toHaveLength(3);
        expect(document.querySelector('svg.lucide-mic')).toBeNull();
    });

    it('muestra el micrófono cuando el contacto está grabando audio', () => {
        const { container } = render(<TypingIndicator activity="recording" />);

        expect(screen.getByLabelText('Grabando nota de voz')).toBeTruthy();
        expect(screen.queryAllByTestId('typing-dot')).toHaveLength(0);
        expect(container.querySelector('svg.lucide-mic')).toBeTruthy();
    });
});
