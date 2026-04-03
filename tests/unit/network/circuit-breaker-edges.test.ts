import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/main_process/security/secure-logger.js', () => ({
    error: vi.fn(),
}));

describe('circuitBreaker edge cases', () => {
    const testIP = '192.168.1.200';

    beforeEach(async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date(2024, 0, 1));
        const state = await import('../../../src/main_process/network/server/state.js');
        state.ipFailMap.clear();
        vi.clearAllMocks();
    });

    it('satura el backoff en el último escalón aunque haya muchos fallos', async () => {
        const breaker = await import('../../../src/main_process/network/server/circuitBreaker.js');
        const state = await import('../../../src/main_process/network/server/state.js');
        const constants = await import('../../../src/main_process/network/server/constants.js');
        const maxBackoff = constants.BACKOFF_STEPS_MS[constants.BACKOFF_STEPS_MS.length - 1] ?? 0;

        breaker.recordIPFailure(testIP);
        breaker.recordIPFailure(testIP);
        breaker.recordIPFailure(testIP);
        breaker.recordIPFailure(testIP);
        breaker.recordIPFailure(testIP);

        expect(state.ipFailMap.get(testIP)?.failures).toBe(5);
        expect(state.ipFailMap.get(testIP)?.blockedUntil).toBe(Date.now() + maxBackoff);
        expect(breaker.isIPBlocked(testIP)).toBe(true);

        vi.advanceTimersByTime(maxBackoff + 1);
        expect(breaker.isIPBlocked(testIP)).toBe(false);
    });

    it('sólo logea el primer fallo de la ventana y vuelve a estado limpio tras éxito', async () => {
        const breaker = await import('../../../src/main_process/network/server/circuitBreaker.js');
        const logger = await import('../../../src/main_process/security/secure-logger.js');
        const state = await import('../../../src/main_process/network/server/state.js');

        breaker.recordIPFailure(testIP);
        breaker.recordIPFailure(testIP);
        breaker.recordIPFailure(testIP);

        expect(logger.error).toHaveBeenCalledTimes(1);
        expect(state.ipFailMap.get(testIP)?.failures).toBe(3);

        breaker.recordIPSuccess(testIP);

        expect(state.ipFailMap.has(testIP)).toBe(false);
        expect(breaker.isIPBlocked(testIP)).toBe(false);
        expect(breaker.isIPUnreachable(testIP)).toBe(false);
    });
});
