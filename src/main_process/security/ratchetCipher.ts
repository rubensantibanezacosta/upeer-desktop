import sodium from 'sodium-native';
import { chainStep, hkdf, MAX_SKIP, MAX_SKIPPED_TOTAL, RatchetHeader, RatchetState } from './ratchetShared.js';

function dhRatchetStep(state: RatchetState, remoteDhPk: Buffer): void {
    state.pn = state.ns;
    state.ns = 0;
    state.nr = 0;

    const dh1 = Buffer.alloc(sodium.crypto_scalarmult_BYTES);
    sodium.crypto_scalarmult(dh1, state.dhsSk, remoteDhPk);
    [state.rk, state.ckr] = hkdf(state.rk, dh1, 'ratchet1');
    sodium.sodium_memzero(dh1);

    const newPk = Buffer.alloc(sodium.crypto_box_PUBLICKEYBYTES);
    const newSk = Buffer.alloc(sodium.crypto_box_SECRETKEYBYTES);
    sodium.crypto_box_keypair(newPk, newSk);
    sodium.sodium_memzero(state.dhsSk);
    state.dhsPk = newPk;
    state.dhsSk = newSk;
    state.dhr = remoteDhPk;

    const dh2 = Buffer.alloc(sodium.crypto_scalarmult_BYTES);
    sodium.crypto_scalarmult(dh2, state.dhsSk, remoteDhPk);
    [state.rk, state.cks] = hkdf(state.rk, dh2, 'ratchet1');
    sodium.sodium_memzero(dh2);
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
    }

    sodium.sodium_memzero(mk);
    return null;
}