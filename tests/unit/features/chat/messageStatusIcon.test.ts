import { describe, expect, it } from 'vitest';

import { messageStatusIconKind, messageStatusIsRead } from '../../../../src/features/chat/messageStatusIcon.js';

describe('messageStatusIconKind', () => {
    it('el error tiene su propio icono', () => {
        expect(messageStatusIconKind('failed')).toBe('failed');
    });

    it('pendiente y enviando llevan reloj', () => {
        expect(messageStatusIconKind('pending')).toBe('pending');
        expect(messageStatusIconKind('sending')).toBe('pending');
    });

    it('guardar en el vault no es entregar', () => {
        expect(messageStatusIconKind('vaulted')).toBe('sent');
        expect(messageStatusIconKind('sent')).toBe('sent');
    });

    it('solo entregado y leido llevan doble tick', () => {
        expect(messageStatusIconKind('delivered')).toBe('delivered');
        expect(messageStatusIconKind('read')).toBe('delivered');
    });

    it('un estado desconocido o vacio no presume de entrega', () => {
        expect(messageStatusIconKind('')).toBe('sent');
        expect(messageStatusIconKind(undefined)).toBe('sent');
        expect(messageStatusIconKind(null)).toBe('sent');
        expect(messageStatusIconKind('cualquiera')).toBe('sent');
    });

    it('solo leido se resalta como leido', () => {
        expect(messageStatusIsRead('read')).toBe(true);
        expect(messageStatusIsRead('delivered')).toBe(false);
        expect(messageStatusIsRead('vaulted')).toBe(false);
    });
});
