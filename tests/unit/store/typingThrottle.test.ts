import { describe, expect, it } from 'vitest';
import { createTypingThrottle, TYPING_WINDOW_MS } from '../../../src/store/typingThrottle.js';

describe('createTypingThrottle', () => {
    it('envía el primer aviso de escritura de cada conversación', () => {
        const shouldSend = createTypingThrottle(() => 1000);

        expect(shouldSend('peer-a', 'typing')).toBe(true);
        expect(shouldSend('peer-b', 'typing')).toBe(true);
    });

    it('agrupa los avisos de escritura dentro de la ventana', () => {
        let now = 1000;
        const shouldSend = createTypingThrottle(() => now);

        expect(shouldSend('peer-a', 'typing')).toBe(true);
        now += 500;
        expect(shouldSend('peer-a', 'typing')).toBe(false);
        now += TYPING_WINDOW_MS;
        expect(shouldSend('peer-a', 'typing')).toBe(true);
    });

    it('deja pasar grabación y parada sin esperar la ventana', () => {
        let now = 1000;
        const shouldSend = createTypingThrottle(() => now);

        expect(shouldSend('peer-a', 'typing')).toBe(true);
        now += 100;
        expect(shouldSend('peer-a', 'recording')).toBe(true);
        expect(shouldSend('peer-a', 'stop')).toBe(true);
        expect(shouldSend('peer-a', 'typing')).toBe(true);
    });

    it('vuelve a enviar al cambiar de conversación', () => {
        let now = 1000;
        const shouldSend = createTypingThrottle(() => now);

        expect(shouldSend('peer-a', 'typing')).toBe(true);
        now += 100;
        expect(shouldSend('peer-a', 'typing')).toBe(false);
        now += 100;
        expect(shouldSend('peer-b', 'typing')).toBe(true);
    });
});
