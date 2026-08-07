import { describe, expect, it } from 'vitest';
import { serializeState, deserializeState } from '../../../src/main_process/security/ratchetState.js';
import type { RatchetState } from '../../../src/main_process/security/ratchetShared.js';

function makeState(overrides: Partial<RatchetState> = {}): RatchetState {
    return {
        rk: Buffer.from('a1', 'hex'),
        cks: Buffer.from('b2', 'hex'),
        ckr: Buffer.from('c3', 'hex'),
        ns: 1,
        nr: 2,
        pn: 3,
        dhsPk: Buffer.from('d4', 'hex'),
        dhsSk: Buffer.from('e5', 'hex'),
        dhr: Buffer.from('f6', 'hex'),
        skipped: new Map([['g7', Buffer.from('07', 'hex')]]),
        ...overrides,
    };
}

describe('ratchetState serialize/deserialize', () => {
    it('hace round-trip completo preservando todos los campos', () => {
        const original = makeState();

        const serialized = serializeState(original, 42);
        expect(serialized.rk).toBe('a1');
        expect(serialized.cks).toBe('b2');
        expect(serialized.ckr).toBe('c3');
        expect(serialized.ns).toBe(1);
        expect(serialized.nr).toBe(2);
        expect(serialized.pn).toBe(3);
        expect(serialized.dhsPk).toBe('d4');
        expect(serialized.dhsSk).toBe('e5');
        expect(serialized.dhr).toBe('f6');
        expect(serialized.skipped).toEqual({ g7: '07' });
        expect(serialized.spkIdUsed).toBe(42);

        const { state, spkIdUsed } = deserializeState(serialized);
        expect(state.rk).toEqual(Buffer.from('a1', 'hex'));
        expect(state.cks).toEqual(Buffer.from('b2', 'hex'));
        expect(state.ckr).toEqual(Buffer.from('c3', 'hex'));
        expect(state.ns).toBe(1);
        expect(state.nr).toBe(2);
        expect(state.pn).toBe(3);
        expect(state.dhsPk).toEqual(Buffer.from('d4', 'hex'));
        expect(state.dhsSk).toEqual(Buffer.from('e5', 'hex'));
        expect(state.dhr).toEqual(Buffer.from('f6', 'hex'));
        expect(state.skipped.get('g7')).toEqual(Buffer.from('07', 'hex'));
        expect(spkIdUsed).toBe(42);
    });

    it('serializa los campos nullable como null y los restaura como null', () => {
        const original = makeState({ cks: null, ckr: null, dhr: null });

        const serialized = serializeState(original, null);
        expect(serialized.cks).toBeNull();
        expect(serialized.ckr).toBeNull();
        expect(serialized.dhr).toBeNull();
        expect(serialized.spkIdUsed).toBeNull();

        const { state, spkIdUsed } = deserializeState(serialized);
        expect(state.cks).toBeNull();
        expect(state.ckr).toBeNull();
        expect(state.dhr).toBeNull();
        expect(spkIdUsed).toBeNull();
    });

    it('normaliza spkIdUsed ausente a null en la deserialización', () => {
        const serialized = serializeState(makeState());
        delete serialized.spkIdUsed;

        const { spkIdUsed } = deserializeState(serialized);
        expect(spkIdUsed).toBeNull();
    });
});
