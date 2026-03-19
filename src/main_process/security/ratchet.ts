/**
 * X3DH + Double Ratchet implementation para upeer P2P
 *
 * Basado en el Signal Protocol:
 *  - X3DH key agreement  : https://signal.org/docs/specifications/x3dh/
 *  - Double Ratchet (DR) : https://signal.org/docs/specifications/doubleratchet/
 *
 * Primitivas de libsodium utilizadas:
 *  - X25519 DH            → crypto_scalarmult
 *  - BLAKE2b HKDF         → crypto_generichash + crypto_kdf_derive_from_key
 *  - HMAC-SHA256 chain KDF → node:crypto createHmac (tipos de sodium no exponen hmacsha256)
 *  - XSalsa20-Poly1305    → crypto_secretbox_easy (mensajes individuales)
 *
 * ┌─────────────────────────── Flujo ─────────────────────────────────────┐
 * │  1. Bob publica SPK firmado en el HANDSHAKE                           │
 * │  2. Alice (primer mensaje): X3DH → shared_secret → ratchetInitAlice   │
 * │     Paquete incluye: { x3dh: { ekPub, spkId, ikPub } }               │
 * │  3. Bob recibe primer mensaje: X3DH → ratchetInitBob → ratchetDecrypt │
 * │  4. Mensajes posteriores: solo ratchetEncrypt / ratchetDecrypt        │
 * └───────────────────────────────────────────────────────────────────────┘
 */

import sodium from 'sodium-native';
import crypto from 'node:crypto';

// ── Constantes ────────────────────────────────────────────────────────────────
const MAX_SKIP = 1000;
const MAX_SKIPPED_TOTAL = 2000;

export interface SignedPreKeyBundle {
    spkPub: string;
    spkSig: string;
    spkId: number;
}

export interface X3DHInitPacket {
    ekPub: string;
    spkId: number;
    ikPub: string;
}

export interface RatchetState {
    rk: Buffer;
    cks: Buffer | null;
    ckr: Buffer | null;
    ns: number;
    nr: number;
    pn: number;
    dhsPk: Buffer;
    dhsSk: Buffer;
    dhr: Buffer | null;
    skipped: Map<string, Buffer>;
}

export interface RatchetHeader {
    dh: string;
    pn: number;
    n: number;
}

function hkdf(rootKey: Buffer, inputMaterial: Buffer, info: string): [Buffer, Buffer] {
    const prk = Buffer.alloc(sodium.crypto_kdf_KEYBYTES);
    sodium.crypto_generichash(prk, inputMaterial, rootKey);

    const out1 = Buffer.alloc(sodium.crypto_kdf_KEYBYTES);
    const out2 = Buffer.alloc(sodium.crypto_kdf_KEYBYTES);
    const ctx = Buffer.alloc(8);
    Buffer.from(info.slice(0, 8).padEnd(8, '\0'), 'ascii').copy(ctx);

    sodium.crypto_kdf_derive_from_key(out1, 1, ctx, prk);
    sodium.crypto_kdf_derive_from_key(out2, 2, ctx, prk);

    return [out1, out2];
}

function chainStep(ck: Buffer): [messageKey: Buffer, nextCk: Buffer] {
    const mk = crypto.createHmac('sha256', ck).update(Buffer.from([0x01])).digest();
    const nck = crypto.createHmac('sha256', ck).update(Buffer.from([0x02])).digest();
    return [mk, nck];
}

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
        rk: newRk, cks, ckr: null,
        ns: 0, nr: 0, pn: 0,
        dhsPk, dhsSk,
        dhr: bobSpkPk.subarray(0),
        skipped: new Map(),
    };
}

export function ratchetInitBob(sharedSecret: Buffer, bobSpkPk: Buffer, bobSpkSk: Buffer): RatchetState {
    return {
        rk: sharedSecret, cks: null, ckr: null,
        ns: 0, nr: 0, pn: 0,
        dhsPk: bobSpkPk, dhsSk: bobSpkSk,
        dhr: null,
        skipped: new Map(),
    };
}

function dhRatchetStep(state: RatchetState, remoteDhPk: Buffer): void {
    state.pn = state.ns;
    state.ns = 0;
    state.nr = 0;

    // DH con la nueva clave del peer → recv chain key
    const dh1 = Buffer.alloc(sodium.crypto_scalarmult_BYTES);
    sodium.crypto_scalarmult(dh1, state.dhsSk, remoteDhPk);
    [state.rk, state.ckr] = hkdf(state.rk, dh1, 'ratchet1');
    sodium.sodium_memzero(dh1);

    // Generar nuevo par DH
    const newPk = Buffer.alloc(sodium.crypto_box_PUBLICKEYBYTES);
    const newSk = Buffer.alloc(sodium.crypto_box_SECRETKEYBYTES);
    sodium.crypto_box_keypair(newPk, newSk);
    sodium.sodium_memzero(state.dhsSk);
    state.dhsPk = newPk;
    state.dhsSk = newSk;
    state.dhr = remoteDhPk;

    // DH con la nueva clave del peer → send chain key
    const dh2 = Buffer.alloc(sodium.crypto_scalarmult_BYTES);
    sodium.crypto_scalarmult(dh2, state.dhsSk, remoteDhPk);
    [state.rk, state.cks] = hkdf(state.rk, dh2, 'ratchet1');
    sodium.sodium_memzero(dh2);
}

// ── Cifrado y descifrado ──────────────────────────────────────────────────────

/**
 * Cifrar un mensaje con el Double Ratchet.
 * Avanza el send chain y devuelve la cabecera + ciphertext.
 */
export function ratchetEncrypt(state: RatchetState, plaintext: Buffer): {
    header: RatchetHeader;
    ciphertext: string;
    nonce: string;
} {
    if (!state.cks) throw new Error('Ratchet: sin send chain key (¿no inicializado como Alice?)');

    const [mk, nextCks] = chainStep(state.cks);
    state.cks = nextCks;

    const nonce = Buffer.alloc(sodium.crypto_secretbox_NONCEBYTES);
    sodium.randombytes_buf(nonce);

    const ct = Buffer.alloc(plaintext.length + sodium.crypto_secretbox_MACBYTES);
    sodium.crypto_secretbox_easy(ct, plaintext, nonce, mk);
    sodium.sodium_memzero(mk);

    const header: RatchetHeader = {
        dh: state.dhsPk.toString('hex'),
        pn: state.pn,
        n: state.ns,
    };
    state.ns++;

    return { header, ciphertext: ct.toString('hex'), nonce: nonce.toString('hex') };
}

function trySkippedKey(state: RatchetState, header: RatchetHeader, ciphertextHex: string, nonceHex: string): Buffer | null {
    const key = `${header.dh}:${header.n}`;
    const mk = state.skipped.get(key);
    if (!mk) return null;
    state.skipped.delete(key);

    const ct = Buffer.from(ciphertextHex, 'hex');
    const plaintext = Buffer.alloc(ct.length - sodium.crypto_secretbox_MACBYTES);
    const ok = sodium.crypto_secretbox_open_easy(plaintext, ct, Buffer.from(nonceHex, 'hex'), mk);
    sodium.sodium_memzero(mk);
    return ok ? plaintext : null;
}

function skipKeys(state: RatchetState, until: number): void {
    if (!state.ckr) return;
    if (until - state.nr > MAX_SKIP) throw new Error('Ratchet: demasiados mensajes saltados');
    while (state.nr < until) {
        const [mk, nextCkr] = chainStep(state.ckr);
        state.ckr = nextCkr;
        const dhr = state.dhr;
        if (dhr) {
            state.skipped.set(`${dhr.toString('hex')}:${state.nr}`, mk);
        }
        state.nr++;

        // Límite duro anti-DoS
        if (state.skipped.size > MAX_SKIPPED_TOTAL) {
            const oldest = state.skipped.keys().next().value;
            if (oldest) {
                const old = state.skipped.get(oldest);
                if (old) {
                    sodium.sodium_memzero(old);
                    state.skipped.delete(oldest);
                }
            }
        }
    }
}

export function ratchetDecrypt(
    state: RatchetState,
    header: RatchetHeader,
    ciphertextHex: string,
    nonceHex: string
): Buffer | null {
    if (ciphertextHex.length < 32) return null;

    const skippedResult = trySkippedKey(state, header, ciphertextHex, nonceHex);
    if (skippedResult) return skippedResult;

    const msgDhPk = Buffer.from(header.dh, 'hex');
    const needsDhStep = !state.dhr || !msgDhPk.equals(state.dhr);

    if (needsDhStep) {
        if (state.ckr && header.pn - state.nr > MAX_SKIP) {
            throw new Error('Ratchet: demasiados mensajes saltados (pre-DH step, pn)');
        }
    }
    const nrAfterDhStep = needsDhStep ? 0 : state.nr;
    if (header.n - nrAfterDhStep > MAX_SKIP) {
        throw new Error('Ratchet: demasiados mensajes saltados (pre-skipKeys, n)');
    }

    if (needsDhStep) {
        if (state.ckr) {
            skipKeys(state, header.pn);
        }
        dhRatchetStep(state, msgDhPk);
    }

    skipKeys(state, header.n);

    if (!state.ckr) return null;
    const [mk, nextCkr] = chainStep(state.ckr);

    const ct = Buffer.from(ciphertextHex, 'hex');
    const plaintext = Buffer.alloc(ct.length - sodium.crypto_secretbox_MACBYTES);
    const nonce = Buffer.from(nonceHex, 'hex');
    const ok = sodium.crypto_secretbox_open_easy(plaintext, ct, nonce, mk);

    if (ok) {
        state.ckr = nextCkr;
        state.nr++;
        sodium.sodium_memzero(mk);
        return plaintext;
    } else {
        sodium.sodium_memzero(mk);
        return null;
    }
}

export interface SerializedRatchetState {
    rk: string;
    cks: string | null;
    ckr: string | null;
    ns: number;
    nr: number;
    pn: number;
    dhsPk: string;
    dhsSk: string;
    dhr: string | null;
    skipped: Record<string, string>;
    spkIdUsed?: number | null;
}

export function serializeState(s: RatchetState, spkIdUsed?: number | null): SerializedRatchetState {
    const skipped: Record<string, string> = {};
    for (const [k, v] of s.skipped) skipped[k] = v.toString('hex');
    return {
        rk: s.rk.toString('hex'),
        cks: s.cks?.toString('hex') ?? null,
        ckr: s.ckr?.toString('hex') ?? null,
        ns: s.ns, nr: s.nr, pn: s.pn,
        dhsPk: s.dhsPk.toString('hex'),
        dhsSk: s.dhsSk.toString('hex'),
        dhr: s.dhr?.toString('hex') ?? null,
        skipped,
        spkIdUsed: spkIdUsed ?? null,
    };
}

export function deserializeState(s: SerializedRatchetState): { state: RatchetState; spkIdUsed: number | null } {
    const skipped = new Map<string, Buffer>();
    for (const [k, v] of Object.entries(s.skipped)) skipped.set(k, Buffer.from(v, 'hex'));
    const state: RatchetState = {
        rk: Buffer.from(s.rk, 'hex'),
        cks: s.cks ? Buffer.from(s.cks, 'hex') : null,
        ckr: s.ckr ? Buffer.from(s.ckr, 'hex') : null,
        ns: s.ns, nr: s.nr, pn: s.pn,
        dhsPk: Buffer.from(s.dhsPk, 'hex'),
        dhsSk: Buffer.from(s.dhsSk, 'hex'),
        dhr: s.dhr ? Buffer.from(s.dhr, 'hex') : null,
        skipped,
    };
    return { state, spkIdUsed: s.spkIdUsed ?? null };
}
