import { describe, expect, it } from 'vitest';
import {
    decideCallDelivery,
    MISSED_CALL_VAULT_PRIORITY,
    MISSED_CALL_VAULT_TTL_MS,
    missedCallNotice,
    missedCallPayloadId,
} from '../../../src/main_process/network/call/missedCallVault.js';

/**
 * Llamar a alguien que está offline.
 *
 * Antes: la oferta se intentaba, no llegaba, el timbre caducaba y **no quedaba rastro**: ni fila en el
 * historial ni nada en el vault, así que al volver el otro no sabía que le habían llamado. El chat y
 * los ficheros sí encolan en el vault para entrega en la reconexión; las llamadas no.
 */
describe('decideCallDelivery', () => {
    it('una llamada que conecta no deja nada en el buzón', () => {
        expect(decideCallDelivery(true, true)).toEqual({ kind: 'delivered' });
    });

    it('una llamada que no se pudo entregar deja aviso en el buzón', () => {
        // El caso del peer offline: nadie recibió la oferta.
        expect(decideCallDelivery(false, false)).toEqual({ kind: 'queue-missed' });
    });

    it('una llamada que sonó y no se contestó no se reencola', () => {
        // El otro ya se enteró (le sonó el teléfono). Encolar aquí duplicaría el aviso.
        expect(decideCallDelivery(true, false)).toEqual({ kind: 'drop' });
    });

    it('conectada pero no entregada no tiene sentido y gana lo entregado', () => {
        expect(decideCallDelivery(true, true)).toEqual({ kind: 'delivered' });
    });
});

describe('missedCallNotice', () => {
    it('no es la oferta original', () => {
        // Una CALL_OFFER que llegue horas después haría sonar el teléfono sin nadie al otro lado.
        const notice = missedCallNotice('call-1', 'audio', 1790000000000);
        expect(notice.type).toBe('CALL_MISSED');
        expect(notice.type).not.toBe('CALL_OFFER');
    });

    it('lleva el tipo de llamada y cuándo fue', () => {
        const notice = missedCallNotice('call-1', 'video', 1790000000000);
        expect(notice).toEqual({ type: 'CALL_MISSED', callId: 'call-1', kind: 'video', timestamp: 1790000000000 });
    });

    it('la clave del buzón es una por llamada', () => {
        // Reenviar el mismo aviso no puede crear dos entradas.
        expect(missedCallPayloadId('call-1')).toBe(missedCallPayloadId('call-1'));
        expect(missedCallPayloadId('call-1')).not.toBe(missedCallPayloadId('call-2'));
        expect(missedCallPayloadId('call-1')).toContain('call-1');
    });

    it('el aviso caduca: dos días tarde es molestia, no aviso', () => {
        expect(MISSED_CALL_VAULT_TTL_MS).toBe(24 * 60 * 60 * 1000);
    });

    it('la prioridad va entre el chat normal (1) y el control (3)', () => {
        expect(MISSED_CALL_VAULT_PRIORITY).toBe(2);
    });
});
