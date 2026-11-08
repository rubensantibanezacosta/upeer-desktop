import { describe, expect, it } from 'vitest';

import {
    directRatchetContext,
    directRatchetContextCandidates,
    isDirectRatchetContext,
} from '../../../src/main_process/security/directRatchetContext.js';

const DEVICE_A = 'aa'.repeat(32);
const DEVICE_B = 'bb'.repeat(32);

describe('contexto del Double Ratchet en chat directo', () => {
    it('aísla la sesión por dispositivo de la misma cuenta', () => {
        // El bug que arregla esto: con un único contexto 'direct' todos los dispositivos
        // de una cuenta compartían sesión, y en cuanto dos escribían el ratchet se
        // desincronizaba y uno dejaba de descifrar.
        expect(directRatchetContext(DEVICE_A)).not.toBe(directRatchetContext(DEVICE_B));
        expect(directRatchetContext(DEVICE_A)).toBe(`direct:${DEVICE_A}`);
        expect(directRatchetContext(DEVICE_B)).toBe(`direct:${DEVICE_B}`);
    });

    it('mantiene el contexto histórico cuando el contacto no tiene dispositivo', () => {
        // Sin dispositivo conocido se usa 'direct', que es lo que emiten las versiones
        // anteriores: así no se invalidan las sesiones ya establecidas.
        expect(directRatchetContext(undefined)).toBe('direct');
        expect(directRatchetContext(null)).toBe('direct');
        expect(directRatchetContext('')).toBe('direct');
        expect(directRatchetContext('   ')).toBe('direct');
    });

    it('normaliza a minúsculas y sin espacios', () => {
        expect(directRatchetContext(`  ${DEVICE_A.toUpperCase()}  `)).toBe(`direct:${DEVICE_A}`);
    });

    it('al descifrar prueba primero el dispositivo emisor y luego el histórico', () => {
        expect(directRatchetContextCandidates(DEVICE_A)).toEqual([`direct:${DEVICE_A}`, 'direct']);
        expect(directRatchetContextCandidates(undefined)).toEqual(['direct']);
    });

    it('reconoce ambos formatos al validar y rechaza los demás', () => {
        expect(isDirectRatchetContext('direct')).toBe(true);
        expect(isDirectRatchetContext(`direct:${DEVICE_A}`)).toBe(true);
        expect(isDirectRatchetContext('group:abc')).toBe(false);
        expect(isDirectRatchetContext('sync:abc')).toBe(false);
        expect(isDirectRatchetContext('directive')).toBe(false);
    });
});
