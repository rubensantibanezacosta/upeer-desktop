import { describe, expect, it } from 'vitest';
import {
    isValidHexId,
    validatePowProof,
    validateSignedPreKey,
    validateLocationBlock,
    validateHexKey40Or64,
    validateJsonSerializableValue,
} from '../../../src/main_process/security/validationShared.js';

describe('validationShared', () => {
    describe('isValidHexId', () => {
        it('acepta ids hex de 32 a 128 chars', () => {
            expect(isValidHexId('a'.repeat(32))).toBe(true);
            expect(isValidHexId('a'.repeat(64))).toBe(true);
            expect(isValidHexId('a'.repeat(128))).toBe(true);
        });

        it('rechaza longitudes fuera de rango y valores no string', () => {
            expect(isValidHexId('a'.repeat(31))).toBe(false);
            expect(isValidHexId('a'.repeat(129))).toBe(false);
            expect(isValidHexId(123)).toBe(false);
            expect(isValidHexId('zz'.repeat(32))).toBe(false);
            expect(isValidHexId('A'.repeat(64))).toBe(true);
        });
    });

    describe('validatePowProof', () => {
        it('acepta strings hex cortos y objetos JSON', () => {
            expect(validatePowProof('abc123').valid).toBe(true);
            expect(validatePowProof('{"difficulty":3}').valid).toBe(true);
        });

        it('rechaza tipo no string, demasiado largo y formato inválido', () => {
            expect(validatePowProof(42).valid).toBe(false);
            expect(validatePowProof('a'.repeat(257)).valid).toBe(false);
            expect(validatePowProof('not-hex!').valid).toBe(false);
        });
    });

    describe('validateSignedPreKey', () => {
        it('acepta undefined/null y objetos válidos', () => {
            expect(validateSignedPreKey(undefined).valid).toBe(true);
            expect(validateSignedPreKey(null).valid).toBe(true);
            expect(validateSignedPreKey({
                spkPub: 'a'.repeat(64),
                spkSig: 'b'.repeat(128),
                spkId: 5,
            }).valid).toBe(true);
        });

        it('rechaza no-objetos y campos con formato inválido', () => {
            expect(validateSignedPreKey('str').valid).toBe(false);
            expect(validateSignedPreKey({ spkPub: 'short' }).valid).toBe(false);
            expect(validateSignedPreKey({ spkSig: 'short' }).valid).toBe(false);
            expect(validateSignedPreKey({ spkId: -1 }).valid).toBe(false);
            expect(validateSignedPreKey({ spkId: 1.5 }).valid).toBe(false);
        });
    });

    describe('validateLocationBlock', () => {
        it('acepta un bloque válido y opcional ausente', () => {
            expect(validateLocationBlock({
                address: '200::1',
                dhtSeq: 123,
                signature: 'a'.repeat(128),
            }).valid).toBe(true);
            expect(validateLocationBlock(undefined, false).valid).toBe(true);
        });

        it('rechaza bloque ausente requerido, no objeto y campos inválidos', () => {
            expect(validateLocationBlock(undefined, true).valid).toBe(false);
            expect(validateLocationBlock('x').valid).toBe(false);
            expect(validateLocationBlock({ dhtSeq: 1, signature: 'a'.repeat(128) }).valid).toBe(false);
            expect(validateLocationBlock({ address: '200::1', signature: 'a'.repeat(128) }).valid).toBe(false);
            expect(validateLocationBlock({ address: '200::1', dhtSeq: -1, signature: 'a'.repeat(128) }).valid).toBe(false);
            expect(validateLocationBlock({ address: '200::1', dhtSeq: 1, signature: 'short' }).valid).toBe(false);
        });

        it('valida powProof cuando está presente', () => {
            expect(validateLocationBlock({
                address: '200::1',
                dhtSeq: 1,
                signature: 'a'.repeat(128),
                powProof: 'not-hex!',
            }).valid).toBe(false);
        });
    });

    describe('validateHexKey40Or64', () => {
        it('acepta claves hex de 40 o 64', () => {
            expect(validateHexKey40Or64('a'.repeat(40))).toBe(true);
            expect(validateHexKey40Or64('a'.repeat(64))).toBe(true);
        });

        it('rechaza longitudes y tipos inválidos', () => {
            expect(validateHexKey40Or64('a'.repeat(41))).toBe(false);
            expect(validateHexKey40Or64('a'.repeat(63))).toBe(false);
            expect(validateHexKey40Or64(42)).toBe(false);
        });
    });

    describe('validateJsonSerializableValue', () => {
        it('acepta strings y objetos serializables dentro del límite', () => {
            expect(validateJsonSerializableValue('hola', 100).valid).toBe(true);
            expect(validateJsonSerializableValue({ a: 1 }, 100).valid).toBe(true);
        });

        it('rechaza null/undefined, valores demasiado grandes y no serializables', () => {
            expect(validateJsonSerializableValue(null, 100).valid).toBe(false);
            expect(validateJsonSerializableValue(undefined, 100).valid).toBe(false);
            expect(validateJsonSerializableValue('a'.repeat(101), 100).valid).toBe(false);

            const circular: Record<string, unknown> = {};
            circular.self = circular;
            expect(validateJsonSerializableValue(circular, 100).valid).toBe(false);
        });
    });
});
