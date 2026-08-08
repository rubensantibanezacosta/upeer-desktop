import { describe, expect, it, vi, afterEach } from 'vitest';
import {
    generateGroupSenderState,
    rotateGroupSenderState,
    encryptGroupMessage,
    decryptGroupMessage,
    isValidGroupSenderKey,
    isValidGroupEpoch,
} from '../../../src/main_process/network/groupState.js';

describe('groupState', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('generateGroupSenderState', () => {
        it('genera una clave de 32 bytes hex con epoch dado', () => {
            const state = generateGroupSenderState(7);
            expect(state.epoch).toBe(7);
            expect(state.senderKey).toMatch(/^[0-9a-f]{64}$/);
            expect(state.senderKeyCreatedAt).toBeGreaterThan(0);
        });

        it('usa epoch 1 por defecto', () => {
            expect(generateGroupSenderState().epoch).toBe(1);
        });
    });

    describe('rotateGroupSenderState', () => {
        it('incrementa el epoch y genera nueva clave', () => {
            const before = generateGroupSenderState(5);
            const after = rotateGroupSenderState(5);
            expect(after.epoch).toBe(6);
            expect(after.senderKey).not.toBe(before.senderKey);
        });

        it('resetea a 1 para epoch inválido', () => {
            expect(rotateGroupSenderState(0).epoch).toBe(1);
            expect(rotateGroupSenderState(-3).epoch).toBe(1);
            expect(rotateGroupSenderState(1.5).epoch).toBe(1);
        });
    });

    describe('encryptGroupMessage / decryptGroupMessage', () => {
        it('cifra y descifra un round-trip', () => {
            const key = 'ab'.repeat(32);
            const { nonce, ciphertext } = encryptGroupMessage('mensaje secreto', key);
            expect(nonce).toMatch(/^[0-9a-f]{48}$/);
            expect(ciphertext).toMatch(/^[0-9a-f]+$/);

            const decrypted = decryptGroupMessage(nonce, ciphertext, key);
            expect(decrypted).toBe('mensaje secreto');
        });

        it('lanza error con clave de tamaño inválido en encrypt', () => {
            expect(() => encryptGroupMessage('x', 'short')).toThrow('Invalid group sender key');
        });

        it('devuelve null en decrypt para claves/nonce/ciphertext inválidos', () => {
            expect(decryptGroupMessage('abcd', 'abcd', 'abcd')).toBeNull();
        });
    });

    describe('isValidGroupSenderKey', () => {
        it('acepta claves hex de 64 chars', () => {
            expect(isValidGroupSenderKey('ab'.repeat(32))).toBe(true);
        });

        it('rechaza otros valores', () => {
            expect(isValidGroupSenderKey('short')).toBe(false);
            expect(isValidGroupSenderKey('zz'.repeat(32))).toBe(false);
            expect(isValidGroupSenderKey(123)).toBe(false);
            expect(isValidGroupSenderKey(undefined)).toBe(false);
        });
    });

    describe('isValidGroupEpoch', () => {
        it('acepta enteros positivos', () => {
            expect(isValidGroupEpoch(1)).toBe(true);
            expect(isValidGroupEpoch(1000)).toBe(true);
        });

        it('rechaza no enteros y fuera de rango', () => {
            expect(isValidGroupEpoch(0)).toBe(false);
            expect(isValidGroupEpoch(-1)).toBe(false);
            expect(isValidGroupEpoch(1.5)).toBe(false);
            expect(isValidGroupEpoch(2_147_483_648)).toBe(false);
            expect(isValidGroupEpoch('5')).toBe(false);
        });
    });
});
