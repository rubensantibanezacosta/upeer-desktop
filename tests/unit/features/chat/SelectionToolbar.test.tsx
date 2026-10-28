import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { SelectionToolbar } from '../../../../src/features/chat/selection/SelectionToolbar.js';
import type { SelectionSummary } from '../../../../src/features/chat/selection/bulkSelection.js';

const baseSummary = (overrides: Partial<SelectionSummary> = {}): SelectionSummary => ({
    total: 2,
    mine: 2,
    others: 0,
    allStarred: false,
    allPinned: false,
    ...overrides,
});

const renderToolbar = (summary: SelectionSummary, handlers: Partial<Record<'onClear' | 'onStar' | 'onPin' | 'onCopy' | 'onForward' | 'onDelete', () => void>> = {}) => {
    const spies = {
        onClear: handlers.onClear ?? vi.fn(),
        onStar: handlers.onStar ?? vi.fn(),
        onPin: handlers.onPin ?? vi.fn(),
        onCopy: handlers.onCopy ?? vi.fn(),
        onForward: handlers.onForward ?? vi.fn(),
        onDelete: handlers.onDelete ?? vi.fn(),
    };
    render(<SelectionToolbar summary={summary} {...spies} />);
    return spies;
};

describe('SelectionToolbar', () => {
    it('describe cuántos hay seleccionados', () => {
        renderToolbar(baseSummary({ total: 1 }));
        expect(screen.getByText('1 seleccionado')).toBeDefined();
    });

    it('lanza cada acción al pulsarla', () => {
        const spies = renderToolbar(baseSummary());
        fireEvent.click(screen.getByLabelText('Destacar seleccionados'));
        fireEvent.click(screen.getByLabelText('Fijar seleccionados'));
        fireEvent.click(screen.getByLabelText('Copiar seleccionados'));
        fireEvent.click(screen.getByLabelText('Reenviar seleccionados'));
        fireEvent.click(screen.getByLabelText('Eliminar seleccionados'));
        fireEvent.click(screen.getByLabelText('Salir de la selección'));

        expect(spies.onStar).toHaveBeenCalledTimes(1);
        expect(spies.onPin).toHaveBeenCalledTimes(1);
        expect(spies.onCopy).toHaveBeenCalledTimes(1);
        expect(spies.onForward).toHaveBeenCalledTimes(1);
        expect(spies.onDelete).toHaveBeenCalledTimes(1);
        expect(spies.onClear).toHaveBeenCalledTimes(1);
    });

    it('deshabilita eliminar cuando no hay mensajes propios', () => {
        renderToolbar(baseSummary({ total: 2, mine: 0, others: 2 }));
        expect((screen.getByLabelText('Eliminar seleccionados') as HTMLButtonElement).disabled).toBe(true);
        expect((screen.getByLabelText('Destacar seleccionados') as HTMLButtonElement).disabled).toBe(false);
    });

    it('deshabilita todo con la selección vacía', () => {
        renderToolbar(baseSummary({ total: 0, mine: 0, others: 0 }));
        expect((screen.getByLabelText('Reenviar seleccionados') as HTMLButtonElement).disabled).toBe(true);
        expect((screen.getByLabelText('Eliminar seleccionados') as HTMLButtonElement).disabled).toBe(true);
    });
});
