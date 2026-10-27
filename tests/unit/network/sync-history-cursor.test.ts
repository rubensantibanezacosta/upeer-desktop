import { describe, expect, it } from 'vitest';
import { carryHistoryCursor } from '../../../src/main_process/network/sync/historyCursor.js';

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
});
