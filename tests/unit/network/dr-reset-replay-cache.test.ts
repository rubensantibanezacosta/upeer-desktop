import { describe, expect, it } from 'vitest';
import { DrResetReplayCache } from '../../../src/main_process/network/drResetReplayCache.js';

const resetId = (suffix: number) => `123e4567-e89b-12d3-a456-426614174${String(suffix).padStart(3, '0')}`;

describe('DrResetReplayCache', () => {
    it('acepta un resetId una vez por peer', () => {
        const cache = new DrResetReplayCache(() => 1_000);

        expect(cache.consume('peer-a', resetId(1))).toBe(true);
        expect(cache.consume('peer-a', resetId(1))).toBe(false);
        expect(cache.consume('peer-b', resetId(1))).toBe(true);
    });

    it('vuelve a aceptar un resetId después del TTL', () => {
        let now = 1_000;
        const cache = new DrResetReplayCache(() => now);

        expect(cache.consume('peer-a', resetId(2))).toBe(true);
        now += 24 * 60 * 60 * 1000 + 1;
        expect(cache.consume('peer-a', resetId(2))).toBe(true);
    });

    it('rechaza resetIds con formato inválido', () => {
        const cache = new DrResetReplayCache(() => 1_000);

        expect(cache.consume('peer-a', 'message-1')).toBe(false);
    });
});
