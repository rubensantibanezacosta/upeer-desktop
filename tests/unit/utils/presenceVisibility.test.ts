import { describe, expect, it } from 'vitest';

import { visiblePresence } from '../../../src/utils/presenceVisibility.js';

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
