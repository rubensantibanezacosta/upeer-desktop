import { describe, expect, it } from 'vitest';
import { dayKeyOf, dayLabelOf, groupByDay, highlightParts } from '../../../../src/features/chat/chatSearchResults.js';

const at = (day: number, hour: number) => new Date(2026, 9, day, hour, 0, 0).getTime();

describe('chatSearchResults', () => {
    it('formatea el día como dd/mm/yyyy y con ceros a la izquierda', () => {
        expect(dayKeyOf(at(1, 9))).toBe('2026-10-01');
        expect(dayLabelOf(at(1, 9))).toBe('01/10/2026');
    });

    it('agrupa en el orden recibido sin reordenar filas', () => {
        const groups = groupByDay([
            { id: 'a', timestamp: at(20, 10) },
            { id: 'b', timestamp: at(20, 9) },
            { id: 'c', timestamp: at(19, 23) },
        ]);

        expect(groups.map((group) => group.label)).toEqual(['20/10/2026', '19/10/2026']);
        expect(groups[0].rows.map((row) => row.id)).toEqual(['a', 'b']);
        expect(groups[1].rows.map((row) => row.id)).toEqual(['c']);
    });

    it('separa los mensajes sin fecha válida', () => {
        const groups = groupByDay([{ id: 'a', timestamp: Number.NaN }]);
        expect(groups).toEqual([{ key: 'sin-fecha', label: 'Sin fecha', rows: [{ id: 'a', timestamp: Number.NaN }] }]);
    });

    it('marca todas las apariciones sin distinguir mayúsculas ni acentos', () => {
        const parts = highlightParts('Pérez y perez, PERÉZ', 'perez');
        expect(parts.filter((part) => part.match).map((part) => part.text)).toEqual(['Pérez', 'perez', 'PERÉZ']);
    });

    it('devuelve el texto entero cuando no hay término', () => {
        expect(highlightParts('hola', '   ')).toEqual([{ text: 'hola', match: false }]);
    });

    it('conserva el texto original completo al resaltar', () => {
        const parts = highlightParts('el hola de hola', 'hola');
        expect(parts.map((part) => part.text).join('')).toBe('el hola de hola');
        expect(parts.filter((part) => part.match)).toHaveLength(2);
    });
});
