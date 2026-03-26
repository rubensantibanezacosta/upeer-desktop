import { RatchetState, SerializedRatchetState } from './ratchetShared.js';

export function serializeState(s: RatchetState, spkIdUsed?: number | null): SerializedRatchetState {
    const skipped: Record<string, string> = {};
    for (const [k, v] of s.skipped) skipped[k] = v.toString('hex');
    return {
        rk: s.rk.toString('hex'),
        cks: s.cks?.toString('hex') ?? null,
        ckr: s.ckr?.toString('hex') ?? null,
        ns: s.ns,
        nr: s.nr,
        pn: s.pn,
        dhsPk: s.dhsPk.toString('hex'),
        dhsSk: s.dhsSk.toString('hex'),
        dhr: s.dhr?.toString('hex') ?? null,
        skipped,
        spkIdUsed: spkIdUsed ?? null,
    };
}

export function deserializeState(s: SerializedRatchetState): { state: RatchetState; spkIdUsed: number | null } {
    const skipped = new Map<string, Buffer>();
    for (const [k, v] of Object.entries(s.skipped)) skipped.set(k, Buffer.from(v, 'hex'));
    const state: RatchetState = {
        rk: Buffer.from(s.rk, 'hex'),
        cks: s.cks ? Buffer.from(s.cks, 'hex') : null,
        ckr: s.ckr ? Buffer.from(s.ckr, 'hex') : null,
        ns: s.ns,
        nr: s.nr,
        pn: s.pn,
        dhsPk: Buffer.from(s.dhsPk, 'hex'),
        dhsSk: Buffer.from(s.dhsSk, 'hex'),
        dhr: s.dhr ? Buffer.from(s.dhr, 'hex') : null,
        skipped,
    };
    return { state, spkIdUsed: s.spkIdUsed ?? null };
}