import { describe, expect, it } from 'vitest';

import { PRESENCE_ONLINE_WINDOW_MS, isWithinPresenceWindow, visiblePresence } from '../../../src/utils/presenceVisibility.js';

const ALL_ON = { onlineStatus: true, lastSeen: true };

describe('visiblePresence', () => {
    it('muestra presencia y última vez con las dos preferencias activas', () => {
        expect(visiblePresence(true, 'ayer', ALL_ON)).toEqual({ isOnline: true, lastSeen: 'ayer' });
    });

    it('oculta la conexión cuando la preferencia está apagada', () => {
        expect(visiblePresence(true, 'ayer', { onlineStatus: false, lastSeen: true })).toEqual({ isOnline: false, lastSeen: 'ayer' });
    });

    it('oculta la última vez cuando la preferencia está apagada', () => {
        expect(visiblePresence(true, 'ayer', { onlineStatus: true, lastSeen: false })).toEqual({ isOnline: true, lastSeen: null });
    });

    it('sin preferencias no deja rastro de actividad', () => {
        expect(visiblePresence(true, 'ayer', { onlineStatus: false, lastSeen: false })).toEqual({ isOnline: false, lastSeen: null });
    });

    it('no inventa última vez cuando no hay dato', () => {
        expect(visiblePresence(false, undefined, ALL_ON)).toEqual({ isOnline: false, lastSeen: null });
    });
});

describe('isWithinPresenceWindow', () => {
    const NOW = new Date('2026-10-28T12:00:00Z').getTime();

    it('considera dentro de la ventana la actividad reciente', () => {
        expect(isWithinPresenceWindow(new Date(NOW - 10_000).toISOString(), NOW)).toBe(true);
    });

    it('deja fuera la actividad de más de 65 s', () => {
        expect(isWithinPresenceWindow(new Date(NOW - 70_000).toISOString(), NOW)).toBe(false);
    });

    it('acepta milisegundos y cadenas ISO', () => {
        expect(isWithinPresenceWindow(NOW - 1_000, NOW)).toBe(true);
        expect(isWithinPresenceWindow(new Date(NOW - 1_000).toISOString(), NOW)).toBe(true);
    });

    it('sin dato o con basura no hay presencia', () => {
        expect(isWithinPresenceWindow(undefined, NOW)).toBe(false);
        expect(isWithinPresenceWindow(null, NOW)).toBe(false);
        expect(isWithinPresenceWindow('', NOW)).toBe(false);
        expect(isWithinPresenceWindow('ayer', NOW)).toBe(false);
    });

    it('la ventana es la misma que usa useIsOnline', () => {
        expect(PRESENCE_ONLINE_WINDOW_MS).toBe(65_000);
    });
});
