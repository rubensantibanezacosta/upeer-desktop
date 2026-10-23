import { describe, expect, it } from 'vitest';
import { decodeEnrollmentMessage, encodeEnrollmentMessage } from '../../../src/main_process/security/enrollmentTransfer.js';

const message = {
    inviteId: 'ab'.repeat(32),
    nonce: 'cd'.repeat(24),
    ciphertext: 'ef'.repeat(48),
};

describe('codificación de mensajes de enrolamiento', () => {
    it('reconstruye el mensaje sellado desde el código', () => {
        expect(decodeEnrollmentMessage(encodeEnrollmentMessage(message))).toEqual(message);
    });

    it('tolera espacios y saltos de línea al pegar el código', () => {
        const code = encodeEnrollmentMessage(message);
        const wrapped = `${code.slice(0, 12)}\n  ${code.slice(12, 40)}\n${code.slice(40)}`;
        expect(decodeEnrollmentMessage(wrapped)).toEqual(message);
    });

    it('rechaza códigos vacíos o que no son texto', () => {
        expect(decodeEnrollmentMessage('')).toBeNull();
        expect(decodeEnrollmentMessage('   ')).toBeNull();
        expect(decodeEnrollmentMessage(null)).toBeNull();
        expect(decodeEnrollmentMessage(42)).toBeNull();
    });

    it('rechaza contenido que no es JSON', () => {
        expect(decodeEnrollmentMessage(Buffer.from('no-json', 'utf8').toString('base64url'))).toBeNull();
    });

    it('rechaza caracteres fuera del alfabeto base64url', () => {
        expect(decodeEnrollmentMessage('abc!def')).toBeNull();
    });

    it('rechaza códigos por encima del límite de tamaño', () => {
        expect(decodeEnrollmentMessage('a'.repeat(4097))).toBeNull();
    });
});
