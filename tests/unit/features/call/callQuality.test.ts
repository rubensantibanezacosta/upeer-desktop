import { describe, expect, it } from 'vitest';
import { adaptCallQuality, CallQualityMonitor } from '../../../../src/features/call/callQuality.js';

describe('CallQualityMonitor', () => {
    it('estima pérdida tolerando reordenamiento dentro de la ventana', () => {
        const monitor = new CallQualityMonitor();
        monitor.observe('peer', 'video', 1, 100, 0, 0);
        monitor.observe('peer', 'video', 3, 100, 66_000, 500);
        monitor.observe('peer', 'video', 2, 100, 33_000, 700);
        monitor.observe('peer', 'video', 12, 100, 366_000, 1000);
        monitor.observe('peer', 'video', 13, 100, 400_000, 1500);
        const report = monitor.observe('peer', 'video', 14, 100, 433_000, 2100);
        expect(report?.lossRatio).toBeGreaterThan(0);
        expect(report?.jitterMs).toBeGreaterThan(0);
        expect(report?.receiveBitrate).toBeGreaterThan(0);
    });

    it('mide RTT por eco y descarta respuestas tardías o no coincidentes', () => {
        const monitor = new CallQualityMonitor();
        const probe = monitor.createProbe('peer', 1000);
        expect(monitor.resolveProbe('peer', probe.sentAt, 1060)).toBe(60);
        expect(monitor.resolveProbe('peer', probe.sentAt, 1070)).toBeNull();
    });
});

describe('adaptCallQuality', () => {
    it('reduce carga en una ruta con RTT alto o jitter/pérdida', () => {
        expect(adaptCallQuality({ bitrate: 700_000, framerate: 24 }, {
            type: 'quality-feedback', target: 'peer', mediaKind: 'video', lossRatio: 0.1, jitterMs: 130, sendBitrate: 500_000,
        })).toEqual({ bitrate: 525_000, framerate: 20 });
    });

    it('no adapta audio ni excede el máximo de calidad', () => {
        const current = { bitrate: 1_200_000, framerate: 30 };
        expect(adaptCallQuality(current, {
            type: 'quality-feedback', target: 'peer', mediaKind: 'audio', lossRatio: 0, jitterMs: 0, sendBitrate: 2_000_000,
        })).toBe(current);
        expect(adaptCallQuality(current, {
            type: 'quality-feedback', target: 'peer', mediaKind: 'video', lossRatio: 0, jitterMs: 0, sendBitrate: 2_000_000,
        })).toEqual(current);
    });
});