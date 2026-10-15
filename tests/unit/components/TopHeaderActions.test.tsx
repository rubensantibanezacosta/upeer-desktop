import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TopHeaderActions } from '../../../src/components/layout/TopHeaderActions.js';

vi.mock('@mui/icons-material/Search', () => ({ default: () => <span /> }));
vi.mock('@mui/icons-material/LocalPhone', () => ({ default: () => <span /> }));
vi.mock('@mui/icons-material/Videocam', () => ({ default: () => <span /> }));
vi.mock('@mui/icons-material/Check', () => ({ default: () => <span /> }));
vi.mock('@mui/icons-material/MoreVert', () => ({ default: () => <span /> }));
vi.mock('@mui/icons-material/PersonAddAlt1', () => ({ default: () => <span /> }));

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