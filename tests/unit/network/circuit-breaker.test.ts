import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isIPBlocked, recordIPFailure, recordIPSuccess, isIPUnreachable } from '../../../src/main_process/network/server/circuitBreaker.js';
import { ipFailMap } from '../../../src/main_process/network/server/state.js';

describe('CircuitBreaker Unit Tests', () => {
    const testIP = '192.168.1.100';

    beforeEach(() => {
        ipFailMap.clear();
        vi.useFakeTimers();
        vi.setSystemTime(new Date(2024, 0, 1));
    });

    it('should return false for isIPBlocked when IP has no failures', () => {
        expect(isIPBlocked(testIP)).toBe(false);
    });

    it('should block IP after one failure', () => {
        recordIPFailure(testIP);
        expect(isIPBlocked(testIP)).toBe(true);
        expect(ipFailMap.get(testIP)?.failures).toBe(1);
    });

    it('should increase backoff time sequentially with more failures', () => {
        recordIPFailure(testIP); // 30s
        expect(isIPBlocked(testIP)).toBe(true);
        vi.advanceTimersByTime(31_000);
        expect(isIPBlocked(testIP)).toBe(false);

        recordIPFailure(testIP); // 2nd -> 2 min
        expect(isIPBlocked(testIP)).toBe(true);
        expect(ipFailMap.get(testIP)?.failures).toBe(2);
        const blockedUntil = ipFailMap.get(testIP)?.blockedUntil || 0;
        expect(blockedUntil - Date.now()).toBe(2 * 60_000);
    });

    it('should reset state on success', () => {
        recordIPFailure(testIP);
        expect(ipFailMap.has(testIP)).toBe(true);
        recordIPSuccess(testIP);
        expect(ipFailMap.has(testIP)).toBe(false);
    });

    it('should correctly identify unreachable state', () => {
        expect(isIPUnreachable(testIP)).toBe(false);
        recordIPFailure(testIP);
        expect(isIPUnreachable(testIP)).toBe(true);
        vi.advanceTimersByTime(31_000);
        expect(isIPUnreachable(testIP)).toBe(false);
    });
});
