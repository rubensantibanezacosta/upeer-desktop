import React from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TopHeaderActions } from '../../../src/components/layout/TopHeaderActions.js';

describe('TopHeaderActions', () => {
    it('oculta las llamadas en la conversación conmigo mismo', () => {
        render(<TopHeaderActions contactName="Yo" isSelfChat />);

        expect(screen.queryByRole('button', { name: 'Llamada de voz' })).toBeNull();
        expect(screen.queryByRole('button', { name: 'Videollamada' })).toBeNull();
        expect(screen.getByRole('button', { name: 'Buscar en el chat' })).toBeDefined();
    });

    it('mantiene las llamadas en conversaciones con otros contactos', () => {
        render(<TopHeaderActions contactName="Ana" />);

        expect(screen.getByRole('button', { name: 'Llamada de voz' })).toBeDefined();
        expect(screen.getByRole('button', { name: 'Videollamada' })).toBeDefined();
    });
});