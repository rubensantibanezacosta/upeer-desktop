import { afterEach, describe, expect, it } from 'vitest';
import {
    deriveNextRenewalAt,
    getLocationStatusSnapshot,
    noteDhtUpdateAccepted,
    noteLocationError,
    noteLocationPublished,
    noteLocationStoreAck,
    noteLocationStoreTargets,
    resetLocationStatus,
    sanitizeLocationError,
    RENEWAL_THRESHOLD_MS,
} from '../../../src/main_process/network/locationStatus.js';

describe('locationStatus', () => {
    afterEach(() => {
        resetLocationStatus();
    });

    it('arranca sin publicación ni errores', () => {
        const snapshot = getLocationStatusSnapshot();
        expect(snapshot.publishedAt).toBeNull();
        expect(snapshot.lastSeq).toBeNull();
        expect(snapshot.nextRenewalAt).toBeNull();
        expect(snapshot.storeTargets).toBe(0);
        expect(snapshot.storeAcks).toBe(0);
        expect(snapshot.errors.certificate).toBeNull();
        expect(snapshot.errors.admission).toBeNull();
        expect(snapshot.errors.network).toBeNull();
    });

    it('registra la publicación con secuencia y caducidad', () => {
        const now = 1_700_000_000_000;
        noteLocationPublished(7, now + RENEWAL_THRESHOLD_MS + 1_000, now);
        const snapshot = getLocationStatusSnapshot();
        expect(snapshot.publishedAt).toBe(now);
        expect(snapshot.lastSeq).toBe(7);
        expect(snapshot.expiresAt).toBe(now + RENEWAL_THRESHOLD_MS + 1_000);
        expect(snapshot.nextRenewalAt).toBe(now + 1_000);
    });

    it('ignora secuencias y caducidades no numéricas', () => {
        noteLocationPublished(Number.NaN, null);
        const snapshot = getLocationStatusSnapshot();
        expect(snapshot.lastSeq).toBeNull();
        expect(snapshot.nextRenewalAt).toBeNull();
    });

    it('acumula nodos contactados y acuses válidos', () => {
        noteLocationStoreTargets(8);
        noteLocationStoreTargets(4);
        noteLocationStoreTargets(0);
        noteLocationStoreTargets(Number.NaN);
        noteLocationStoreAck();
        noteLocationStoreAck();
        const snapshot = getLocationStatusSnapshot();
        expect(snapshot.storeTargets).toBe(12);
        expect(snapshot.storeAcks).toBe(2);
    });

    it('guarda el instante del último DHT_UPDATE aceptado', () => {
        noteDhtUpdateAccepted(1_700_000_000_000);
        expect(getLocationStatusSnapshot().lastDhtUpdateAt).toBe(1_700_000_000_000);
    });

    it('separa los errores por categoría y los limpia al publicar', () => {
        noteLocationError('network', new Error('store timeout'));
        noteLocationError('certificate', 'token inválido');
        noteLocationError('admission', 'contacto sin registro');
        let snapshot = getLocationStatusSnapshot();
        expect(snapshot.errors.network?.message).toBe('store timeout');
        expect(snapshot.errors.certificate?.message).toBe('token inválido');
        expect(snapshot.errors.admission?.message).toBe('contacto sin registro');

        noteLocationPublished(3, null);
        snapshot = getLocationStatusSnapshot();
        expect(snapshot.errors.network).toBeNull();
        expect(snapshot.errors.certificate?.message).toBe('token inválido');
        expect(snapshot.errors.admission?.message).toBe('contacto sin registro');
    });

    it('calcula la próxima renovación restando el umbral de auto-renovación', () => {
        const expiresAt = 1_800_000_000_000;
        expect(deriveNextRenewalAt(expiresAt)).toBe(expiresAt - RENEWAL_THRESHOLD_MS);
        expect(deriveNextRenewalAt(null)).toBeNull();
        expect(deriveNextRenewalAt(Number.POSITIVE_INFINITY)).toBeNull();
    });

    it('limpia claves y direcciones de los mensajes de error', () => {
        const message = sanitizeLocationError(
            new Error('no se pudo enviar a 200:1234:abcd:5678::9 con clave a3f5c9d1e2b4a6f8c0d2e4f6a8b0c2d4'),
        );
        expect(message).not.toContain('200:1234:abcd:5678::9');
        expect(message).not.toContain('a3f5c9d1e2b4a6f8c0d2e4f6a8b0c2d4');
        expect(message).toContain('[dirección]');
        expect(message).toContain('[clave]');
    });

    it('recorta los mensajes largos y tolera valores raros', () => {
        expect(sanitizeLocationError('x'.repeat(500)).length).toBe(200);
        expect(sanitizeLocationError(undefined)).toBe('Error desconocido');
        expect(sanitizeLocationError({})).toBe('Error desconocido');
    });

    it('devuelve copias que no permiten mutar el estado interno', () => {
        noteLocationError('network', 'fallo');
        const snapshot = getLocationStatusSnapshot();
        snapshot.errors.network = null;
        snapshot.storeAcks = 99;
        const fresh = getLocationStatusSnapshot();
        expect(fresh.errors.network?.message).toBe('fallo');
        expect(fresh.storeAcks).toBe(0);
    });

    it('el reset deja el estado como al arrancar', () => {
        noteLocationPublished(1, Date.now());
        noteLocationStoreAck();
        noteLocationError('network', 'fallo');
        resetLocationStatus();
        const snapshot = getLocationStatusSnapshot();
        expect(snapshot.publishedAt).toBeNull();
        expect(snapshot.storeAcks).toBe(0);
        expect(snapshot.errors.network).toBeNull();
    });
});
