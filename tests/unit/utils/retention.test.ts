import { describe, it, expect } from 'vitest';
import {
    DEFAULT_RETENTION,
    RETENTION_PRESETS,
    computeExpiresAt,
    isExpired,
    resolveRetentionId,
    retentionLabel,
    retentionMs,
    retentionNotice,
    sanitizeRetentionMap,
} from '../../../src/utils/retention.js';

describe('retention', () => {
    it('cae a desactivados con valores desconocidos', () => {
        expect(resolveRetentionId(undefined)).toBe(DEFAULT_RETENTION);
        expect(resolveRetentionId(null)).toBe(DEFAULT_RETENTION);
        expect(resolveRetentionId('5m')).toBe('off');
        expect(resolveRetentionId('')).toBe('off');
    });

    it('declara los cuatro presets con su plazo', () => {
        expect(RETENTION_PRESETS.map((preset) => preset.id)).toEqual(['off', '24h', '7d', '90d']);
        expect(retentionMs('off')).toBe(0);
        expect(retentionMs('24h')).toBe(86_400_000);
        expect(retentionMs('7d')).toBe(604_800_000);
        expect(retentionMs('90d')).toBe(7_776_000_000);
    });

    it('describe el plazo para la interfaz', () => {
        expect(retentionLabel('24h')).toBe('24 h');
        expect(retentionLabel('7d')).toBe('7 días');
        expect(retentionLabel('off')).toBe('Desactivados');
        expect(retentionNotice('off')).toBeNull();
        expect(retentionNotice('24h')).toContain('24 h');
        expect(retentionNotice('inventado')).toBeNull();
    });

    it('sanea el mapa: fuera los ids inválidos y los desactivados', () => {
        expect(sanitizeRetentionMap({
            alice: '24h',
            'grp-1': '7d',
            bob: 'off',
            carol: 'inventado',
            dave: 42,
            '': '24h',
        })).toEqual({ alice: '24h', 'grp-1': '7d' });
    });

    it('descarta mapas que no son objetos', () => {
        expect(sanitizeRetentionMap(null)).toEqual({});
        expect(sanitizeRetentionMap('24h')).toEqual({});
        expect(sanitizeRetentionMap(['24h'])).toEqual({});
    });

    it('calcula el vencimiento solo con un plazo positivo', () => {
        expect(computeExpiresAt(1_000, 0)).toBeNull();
        expect(computeExpiresAt(1_000, -5)).toBeNull();
        expect(computeExpiresAt(Number.NaN, 1_000)).toBeNull();
        expect(computeExpiresAt(1_000, 24 * 60 * 60 * 1000)).toBe(86_401_000);
    });

    it('considera vencido solo lo que tiene marca pasada', () => {
        expect(isExpired(null, 5_000)).toBe(false);
        expect(isExpired(undefined, 5_000)).toBe(false);
        expect(isExpired(0, 5_000)).toBe(false);
        expect(isExpired(4_999, 5_000)).toBe(true);
        expect(isExpired(5_000, 5_000)).toBe(true);
        expect(isExpired(5_001, 5_000)).toBe(false);
    });
});
