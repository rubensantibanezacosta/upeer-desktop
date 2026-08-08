import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useIsOnline } from '../../../src/hooks/useIsOnline.js';

const ONLINE_WINDOW_MS = 65_000;

describe('useIsOnline', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2024-01-01T00:00:00Z'));
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('devuelve false cuando no hay lastSeen', () => {
        const { result } = renderHook(() => useIsOnline(undefined));
        expect(result.current).toBe(false);
    });

    it('devuelve true cuando lastSeen es reciente', () => {
        const { result } = renderHook(() => useIsOnline(new Date().toISOString()));
        expect(result.current).toBe(true);
    });

    it('pasa a false al expirar la ventana de online', () => {
        const recent = new Date().toISOString();
        const { result } = renderHook(() => useIsOnline(recent, 1000));
        expect(result.current).toBe(true);

        act(() => {
            vi.advanceTimersByTime(1001);
        });
        expect(result.current).toBe(false);
    });

    it('devuelve false cuando lastSeen es antiguo', () => {
        const { result } = renderHook(() =>
            useIsOnline(new Date(Date.now() - (ONLINE_WINDOW_MS + 10_000)).toISOString())
        );
        expect(result.current).toBe(false);
    });

    it('vuelve a true cuando lastSeen se actualiza a un valor reciente', async () => {
        const { result, rerender } = renderHook<boolean, { lastSeen?: string }>(
            ({ lastSeen }) => useIsOnline(lastSeen),
            { initialProps: { lastSeen: undefined } }
        );
        expect(result.current).toBe(false);

        rerender({ lastSeen: new Date().toISOString() });
        expect(result.current).toBe(true);
    });
});
