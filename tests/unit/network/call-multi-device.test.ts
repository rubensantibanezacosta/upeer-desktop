import { describe, expect, it } from 'vitest';
import {
    callRingTargets,
    MAX_RING_TARGETS,
    MultiDeviceOffer,
    supersededRingTargets,
} from '../../../src/main_process/network/call/multiDeviceRing.js';

/**
 * Una cuenta con varios dispositivos: la llamada suena en todos y gana el que contesta antes.
 *
 * Antes la oferta iba a una sola dirección (la de `contact.address`, la última guardada), así que con
 * la cuenta abierta en móvil y portátil sonaba solo uno, elegido al azar; si era el apagado, la
 * llamada no sonaba en ningún sitio y no había error que lo explicase.
 */
describe('callRingTargets', () => {
    it('devuelve todas las direcciones conocidas, la más reciente primero', () => {
        expect(callRingTargets('200::movil', ['200::movil', '200::portatil'])).toEqual(['200::movil', '200::portatil']);
    });

    it('no repite la dirección principal si ya está en las conocidas', () => {
        // `knownAddresses` suele traer la principal la primera: sin deduplicar, la oferta se mandaría
        // dos veces al mismo dispositivo.
        expect(callRingTargets('200::movil', ['200::movil', '200::movil', '200::portatil']))
            .toEqual(['200::movil', '200::portatil']);
    });

    it('acepta el JSON tal y como viene de la fila del contacto', () => {
        // En la base se guarda como texto, no como array.
        expect(callRingTargets('200::movil', '["200::portatil","200::movil"]')).toEqual(['200::portatil', '200::movil']);
    });

    it('si el JSON está roto cae a la dirección principal en vez de fallar', () => {
        // Un contacto viejo con las direcciones corruptas no puede dejar sin llamar.
        expect(callRingTargets('200::movil', '{no es json')).toEqual(['200::movil']);
        expect(callRingTargets('200::movil', null)).toEqual(['200::movil']);
        expect(callRingTargets('200::movil', undefined)).toEqual(['200::movil']);
    });

    it('sin dirección principal y sin conocidas no hay a quién llamar', () => {
        expect(callRingTargets(null, [])).toEqual([]);
        expect(callRingTargets('', [])).toEqual([]);
    });

    it('ignora entradas que no son cadenas o están vacías', () => {
        expect(callRingTargets('200::movil', [42, null, '   ', '200::portatil'])).toEqual(['200::portatil', '200::movil']);
    });

    it('limita cuántos dispositivos suenan a la vez', () => {
        // Sonar en 20 sitios no es un teléfono, es una alarma.
        const many = Array.from({ length: 20 }, (_, index) => `200::${index}`);
        const targets = callRingTargets('200::principal', many);
        expect(targets).toHaveLength(MAX_RING_TARGETS);
        // Se quedan los primeros, que son los más recientes.
        expect(targets[0]).toBe('200::0');
    });
});

describe('supersededRingTargets', () => {
    it('son los demás, sin el que contestó', () => {
        expect(supersededRingTargets(['200::a', '200::b', '200::c'], '200::b')).toEqual(['200::a', '200::c']);
    });

    it('sin dirección de quien contesta no se anula nada', () => {
        expect(supersededRingTargets(['200::a'], '')).toEqual([]);
    });
});

describe('MultiDeviceOffer', () => {
    it('gana el primero que contesta y el segundo no puede pisarlo', () => {
        const offer = new MultiDeviceOffer(['200::movil', '200::portatil']);
        expect(offer.accept('200::portatil')).toBe(true);
        expect(offer.winner()).toBe('200::portatil');
        // El móvil no puede reescribir la sesión que ya es del portátil.
        expect(offer.accept('200::movil')).toBe(false);
        expect(offer.winner()).toBe('200::portatil');
        expect(offer.outcome()).toBe('answered');
    });

    it('al contestar uno, se calla a los que seguían sonando', () => {
        const offer = new MultiDeviceOffer(['200::movil', '200::portatil', '200::tablet']);
        offer.accept('200::movil');
        expect(offer.stillRinging()).toEqual(['200::portatil', '200::tablet']);
    });

    it('ocupado en uno no cierra la llamada si otro puede contestar', () => {
        const offer = new MultiDeviceOffer(['200::movil', '200::portatil']);
        offer.markBusy('200::portatil');
        expect(offer.outcome()).toBe('pending');
        // El móvil sigue sonando y todavía puede ganar.
        expect(offer.accept('200::movil')).toBe(true);
    });

    it('solo se cierra como ocupado cuando todos dijeron que no', () => {
        const offer = new MultiDeviceOffer(['200::a', '200::b']);
        offer.markBusy('200::a');
        expect(offer.outcome()).toBe('pending');
        offer.markBusy('200::b');
        expect(offer.outcome()).toBe('all-busy');
        expect(offer.busyCount()).toBe(2);
    });

    it('si no se alcanzó a ninguno es un fallo, no un ocupado', () => {
        const offer = new MultiDeviceOffer(['200::a', '200::b']);
        offer.markFailed('200::a');
        offer.markFailed('200::b');
        expect(offer.outcome()).toBe('all-failed');
    });

    it('mezcla de ocupado y caído sigue siendo ocupado', () => {
        // Al que llamó le da igual: alguien estaba, simplemente no podía.
        const offer = new MultiDeviceOffer(['200::a', '200::b']);
        offer.markBusy('200::a');
        offer.markFailed('200::b');
        expect(offer.outcome()).toBe('all-busy');
    });

    it('una dirección que no estaba en la oferta no puede contestar', () => {
        const offer = new MultiDeviceOffer(['200::a']);
        expect(offer.accept('200::intruso')).toBe(false);
        expect(offer.outcome()).toBe('pending');
    });

    it('anotar dos veces el mismo ocupado no descuadra la cuenta', () => {
        const offer = new MultiDeviceOffer(['200::a', '200::b']);
        offer.markBusy('200::a');
        offer.markBusy('200::a');
        offer.markBusy('200::a');
        expect(offer.busyCount()).toBe(1);
        expect(offer.outcome()).toBe('pending');
    });

    it('un único dispositivo sigue funcionando como antes', () => {
        const offer = new MultiDeviceOffer(['200::unico']);
        expect(offer.ringing()).toEqual(['200::unico']);
        expect(offer.accept('200::unico')).toBe(true);
        expect(offer.stillRinging()).toEqual([]);
    });
});
