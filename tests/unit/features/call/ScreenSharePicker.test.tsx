import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ScreenSharePicker } from '../../../../src/features/call/ScreenSharePicker.js';

const selectScreenShareSource = vi.fn();
const cancelScreenShareSelection = vi.fn();

Object.defineProperty(window, 'upeer', {
    configurable: true,
    value: {
        selectScreenShareSource,
        cancelScreenShareSelection,
    },
});

const sources = [
    { id: 'screen:1', name: 'Pantalla principal', type: 'screen' as const, thumbnail: 'data:image/png;base64,screen', appIcon: null },
    { id: 'window:2', name: 'Navegador', type: 'window' as const, thumbnail: 'data:image/png;base64,window', appIcon: null },
];

describe('ScreenSharePicker', () => {
    beforeEach(() => {
        selectScreenShareSource.mockReset();
        cancelScreenShareSelection.mockReset();
        selectScreenShareSource.mockResolvedValue({ success: true });
        cancelScreenShareSelection.mockResolvedValue({ success: true });
    });

    it('muestra fuentes, cambia de pestaña y confirma una selección', async () => {
        const onSelect = vi.fn();
        render(<ScreenSharePicker open sources={sources} onClose={vi.fn()} onSelect={onSelect} onError={vi.fn()} />);

        expect(screen.getByRole('radio', { name: 'Compartir con sonido' })).toBeChecked();
        expect(screen.getByRole('button', { name: /Pantalla principal/i })).toBeTruthy();
        fireEvent.click(screen.getByRole('radio', { name: 'Compartir sin sonido' }));
        fireEvent.click(screen.getByRole('tab', { name: 'Ventanas' }));
        const windowButton = screen.getByRole('button', { name: /Navegador/i });
        fireEvent.click(windowButton);

        await waitFor(() => expect(selectScreenShareSource).toHaveBeenCalledWith('window:2'));
        expect(onSelect).toHaveBeenCalledWith(false);
    });

    it('cancela el selector sin confirmar una fuente', () => {
        const onClose = vi.fn();
        render(<ScreenSharePicker open sources={sources} onClose={onClose} onSelect={vi.fn()} onError={vi.fn()} />);

        fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

        expect(cancelScreenShareSelection).toHaveBeenCalledOnce();
        expect(onClose).toHaveBeenCalledOnce();
    });
});