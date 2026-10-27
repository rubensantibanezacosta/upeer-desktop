import { describe, expect, it } from 'vitest';
import { activateSearchRow, closestSearchRow, moveSearchFocus, searchRows } from '../../../../../src/components/layout/sidebar/searchKeyboard.js';

const focusedRow = (): string | undefined => (document.activeElement as HTMLElement | null)?.dataset.searchRow;

const buildContainer = (ids: string[], onClick?: (id: string) => void): HTMLElement => {
    const container = document.createElement('div');
    ids.forEach((id) => {
        const row = document.createElement('div');
        row.dataset.searchRow = id;
        row.tabIndex = -1;
        const button = document.createElement('button');
        button.addEventListener('click', () => onClick?.(id));
        row.appendChild(button);
        container.appendChild(row);
    });
    document.body.appendChild(container);
    return container;
};

describe('searchKeyboard', () => {
    it('lista las filas de resultado en orden', () => {
        const container = buildContainer(['a', 'b']);
        expect(searchRows(container).map((row) => row.dataset.searchRow)).toEqual(['a', 'b']);
    });

    it('sin contenedor no hay filas', () => {
        expect(searchRows(null)).toEqual([]);
        expect(moveSearchFocus(null, 1)).toBe(false);
    });

    it('baja desde el buscador a la primera fila y sube a la última', () => {
        const container = buildContainer(['a', 'b', 'c']);
        expect(moveSearchFocus(container, 1)).toBe(true);
        expect(focusedRow()).toBe('a');
        searchRows(container).forEach((row) => row.blur());
        moveSearchFocus(container, -1);
        expect(focusedRow()).toBe('c');
    });

    it('avanza y retrocede desde una fila conocida sin salirse', () => {
        const container = buildContainer(['a', 'b', 'c']);
        const rows = searchRows(container);
        moveSearchFocus(container, 1, rows[0]);
        expect(focusedRow()).toBe('b');
        moveSearchFocus(container, 1, rows[1]);
        expect(focusedRow()).toBe('c');
        moveSearchFocus(container, 1, rows[2]);
        expect(focusedRow()).toBe('c');
        moveSearchFocus(container, -1, rows[0]);
        expect(focusedRow()).toBe('a');
    });

    it('encuentra la fila del evento y activa su botón', () => {
        const clicked: string[] = [];
        const container = buildContainer(['a', 'b'], (id) => clicked.push(id));
        const row = searchRows(container)[1];
        const inner = row.querySelector('button') as HTMLButtonElement;
        expect(closestSearchRow(inner)).toBe(row);
        expect(closestSearchRow(container)).toBeNull();
        expect(activateSearchRow(row)).toBe(true);
        expect(clicked).toEqual(['b']);
    });

    it('no activa una fila sin control pulsable', () => {
        const empty = document.createElement('div');
        expect(activateSearchRow(empty)).toBe(false);
        expect(activateSearchRow(null)).toBe(false);
    });
});
