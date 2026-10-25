import { describe, expect, it } from 'vitest';
import { computeSyncPhase, SYNC_STALE_MS } from '../../../src/main_process/network/sync/phase.js';

const NOW = 1_000_000;

describe('computeSyncPhase', () => {
    it('es idle sin dispositivos propios registrados', () => {
        expect(computeSyncPhase([], NOW)).toEqual({
            phase: 'idle',
            devicesTotal: 0,
            devicesDone: 0,
            lastPeerAt: 0,
            ageMillis: 0,
        });
    });

    it('está sincronizando mientras quede histórico por recibir y el par esté vivo', () => {
        const report = computeSyncPhase([
            { historyCompleted: true, lastSeen: NOW - 1_000 },
            { historyCompleted: false, lastSeen: NOW - 2_000 },
        ], NOW);
        expect(report.phase).toBe('syncing');
        expect(report.devicesTotal).toBe(2);
        expect(report.devicesDone).toBe(1);
        expect(report.lastPeerAt).toBe(NOW - 1_000);
    });

    it('pasa a live cuando todos los pares han completado el histórico', () => {
        const report = computeSyncPhase([
            { historyCompleted: true, lastSeen: NOW - 1_000 },
            { historyCompleted: true, lastSeen: NOW - 2_000 },
        ], NOW);
        expect(report.phase).toBe('live');
        expect(report.devicesDone).toBe(2);
    });

    it('no se queda sincronizando para siempre con el otro dispositivo apagado', () => {
        const report = computeSyncPhase([{ historyCompleted: false, lastSeen: NOW - SYNC_STALE_MS - 1 }], NOW);
        expect(report.phase).toBe('live');
        expect(report.ageMillis).toBeGreaterThan(SYNC_STALE_MS);
    });

    it('considera vivo un par justo en el límite de frescura', () => {
        const report = computeSyncPhase([{ historyCompleted: false, lastSeen: NOW - SYNC_STALE_MS }], NOW);
        expect(report.phase).toBe('syncing');
    });

    it('trata un par sin lastSeen como no vivo', () => {
        const report = computeSyncPhase([{ historyCompleted: false, lastSeen: 0 }], NOW);
        expect(report.phase).toBe('live');
        expect(report.ageMillis).toBe(0);
    });
});
