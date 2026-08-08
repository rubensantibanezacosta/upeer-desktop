import { describe, expect, it } from 'vitest';
import { isValidCallId, isValidMediaKind, validateCallPacket } from '../../../src/main_process/network/call/validationCalls.js';

describe('validateCallPacket', () => {
    it('acepta un CALL_OFFER válido', () => {
        expect(validateCallPacket('CALL_OFFER', { callId: 'abc123', kind: 'audio' })).toEqual({ valid: true });
    });

    it('rechaza un tipo de paquete desconocido', () => {
        expect(validateCallPacket('CALL_X', { callId: 'abc' }).valid).toBe(false);
    });

    it('rechaza callId ausente o inválido', () => {
        expect(validateCallPacket('CALL_OFFER', { kind: 'audio' }).reason).toBe('invalid-call-id');
        expect(validateCallPacket('CALL_OFFER', { callId: '', kind: 'audio' }).reason).toBe('invalid-call-id');
    });

    it('rechaza un kind no soportado', () => {
        expect(validateCallPacket('CALL_OFFER', { callId: 'abc', kind: 'text' }).reason).toBe('invalid-kind');
    });

    it('rechaza CALL_MEDIA sin payload', () => {
        expect(validateCallPacket('CALL_MEDIA', { callId: 'abc' }).reason).toBe('invalid-media');
    });

    it('acepta CALL_MEDIA con payload', () => {
        expect(validateCallPacket('CALL_MEDIA', { callId: 'abc', data: 'eA==' }).valid).toBe(true);
    });

    it('valida el resto de tipos de llamada', () => {
        for (const type of ['CALL_RING', 'CALL_ACCEPT', 'CALL_REJECT', 'CALL_END', 'CALL_CANCEL']) {
            expect(validateCallPacket(type, { callId: 'abc' }).valid).toBe(true);
        }
    });
});

describe('isValidCallId / isValidMediaKind', () => {
    it('comprueba longitudes y tipos', () => {
        expect(isValidCallId('a')).toBe(true);
        expect(isValidCallId('')).toBe(false);
        expect(isValidCallId(123)).toBe(false);
        expect(isValidMediaKind('audio')).toBe(true);
        expect(isValidMediaKind('video')).toBe(true);
        expect(isValidMediaKind('data')).toBe(false);
    });
});
