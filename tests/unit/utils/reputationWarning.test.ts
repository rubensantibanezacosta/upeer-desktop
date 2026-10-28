import { describe, expect, it } from 'vitest';
import {
    getReputationWarning,
    isLowReputation,
    LOW_VOUCH_THRESHOLD,
} from '../../../src/utils/reputationWarning.js';

describe('getReputationWarning', () => {
    it('avisa solo cuando la reputación es muy mala', () => {
        expect(getReputationWarning(0)?.label).toContain('0/100');
        expect(getReputationWarning(LOW_VOUCH_THRESHOLD - 1)?.score).toBe(LOW_VOUCH_THRESHOLD - 1);
    });

    it('calla en el umbral y por encima', () => {
        expect(getReputationWarning(LOW_VOUCH_THRESHOLD)).toBeNull();
        expect(getReputationWarning(50)).toBeNull();
        expect(getReputationWarning(100)).toBeNull();
    });

    it('calla cuando no hay dato o es inválido', () => {
        expect(getReputationWarning(undefined)).toBeNull();
        expect(getReputationWarning(null)).toBeNull();
        expect(getReputationWarning(Number.NaN)).toBeNull();
        expect(getReputationWarning(Number.POSITIVE_INFINITY)).toBeNull();
    });

    it('redondea la puntuación del aviso', () => {
        expect(getReputationWarning(12.4)?.label).toContain('12/100');
        expect(getReputationWarning(-3)?.score).toBe(0);
    });
});

describe('isLowReputation', () => {
    it('acompaña al aviso', () => {
        expect(isLowReputation(10)).toBe(true);
        expect(isLowReputation(40)).toBe(false);
        expect(isLowReputation()).toBe(false);
    });
});
