import sodium from 'sodium-native';
import { hkdf, RatchetState } from './ratchetShared.js';

export function x3dhInitiator(
    aliceIkSk: Buffer,
    aliceIkPk: Buffer,
    bobIkPk: Buffer,
    bobSpkPk: Buffer
): { sharedSecret: Buffer; ekPub: Buffer } {
    const aliceIkSkCurve = Buffer.alloc(sodium.crypto_box_SECRETKEYBYTES);
    sodium.crypto_sign_ed25519_sk_to_curve25519(aliceIkSkCurve, aliceIkSk);

    const bobIkPkCurve = Buffer.alloc(sodium.crypto_box_PUBLICKEYBYTES);
    sodium.crypto_sign_ed25519_pk_to_curve25519(bobIkPkCurve, bobIkPk);

    const ekPk = Buffer.alloc(sodium.crypto_box_PUBLICKEYBYTES);
    const ekSk = Buffer.alloc(sodium.crypto_box_SECRETKEYBYTES);
    sodium.crypto_box_keypair(ekPk, ekSk);

    const dh1 = Buffer.alloc(sodium.crypto_scalarmult_BYTES);
    sodium.crypto_scalarmult(dh1, aliceIkSkCurve, bobSpkPk);

    const dh2 = Buffer.alloc(sodium.crypto_scalarmult_BYTES);
    sodium.crypto_scalarmult(dh2, ekSk, bobIkPkCurve);

    const dh3 = Buffer.alloc(sodium.crypto_scalarmult_BYTES);
    sodium.crypto_scalarmult(dh3, ekSk, bobSpkPk);

    const combined = Buffer.concat([dh1, dh2, dh3]);
    const zeroKey = Buffer.alloc(32, 0);
    const [sharedSecret] = hkdf(zeroKey, combined, 'X3DHv1.0');

    sodium.sodium_memzero(dh1);
    sodium.sodium_memzero(dh2);
    sodium.sodium_memzero(dh3);
    sodium.sodium_memzero(aliceIkSkCurve);
    sodium.sodium_memzero(ekSk);

    return { sharedSecret, ekPub: ekPk };
}

export function x3dhResponder(
    bobIkSk: Buffer,
    bobSpkSk: Buffer,
    aliceIkPk: Buffer,
    aliceEkPk: Buffer
): Buffer {
    const bobIkSkCurve = Buffer.alloc(sodium.crypto_box_SECRETKEYBYTES);
    sodium.crypto_sign_ed25519_sk_to_curve25519(bobIkSkCurve, bobIkSk);

    const aliceIkPkCurve = Buffer.alloc(sodium.crypto_box_PUBLICKEYBYTES);
    sodium.crypto_sign_ed25519_pk_to_curve25519(aliceIkPkCurve, aliceIkPk);

    const dh1 = Buffer.alloc(sodium.crypto_scalarmult_BYTES);
    sodium.crypto_scalarmult(dh1, bobSpkSk, aliceIkPkCurve);

    const dh2 = Buffer.alloc(sodium.crypto_scalarmult_BYTES);
    sodium.crypto_scalarmult(dh2, bobIkSkCurve, aliceEkPk);

    const dh3 = Buffer.alloc(sodium.crypto_scalarmult_BYTES);
    sodium.crypto_scalarmult(dh3, bobSpkSk, aliceEkPk);

    const combined = Buffer.concat([dh1, dh2, dh3]);
    const zeroKey = Buffer.alloc(32, 0);
    const [sharedSecret] = hkdf(zeroKey, combined, 'X3DHv1.0');

    sodium.sodium_memzero(dh1);
    sodium.sodium_memzero(dh2);
    sodium.sodium_memzero(dh3);
    sodium.sodium_memzero(bobIkSkCurve);

    return sharedSecret;
}

export function ratchetInitAlice(sharedSecret: Buffer, bobSpkPk: Buffer): RatchetState {
    const dhsPk = Buffer.alloc(sodium.crypto_box_PUBLICKEYBYTES);
    const dhsSk = Buffer.alloc(sodium.crypto_box_SECRETKEYBYTES);
    sodium.crypto_box_keypair(dhsPk, dhsSk);

    const dh = Buffer.alloc(sodium.crypto_scalarmult_BYTES);
    sodium.crypto_scalarmult(dh, dhsSk, bobSpkPk);

    const [newRk, cks] = hkdf(sharedSecret, dh, 'ratchet1');
    sodium.sodium_memzero(dh);

    return {
        rk: newRk,
        cks,
        ckr: null,
        ns: 0,
        nr: 0,
        pn: 0,
        dhsPk,
        dhsSk,
        dhr: bobSpkPk.subarray(0),
        skipped: new Map(),
    };
}

export function ratchetInitBob(sharedSecret: Buffer, bobSpkPk: Buffer, bobSpkSk: Buffer): RatchetState {
    return {
        rk: Buffer.from(sharedSecret),
        cks: null,
        ckr: null,
        ns: 0,
        nr: 0,
        pn: 0,
        dhsPk: bobSpkPk,
        dhsSk: bobSpkSk,
        dhr: null,
        skipped: new Map(),
    };
}