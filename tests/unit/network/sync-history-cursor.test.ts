import { describe, expect, it } from 'vitest';
import { carryHistoryCursor, earliestCursor, retreatToLocalLatest } from '../../../src/main_process/network/sync/historyCursor.js';

describe('Sync history cursor carry over', () => {
    it('advances to the cursor of the served page', () => {
        expect(carryHistoryCursor('1700000000000:b', '1600000000000:a')).toBe('1700000000000:b');
    });

    it('keeps the previous cursor when the diff page is empty', () => {
        expect(carryHistoryCursor(null, '1600000000000:a')).toBe('1600000000000:a');
        expect(carryHistoryCursor(undefined, '1600000000000:a')).toBe('1600000000000:a');
        expect(carryHistoryCursor('', '1600000000000:a')).toBe('1600000000000:a');
    });

    it('stays empty while nothing has been synchronised', () => {
        expect(carryHistoryCursor(null, null)).toBeNull();
        expect(carryHistoryCursor('', undefined)).toBeNull();
    });

    it('no retrocede cuando el cursor propio va por delante', () => {
        expect(earliestCursor('1600000000000:a', '1700000000000:b')).toBe('1600000000000:a');
        expect(earliestCursor('1700000000000:b', '1600000000000:a')).toBe('1600000000000:a');
    });

    it('con la misma marca manda el identificador menor', () => {
        expect(earliestCursor('1700000000000:b', '1700000000000:a')).toBe('1700000000000:a');
        expect(earliestCursor('1700000000000:a', '1700000000000:b')).toBe('1700000000000:a');
    });

    it('si solo hay un cursor, ese manda', () => {
        expect(earliestCursor(null, '1700000000000:b')).toBe('1700000000000:b');
        expect(earliestCursor('1700000000000:b', null)).toBe('1700000000000:b');
    });

    it('retrocede al último mensaje propio cuando el cursor guardado se adelantó', () => {
        expect(retreatToLocalLatest('1700000000000:b', '1600000000000:a')).toBe('1600000000000:a');
    });

    it('conserva el cursor guardado cuando no va por delante', () => {
        expect(retreatToLocalLatest('1600000000000:a', '1700000000000:b')).toBe('1600000000000:a');
    });

    it('la primera sincronización empieza desde el principio', () => {
        expect(retreatToLocalLatest(null, '1700000000000:b')).toBeNull();
    });

    it('sin mensajes propios no hay nada a lo que retroceder', () => {
        expect(retreatToLocalLatest('1700000000000:b', null)).toBe('1700000000000:b');
    });
});
