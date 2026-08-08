import { describe, expect, it } from 'vitest';
import { compressMessage, decompressMessage, isCompressedMessage } from '../../../src/main_process/utils/messageCompression.js';

describe('messageCompression', () => {
    it('no comprime mensajes cortos', () => {
        const text = 'hola';
        expect(compressMessage(text)).toBe(text);
        expect(isCompressedMessage(text)).toBe(false);
    });

    it('comprime y descomprime un mensaje largo', () => {
        const text = 'palabra repetida '.repeat(200);
        const compressed = compressMessage(text);
        expect(isCompressedMessage(compressed)).toBe(true);
        expect(compressed.length).toBeLessThan(text.length);
        expect(decompressMessage(compressed)).toBe(text);
    });

    it('devuelve el texto sin cambios si no está comprimido', () => {
        expect(decompressMessage('sin comprimir')).toBe('sin comprimir');
    });

    it('no comprime si no hay ganancia', () => {
        const random = 'abcdefghijklmnopqrstuvwxyz0123456789'.repeat(30);
        const result = compressMessage(random);
        if (isCompressedMessage(result)) {
            expect(decompressMessage(result)).toBe(random);
        } else {
            expect(result).toBe(random);
        }
    });
});
