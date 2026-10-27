import { beforeEach, describe, expect, it } from 'vitest';
import { computeSyncProgress, resetSyncProgressMemory, trackSyncProgress } from '../../../src/main_process/network/sync/progress.js';
import {
    forgetHistoryWork,
    getHistoryWork,
    parsePendingCount,
    recordHistoryComplete,
    recordHistoryPage,
    recordHistoryServed,
    resetHistoryWork,
    resetServedHistory,
} from '../../../src/main_process/network/sync/historyProgress.js';

const base = {
    phase: 'syncing' as const,
    historyDone: 0,
    historyTotal: 0,
    historyKnown: false,
    pendingOutbound: 0,
    pendingInbound: 0,
    pendingFiles: 0,
};

describe('computeSyncProgress', () => {
    it('no es determinate mientras el par no diga cuántos mensajes faltan', () => {
        const progress = computeSyncProgress({ ...base, historyDone: 120 });
        expect(progress.determinate).toBe(false);
        expect(progress.percent).toBe(0);
        expect(progress.detail).toBe('120 mensajes sincronizados');
    });

    it('calcula el porcentaje con mensajes aplicados sobre el total anunciado', () => {
        const progress = computeSyncProgress({ ...base, historyDone: 250, historyTotal: 1_000, historyKnown: true });
        expect(progress.determinate).toBe(true);
        expect(progress.percent).toBe(25);
        expect(progress.detail).toBe('250 de 1000 mensajes');
    });

    it('separa lo que falta por enviar de lo que falta por recibir', () => {
        const progress = computeSyncProgress({
            ...base,
            historyDone: 5,
            historyTotal: 10,
            historyKnown: true,
            pendingOutbound: 3,
            pendingInbound: 5,
            pendingFiles: 2,
        });
        expect(progress.pendingOutbound).toBe(3);
        expect(progress.pendingInbound).toBe(5);
        expect(progress.detail).toBe('5 de 10 mensajes · 3 mensajes por enviar · 5 mensajes por recibir · 2 archivos en curso');
    });

    it('usa singular cuando solo hay una unidad pendiente', () => {
        const progress = computeSyncProgress({ ...base, pendingOutbound: 1, pendingFiles: 1 });
        expect(progress.detail).toBe('Conectando con tus dispositivos · 1 mensaje por enviar · 1 archivo en curso');
    });

    it('saluda cuando ya no queda nada por sincronizar', () => {
        const progress = computeSyncProgress({ ...base, phase: 'live', historyDone: 10, historyTotal: 10, historyKnown: true });
        expect(progress.percent).toBe(100);
        expect(progress.headline).toBe('¡Al día!');
    });
});

describe('trackSyncProgress', () => {
    beforeEach(() => {
        resetSyncProgressMemory();
    });

    it('no retrocede mientras dura la misma fase de sincronización', () => {
        trackSyncProgress({ ...base, historyDone: 500, historyTotal: 1_000, historyKnown: true });
        const later = trackSyncProgress({ ...base, historyDone: 400, historyTotal: 1_000, historyKnown: true });
        expect(later.percent).toBe(50);
    });

    it('reinicia la marca al volver a sincronizar tras estar al día', () => {
        trackSyncProgress({ ...base, historyDone: 100, historyTotal: 100, historyKnown: true });
        trackSyncProgress({ ...base, phase: 'live', historyDone: 100, historyTotal: 100, historyKnown: true });
        const next = trackSyncProgress({ ...base, historyDone: 10, historyTotal: 100, historyKnown: true });
        expect(next.percent).toBe(10);
    });
});

describe('histórico de sincronización', () => {
    beforeEach(() => {
        resetHistoryWork();
    });

    it('acumula los mensajes aplicados y el total que anuncia el par', () => {
        recordHistoryPage('device-a', 50, 150);
        recordHistoryPage('device-a', 50, 100);
        expect(getHistoryWork()).toEqual({ done: 100, total: 200, known: true });
    });

    it('marca el trabajo como desconocido mientras el par no envíe el pendiente', () => {
        recordHistoryPage('device-a', 50, null);
        expect(getHistoryWork()).toEqual({ done: 50, total: 50, known: false });
    });

    it('cierra el trabajo al completarse el histórico', () => {
        recordHistoryPage('device-a', 50, 50);
        recordHistoryComplete('device-a');
        expect(getHistoryWork()).toEqual({ done: 100, total: 100, known: true });
    });

    it('olvida el progreso de un dispositivo que reinicia el histórico', () => {
        recordHistoryPage('device-a', 50, 150);
        forgetHistoryWork('device-a');
        expect(getHistoryWork()).toEqual({ done: 0, total: 0, known: false });
    });

    it('ignora pendientes inválidos', () => {
        expect(parsePendingCount(undefined)).toBeNull();
        expect(parsePendingCount(-3)).toBeNull();
        expect(parsePendingCount('12')).toBeNull();
        expect(parsePendingCount(12.9)).toBe(12);
    });
});

describe('histórico servido al otro dispositivo', () => {
    beforeEach(() => {
        resetHistoryWork();
    });

    it('cuenta los mensajes enviados como trabajo del mismo proceso', () => {
        recordHistoryServed('device-b', 50, 150);
        recordHistoryServed('device-b', 50, 100);
        expect(getHistoryWork()).toEqual({ done: 100, total: 200, known: true });
    });

    it('suma el histórico recibido y el servido cuando los dos lados conocen el total', () => {
        recordHistoryPage('device-a', 10, 40);
        recordHistoryServed('device-b', 30, 70);
        expect(getHistoryWork()).toEqual({ done: 40, total: 150, known: true });
    });

    it('prefiere el lado conocido en vez de volver indeterminado el total', () => {
        recordHistoryPage('device-a', 10, null);
        recordHistoryServed('device-b', 30, 70);
        expect(getHistoryWork()).toEqual({ done: 30, total: 100, known: true });
    });

    it('reinicia el histórico servido cuando el otro dispositivo empieza de cero', () => {
        recordHistoryServed('device-b', 50, 50);
        resetServedHistory('device-b');
        expect(getHistoryWork()).toEqual({ done: 0, total: 0, known: false });
    });

    it('olvida también el histórico servido al reiniciar el de un dispositivo', () => {
        recordHistoryServed('device-b', 50, 50);
        forgetHistoryWork('device-b');
        expect(getHistoryWork()).toEqual({ done: 0, total: 0, known: false });
    });
});
