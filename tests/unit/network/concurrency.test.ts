import { describe, expect, it } from 'vitest';
import { runWithConcurrency, runWithConcurrencyMap } from '../../../src/main_process/network/concurrency.js';

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

describe('runWithConcurrency', () => {
    it('ejecuta todas las tareas y respeta el límite de concurrencia', async () => {
        let active = 0;
        let maxActive = 0;
        const results = await runWithConcurrency(
            Array.from({ length: 20 }, (_, index) => ({
                run: async () => {
                    active += 1;
                    maxActive = Math.max(maxActive, active);
                    await delay(2);
                    active -= 1;
                    return index;
                },
            })),
            5,
        );

        expect(results).toHaveLength(20);
        expect(results).toEqual(Array.from({ length: 20 }, (_, index) => index));
        expect(maxActive).toBeLessThanOrEqual(5);
        expect(maxActive).toBeGreaterThan(1);
    });

    it('preserva el orden de resultados', async () => {
        const results = await runWithConcurrency(
            Array.from({ length: 10 }, (_, index) => ({
                run: async () => {
                    await delay(10 - index);
                    return index;
                },
            })),
            3,
        );

        expect(results).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    });

    it('devuelve array vacío cuando no hay tareas', async () => {
        await expect(runWithConcurrency([], 4)).resolves.toEqual([]);
    });

    it('concurrencia inválida se normaliza a al menos 1', async () => {
        let active = 0;
        let maxActive = 0;
        const results = await runWithConcurrency(
            Array.from({ length: 6 }, () => ({
                run: async () => {
                    active += 1;
                    maxActive = Math.max(maxActive, active);
                    await delay(1);
                    active -= 1;
                    return true;
                },
            })),
            0,
        );

        expect(results).toHaveLength(6);
        expect(maxActive).toBeLessThanOrEqual(1);
    });
});

describe('runWithConcurrencyMap', () => {
    it('mapea cada ítem con la función respetando el límite', async () => {
        let active = 0;
        let maxActive = 0;
        const results = await runWithConcurrencyMap(
            [1, 2, 3, 4, 5, 6],
            2,
            async (value) => {
                active += 1;
                maxActive = Math.max(maxActive, active);
                await delay(1);
                active -= 1;
                return value * 2;
            },
        );

        expect(results).toEqual([2, 4, 6, 8, 10, 12]);
        expect(maxActive).toBeLessThanOrEqual(2);
    });
});
