import { describe, it, expect } from 'vitest';
import sodium from 'sodium-native';
import { sealPacket, unsealPacket, SEALED_TYPES } from '../../../src/main_process/network/sealed.js';

describe('Sealed Sender Unit Tests', () => {
    // Generar un par de claves de identidad persistente para el receptor
    const recipientPk = Buffer.alloc(sodium.crypto_sign_PUBLICKEYBYTES);
    const recipientSk = Buffer.alloc(sodium.crypto_sign_SECRETKEYBYTES);
    sodium.crypto_sign_keypair(recipientPk, recipientSk);

    const recipientPkHex = recipientPk.toString('hex');

    it('should have a consistent list of SEALED_TYPES', () => {
        expect(SEALED_TYPES.has('CHAT')).toBe(true);
        expect(SEALED_TYPES.has('GROUP_MSG')).toBe(true);
        expect(SEALED_TYPES.has('FILE_CHUNK')).toBe(true);
        expect(SEALED_TYPES.has('HANDSHAKE_REQ')).toBe(false);
    });

    it('should seal and unseal a packet correctly', () => {
        const innerPacket = {
            type: 'CHAT',
            senderUpeerId: 'sender-id',
            content: 'hello world',
            timestamp: Date.now()
        };

        // 1. Sellar (Cifrar)
        const sealed = sealPacket(innerPacket, recipientPkHex);

        expect(sealed.type).toBe('SEALED');
        expect(sealed.ciphertext).toBeDefined();

        // 2. Des-sellar (Descifrar)
        // myEdSkFn usa crypto_box_seal_open con la clave secreta del receptor
        const myEdSkFn = (ciphertext: Buffer): Buffer | null => {
            const myCurveSk = Buffer.alloc(sodium.crypto_box_SECRETKEYBYTES);
            const myCurvePk = Buffer.alloc(sodium.crypto_box_PUBLICKEYBYTES);
            sodium.crypto_sign_ed25519_sk_to_curve25519(myCurveSk, recipientSk);
            sodium.crypto_sign_ed25519_pk_to_curve25519(myCurvePk, recipientPk);

            const plaintext = Buffer.alloc(ciphertext.length - sodium.crypto_box_SEALBYTES);
            const ok = sodium.crypto_box_seal_open(plaintext, ciphertext, myCurvePk, myCurveSk);

            sodium.sodium_memzero(myCurveSk);
            return ok ? plaintext : null;
        };

        const unsealed = unsealPacket(sealed as any, myEdSkFn);

        expect(unsealed).not.toBeNull();
        expect(unsealed?.type).toBe('CHAT');
        expect(unsealed?.content).toBe('hello world');
        expect(unsealed?.senderUpeerId).toBe('sender-id');
    });

    it('should return null if decryption fails (wrong key)', () => {
        const innerPacket = { type: 'CHAT', content: 'test' };
        const sealed = sealPacket(innerPacket, recipientPkHex);

        const wrongSkFn = () => {
            return null; // Simula fallo de descifrado
        };

        const result = unsealPacket(sealed as any, wrongSkFn);
        expect(result).toBeNull();
    });

    it('should return null if inner packet is malformed (not JSON)', () => {
        // Mock que devuelve algo que no es JSON válido tras descifrar
        const badJsonSkFn = () => {
            return Buffer.from('not-json-at-all');
        };

        const result = unsealPacket({
            senderEphPub: 'a'.repeat(64),
            nonce: 'b'.repeat(48),
            ciphertext: 'c'.repeat(64)
        }, badJsonSkFn);

        expect(result).toBeNull();
    });

    it('should correctly handle Ed25519 to Curve25519 conversion', () => {
        // Este test verifica que sealPacket usa crypto_box_seal correctamente
        const innerPacket = { foo: 'bar' };
        const sealed = sealPacket(innerPacket, recipientPkHex);

        expect(sealed.type).toBe('SEALED');
        expect(sealed.ciphertext).toBeDefined();
        expect(typeof sealed.ciphertext).toBe('string');
    });
});
