import { describe, expect, it } from 'vitest';

import { canTransitionStatus } from '../../../src/main_process/storage/messages/statusTransitions.js';

describe('canTransitionStatus', () => {
    it('asciende hasta leido', () => {
        expect(canTransitionStatus('sent', 'vaulted')).toBe(true);
        expect(canTransitionStatus('vaulted', 'delivered')).toBe(true);
        expect(canTransitionStatus('delivered', 'read')).toBe(true);
    });

    it('no rebaja un mensaje entregado ni leido', () => {
        expect(canTransitionStatus('delivered', 'sent')).toBe(false);
        expect(canTransitionStatus('read', 'delivered')).toBe(false);
        expect(canTransitionStatus('read', 'failed')).toBe(false);
        expect(canTransitionStatus('delivered', 'failed')).toBe(false);
    });

    it('un mensaje guardado en el vault si puede fallar', () => {
        expect(canTransitionStatus('vaulted', 'failed')).toBe(true);
        expect(canTransitionStatus('sent', 'failed')).toBe(true);
    });

    it('un fallo se puede reintentar', () => {
        expect(canTransitionStatus('failed', 'sent')).toBe(true);
        expect(canTransitionStatus('failed', 'vaulted')).toBe(true);
    });

    it('un acuse tardio rescata un mensaje fallido', () => {
        expect(canTransitionStatus('failed', 'delivered')).toBe(true);
    });

    it('el mismo estado no genera escritura', () => {
        expect(canTransitionStatus('vaulted', 'vaulted')).toBe(false);
        expect(canTransitionStatus('failed', 'failed')).toBe(false);
    });

    it('un estado desconocido se puede reparar hacia arriba', () => {
        expect(canTransitionStatus('raro', 'delivered')).toBe(true);
        expect(canTransitionStatus('raro', 'failed')).toBe(true);
    });
});
