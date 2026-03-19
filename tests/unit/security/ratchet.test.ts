import { describe, it, expect, beforeEach } from 'vitest';
import sodium from 'sodium-native';
import {
    x3dhInitiator,
    x3dhResponder,
    ratchetInitAlice,
    ratchetInitBob,
    ratchetEncrypt,
    ratchetDecrypt
} from '../../../src/main_process/security/ratchet.js';

describe('Security - Double Ratchet & X3DH', () => {
    // Generar claves por cada test para evitar reutilizar entropía o estados
    let aliceIkPk: Buffer, aliceIkSk: Buffer;
    let bobIkPk: Buffer, bobIkSk: Buffer;
    let bobSpkPk: Buffer, bobSpkSk: Buffer;

    beforeEach(() => {
        aliceIkPk = Buffer.alloc(sodium.crypto_sign_PUBLICKEYBYTES);
        aliceIkSk = Buffer.alloc(sodium.crypto_sign_SECRETKEYBYTES);
        sodium.crypto_sign_keypair(aliceIkPk, aliceIkSk);

        bobIkPk = Buffer.alloc(sodium.crypto_sign_PUBLICKEYBYTES);
        bobIkSk = Buffer.alloc(sodium.crypto_sign_SECRETKEYBYTES);
        sodium.crypto_sign_keypair(bobIkPk, bobIkSk);

        bobSpkPk = Buffer.alloc(sodium.crypto_box_PUBLICKEYBYTES);
        bobSpkSk = Buffer.alloc(sodium.crypto_box_SECRETKEYBYTES);
        sodium.crypto_box_keypair(bobSpkPk, bobSpkSk);
    });

    it('should complete a full X3DH handshake between Alice and Bob', () => {
        // Alice inicia el handshake
        const { sharedSecret: aliceSecret, ekPub } = x3dhInitiator(
            aliceIkSk,
            aliceIkPk,
            bobIkPk,
            bobSpkPk
        );

        // Bob responde al recibir el paquete de Alice
        const bobSecret = x3dhResponder(
            bobIkSk,
            bobSpkSk,
            aliceIkPk,
            ekPub
        );

        expect(aliceSecret.toString('hex')).toBe(bobSecret.toString('hex'));
        expect(aliceSecret.length).toBe(32);
    });

    it('should encrypt and decrypt messages using Double Ratchet', () => {
        const { sharedSecret, ekPub } = x3dhInitiator(
            aliceIkSk,
            aliceIkPk,
            bobIkPk,
            bobSpkPk
        );
        const bobSecret = x3dhResponder(
            bobIkSk,
            bobSpkSk,
            aliceIkPk,
            ekPub
        );

        // Inicializar estados de Ratchet
        const stateAlice = ratchetInitAlice(sharedSecret, bobSpkPk);
        const stateBob = ratchetInitBob(bobSecret, bobSpkPk, bobSpkSk);

        // Alice envía mensaje a Bob
        const plaintext1 = Buffer.from('Hola Bob, esto es un test E2EE');
        const { header: header1, ciphertext: cipher1, nonce: nonce1 } = ratchetEncrypt(stateAlice, plaintext1);

        // Bob descifra mensaje de Alice
        const decrypted1 = ratchetDecrypt(stateBob, header1, cipher1, nonce1);
        expect(decrypted1?.toString()).toBe(plaintext1.toString());

        // Bob responde a Alice
        const plaintext2 = Buffer.from('Recibido Alice, funciona perfecto');
        const { header: header2, ciphertext: cipher2, nonce: nonce2 } = ratchetEncrypt(stateBob, plaintext2);

        // Alice descifra respuesta de Bob
        const decrypted2 = ratchetDecrypt(stateAlice, header2, cipher2, nonce2);
        expect(decrypted2?.toString()).toBe(plaintext2.toString());
    });

    it('should handle sequential messages correctly', () => {
        const { sharedSecret, ekPub } = x3dhInitiator(aliceIkSk, aliceIkPk, bobIkPk, bobSpkPk);
        const bobSecret = x3dhResponder(bobIkSk, bobSpkSk, aliceIkPk, ekPub);

        const stateAlice = ratchetInitAlice(sharedSecret, bobSpkPk);
        const stateBob = ratchetInitBob(bobSecret, bobSpkPk, bobSpkSk);

        // Bob recibe el primero para inicializar ckr
        const msg0 = Buffer.from(`Message 0`);
        const m0 = ratchetEncrypt(stateAlice, msg0);
        const d0 = ratchetDecrypt(stateBob, m0.header, m0.ciphertext, m0.nonce);
        expect(d0?.toString()).toBe(msg0.toString());

        // Alice envía 4 más secuencialmente
        for (let i = 1; i < 5; i++) {
            const msgStr = `Message ${i}`;
            const msg = Buffer.from(msgStr);
            const { header, ciphertext, nonce } = ratchetEncrypt(stateAlice, msg);
            const decrypted = ratchetDecrypt(stateBob, header, ciphertext, nonce);
            expect(decrypted, `Failed to decrypt message ${i}`).not.toBeNull();
            expect(decrypted?.toString()).toBe(msgStr);
        }
    });

    it('should handle messages from both sides (bidirectional)', () => {
        const { sharedSecret, ekPub } = x3dhInitiator(aliceIkSk, aliceIkPk, bobIkPk, bobSpkPk);
        const bobSecret = x3dhResponder(bobIkSk, bobSpkSk, aliceIkPk, ekPub);

        const stateAlice = ratchetInitAlice(sharedSecret, bobSpkPk);
        const stateBob = ratchetInitBob(bobSecret, bobSpkPk, bobSpkSk);

        // Alice -> Bob (1)
        const m1 = ratchetEncrypt(stateAlice, Buffer.from('Alice 1'));
        const d1 = ratchetDecrypt(stateBob, m1.header, m1.ciphertext, m1.nonce);
        expect(d1?.toString()).toBe('Alice 1');

        // Bob -> Alice (1) - Esto dispara un DH step en Alice
        const m2 = ratchetEncrypt(stateBob, Buffer.from('Bob 1'));
        const d2 = ratchetDecrypt(stateAlice, m2.header, m2.ciphertext, m2.nonce);
        expect(d2?.toString()).toBe('Bob 1');

        // Alice -> Bob (2) - Esto dispara un DH step en Bob
        const m3 = ratchetEncrypt(stateAlice, Buffer.from('Alice 2'));
        const d3 = ratchetDecrypt(stateBob, m3.header, m3.ciphertext, m3.nonce);
        expect(d3?.toString()).toBe('Alice 2');

        // Bob -> Alice (2)
        const m4 = ratchetEncrypt(stateBob, Buffer.from('Bob 2'));
        const d4 = ratchetDecrypt(stateAlice, m4.header, m4.ciphertext, m4.nonce);
        expect(d4?.toString()).toBe('Bob 2');
    });

    it('should handle out-of-order messages', () => {
        const { sharedSecret, ekPub } = x3dhInitiator(aliceIkSk, aliceIkPk, bobIkPk, bobSpkPk);
        const bobSecret = x3dhResponder(bobIkSk, bobSpkSk, aliceIkPk, ekPub);

        const stateAlice = ratchetInitAlice(sharedSecret, bobSpkPk);
        const stateBob = ratchetInitBob(bobSecret, bobSpkPk, bobSpkSk);

        const msgs = [
            ratchetEncrypt(stateAlice, Buffer.from('Msg 0')),
            ratchetEncrypt(stateAlice, Buffer.from('Msg 1')),
            ratchetEncrypt(stateAlice, Buffer.from('Msg 2')),
            ratchetEncrypt(stateAlice, Buffer.from('Msg 3')),
        ];

        // Recibimos en orden: 1, 3, 0, 2
        const d1 = ratchetDecrypt(stateBob, msgs[1].header, msgs[1].ciphertext, msgs[1].nonce);
        expect(d1?.toString()).toBe('Msg 1');

        const d3 = ratchetDecrypt(stateBob, msgs[3].header, msgs[3].ciphertext, msgs[3].nonce);
        expect(d3?.toString()).toBe('Msg 3');

        const d0 = ratchetDecrypt(stateBob, msgs[0].header, msgs[0].ciphertext, msgs[0].nonce);
        expect(d0?.toString()).toBe('Msg 0');

        const d2 = ratchetDecrypt(stateBob, msgs[2].header, msgs[2].ciphertext, msgs[2].nonce);
        expect(d2?.toString()).toBe('Msg 2');
    });

    it('should fail to decrypt if header or ciphertext is corrupted', () => {
        const { sharedSecret, ekPub } = x3dhInitiator(aliceIkSk, aliceIkPk, bobIkPk, bobSpkPk);
        const bobSecret = x3dhResponder(bobIkSk, bobSpkSk, aliceIkPk, ekPub);

        const stateAlice = ratchetInitAlice(sharedSecret, bobSpkPk);
        const stateBob = ratchetInitBob(bobSecret, bobSpkPk, bobSpkSk);

        const { header, ciphertext, nonce } = ratchetEncrypt(stateAlice, Buffer.from('secret'));

        // Corromper el ciphertext
        const corruptedCipher = (parseInt(ciphertext.slice(0, 2), 16) ^ 0xFF).toString(16).padStart(2, '0') + ciphertext.slice(2);

        const result = ratchetDecrypt(stateBob, header, corruptedCipher, nonce);
        expect(result).toBeNull();
    });
});

