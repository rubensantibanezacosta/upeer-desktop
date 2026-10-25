import { describe, expect, it, vi } from 'vitest';

const NOW = 1_700_000_000_000;

async function loadActivity() {
    vi.resetModules();
    return import('../../../src/main_process/network/messaging/activity.js');
}

describe('local activity', () => {
    it('no anuncia nada antes de la primera marca', async () => {
        const { localActiveAt } = await loadActivity();
        expect(localActiveAt(NOW)).toBeUndefined();
    });

    it('devuelve el instante de la última actividad humana', async () => {
        const { localActiveAt, markLocalActive } = await loadActivity();
        markLocalActive(NOW);
        expect(localActiveAt(NOW + 1_000)).toBe(NOW);
    });

    it('nunca retrocede ante una marca más antigua', async () => {
        const { localActiveAt, markLocalActive } = await loadActivity();
        markLocalActive(NOW + 30_000);
        markLocalActive(NOW + 10_000);
        expect(localActiveAt(NOW + 31_000)).toBe(NOW + 30_000);
    });

    it('deja de anunciarse cuando la actividad caduca', async () => {
        const { localActiveAt, markLocalActive } = await loadActivity();
        markLocalActive(NOW);
        expect(localActiveAt(NOW + 5 * 60_000)).toBe(NOW);
        expect(localActiveAt(NOW + 5 * 60_000 + 1)).toBeUndefined();
    });
});
