import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { TemporaryMessagesPicker } from '../../../../src/features/chat/retention/TemporaryMessagesPicker.js';
import { ChatRetentionNotice } from '../../../../src/features/chat/retention/ChatRetentionNotice.js';

describe('TemporaryMessagesPicker', () => {
    it('muestra las cuatro opciones y marca la activa', () => {
        render(<TemporaryMessagesPicker open value="7d" onSelect={vi.fn()} onClose={vi.fn()} />);

        expect(document.querySelector('[data-retention-option="off"]')?.getAttribute('aria-checked')).toBe('false');
        expect(document.querySelector('[data-retention-option="7d"]')?.getAttribute('aria-checked')).toBe('true');
        expect(screen.getByText('24 horas')).toBeDefined();
        expect(screen.getByText('90 días')).toBeDefined();
    });

    it('devuelve el id elegido', () => {
        const onSelect = vi.fn();
        render(<TemporaryMessagesPicker open value="off" onSelect={onSelect} onClose={vi.fn()} />);

        fireEvent.click(document.querySelector('[data-retention-option="24h"]') as HTMLElement);

        expect(onSelect).toHaveBeenCalledWith('24h');
    });

    it('avisa de que solo afecta a este dispositivo y a los mensajes nuevos', () => {
        render(<TemporaryMessagesPicker open value="off" onSelect={vi.fn()} onClose={vi.fn()} />);

        expect(screen.getByText(/solo cambia|se borran de este dispositivo/i)).toBeDefined();
        expect(screen.getByText(/ya existen no cambian/i)).toBeDefined();
    });
});

describe('ChatRetentionNotice', () => {
    it('no pinta nada con los temporales desactivados', () => {
        render(<ChatRetentionNotice retention="off" />);
        expect(document.querySelector('[data-retention-notice]')).toBeNull();
    });

    it('pinta el plazo activo', () => {
        render(<ChatRetentionNotice retention="24h" />);
        expect(document.querySelector('[data-retention-notice]')?.textContent).toContain('24 h');
    });
});
