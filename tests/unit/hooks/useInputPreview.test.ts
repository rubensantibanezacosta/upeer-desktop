import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useInputPreview } from '../../../src/hooks/useInputPreview.ts';

const fetchOgPreview = vi.fn();

function stubWindow() {
    vi.stubGlobal('window', { upeer: { fetchOgPreview } });
}

describe('useInputPreview', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.clearAllMocks();
        stubWindow();
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllGlobals();
    });

    it('detecta markdown y no muestra preview sin URL', async () => {
        const { result } = renderHook(() => useInputPreview('**negrita**'));
        expect(result.current.hasMd).toBe(true);
        expect(result.current.linkPreview).toBeNull();
        expect(result.current.isLoadingPreview).toBe(false);
    });

    it('obtiene la preview tras el debounce cuando hay una URL', async () => {
        fetchOgPreview.mockResolvedValue({ title: 'Mi enlace', url: 'https://example.com' });
        const { result } = renderHook(() => useInputPreview('mira https://example.com'));
        expect(result.current.isLoadingPreview).toBe(false);

        await act(async () => {
            vi.advanceTimersByTime(600);
        });
        await act(async () => {
            await Promise.resolve();
        });

        expect(fetchOgPreview).toHaveBeenCalledWith('https://example.com');
        expect(result.current.linkPreview).toEqual({ title: 'Mi enlace', url: 'https://example.com' });
        expect(result.current.isLoadingPreview).toBe(false);
    });

    it('no re-busca la misma URL repetida', async () => {
        fetchOgPreview.mockResolvedValue({ url: 'https://example.com' });
        const { rerender } = renderHook(({ msg }) => useInputPreview(msg), { initialProps: { msg: 'https://example.com' } });

        await act(async () => { vi.advanceTimersByTime(600); });
        await act(async () => { await Promise.resolve(); });
        expect(fetchOgPreview).toHaveBeenCalledTimes(1);

        rerender({ msg: 'https://example.com' });
        expect(fetchOgPreview).toHaveBeenCalledTimes(1);
    });

    it('dismissPreview limpia la preview', async () => {
        fetchOgPreview.mockResolvedValue({ url: 'https://example.com' });
        const { result } = renderHook(() => useInputPreview('https://example.com'));
        await act(async () => { vi.advanceTimersByTime(600); });
        await act(async () => { await Promise.resolve(); });
        expect(result.current.linkPreview).toEqual({ url: 'https://example.com' });

        act(() => result.current.dismissPreview());
        expect(result.current.linkPreview).toBeNull();
    });

    it('maneja errores de fetchOgPreview', async () => {
        fetchOgPreview.mockRejectedValue(new Error('red'));
        const { result } = renderHook(() => useInputPreview('https://example.com'));
        await act(async () => { vi.advanceTimersByTime(600); });
        await act(async () => { await Promise.resolve(); });
        expect(result.current.linkPreview).toBeNull();
        expect(result.current.isLoadingPreview).toBe(false);
    });
});
