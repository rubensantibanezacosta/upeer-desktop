import { describe, expect, it } from 'vitest';

import { pingActivity } from '../../../src/main_process/network/handlers/pingPresence.js';

const NOW = Date.UTC(2026, 9, 20, 10, 0, 0);

describe('pingActivity', () => {
    it('convierte la actividad del PING en ISO', () => {
        const at = NOW - 4_000;
        expect(pingActivity(at, NOW)).toEqual({
            activeAtMs: at,
            lastActiveIso: new Date(at).toISOString(),
        });
    });

    it('recorta una marca futura al ahora del receptor', () => {
        const future = NOW + 60_000;
        expect(pingActivity(future, NOW)?.lastActiveIso).toBe(new Date(NOW).toISOString());
    });

    it('devuelve null cuando no hay actividad válida', () => {
        expect(pingActivity(undefined, NOW)).toBeNull();
        expect(pingActivity(null, NOW)).toBeNull();
        expect(pingActivity(0, NOW)).toBeNull();
        expect(pingActivity(-5, NOW)).toBeNull();
        expect(pingActivity('nope', NOW)).toBeNull();
    });
});
