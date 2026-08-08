import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useTransferSpeed, formatSpeed, formatEta } from '../../../../../src/features/chat/file/transferSpeed.ts';

function makeTransfer(over: Record<string, unknown> = {}) {
    return {
        fileId: 'f1',
        fileName: 'a.bin',
        fileSize: 1000,
        totalBytes: 1000,
        bytesTransferred: 0,
        state: 'active',
        ...over,
    } as never;
}

describe('useTransferSpeed', () => {
    let now = 0;

    beforeEach(() => {
        now = 1000000;
        vi.useFakeTimers();
        vi.spyOn(Date, 'now').mockImplementation(() => now);
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it('devuelve 0 y eta null cuando la transferencia no está activa', () => {
        const { result } = renderHook(() => useTransferSpeed(makeTransfer({ state: 'completed' })));
        expect(result.current.speedBps).toBe(0);
        expect(result.current.etaSeconds).toBeNull();
    });

    it('no calcula velocidad hasta acumular al menos 500 ms de ventana', () => {
        const { result, rerender } = renderHook(({ t }) => useTransferSpeed(t), { initialProps: { t: makeTransfer() } });
        expect(result.current.speedBps).toBe(0);
        rerender({ t: makeTransfer({ bytesTransferred: 100 }) });
        expect(result.current.speedBps).toBe(0);
    });

    it('calcula velocidad y ETA con suficiente tiempo entre muestras', () => {
        const { result, rerender } = renderHook(({ t }) => useTransferSpeed(t), { initialProps: { t: makeTransfer() } });
        // Primera muestra en t=0
        now = 1000000 + 1000; // +1s
        rerender({ t: makeTransfer({ bytesTransferred: 5000 }) });
        // 5000 bytes / 1s = 5000 B/s
        expect(result.current.speedBps).toBeCloseTo(5000, 0);
        // remaining = 1000 - 5000 < 0 -> eta null
        expect(result.current.etaSeconds).toBeNull();
    });

    it('calcula ETA cuando hay bytes restantes', () => {
        const { result, rerender } = renderHook(({ t }) => useTransferSpeed(t), { initialProps: { t: makeTransfer({ totalBytes: 10000 }) } });
        now = 1000000 + 1000;
        rerender({ t: makeTransfer({ totalBytes: 10000, bytesTransferred: 5000 }) });
        // speed = 5000 B/s, remaining = 5000 -> eta = 1s
        expect(result.current.speedBps).toBeCloseTo(5000, 0);
        expect(result.current.etaSeconds).toBeCloseTo(1, 1);
    });

    it('resetea muestras y velocidad cuando la transferencia deja de estar activa', () => {
        const { result, rerender } = renderHook(({ t }) => useTransferSpeed(t), { initialProps: { t: makeTransfer() } });
        now = 1000000 + 1000;
        rerender({ t: makeTransfer({ bytesTransferred: 5000 }) });
        expect(result.current.speedBps).toBeGreaterThan(0);

        rerender({ t: makeTransfer({ state: 'completed', bytesTransferred: 5000 }) });
        expect(result.current.speedBps).toBe(0);
        expect(result.current.etaSeconds).toBeNull();
    });
});

describe('formatSpeed', () => {
    it('formatea las unidades correctamente', () => {
        expect(formatSpeed(0)).toBe('—');
        expect(formatSpeed(-5)).toBe('—');
        expect(formatSpeed(500)).toBe('500 B/s');
        expect(formatSpeed(2048)).toBe('2.0 KB/s');
        expect(formatSpeed(5 * 1024 * 1024)).toBe('5.00 MB/s');
    });
});

describe('formatEta', () => {
    it('devuelve — para valores nulos, no finitos o menores que 1', () => {
        expect(formatEta(null)).toBe('—');
        expect(formatEta(NaN)).toBe('—');
        expect(formatEta(0)).toBe('—');
        expect(formatEta(0.5)).toBe('—');
    });

    it('formatea segundos y minutos', () => {
        expect(formatEta(45)).toBe('45s');
        expect(formatEta(90)).toBe('1m 30s');
        expect(formatEta(125)).toBe('2m 5s');
    });
});
