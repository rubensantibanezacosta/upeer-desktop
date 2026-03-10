import sodium from "sodium-native";
import crypto from "node:crypto";
const MAX_SKIP = 1e3;
const MAX_SKIPPED_TOTAL = 2e3;
function hkdf(rootKey, inputMaterial, info) {
  const prk = Buffer.alloc(sodium.crypto_kdf_KEYBYTES);
  sodium.crypto_generichash(prk, inputMaterial, rootKey);
  const out1 = Buffer.alloc(sodium.crypto_kdf_KEYBYTES);
  const out2 = Buffer.alloc(sodium.crypto_kdf_KEYBYTES);
  const ctx = Buffer.alloc(8);
  Buffer.from(info.slice(0, 8).padEnd(8, "\0"), "ascii").copy(ctx);
  sodium.crypto_kdf_derive_from_key(out1, 1, ctx, prk);
  sodium.crypto_kdf_derive_from_key(out2, 2, ctx, prk);
  return [out1, out2];
}
function chainStep(ck) {
  const mk = crypto.createHmac("sha256", ck).update(Buffer.from([1])).digest();
  const nck = crypto.createHmac("sha256", ck).update(Buffer.from([2])).digest();
  return [mk, nck];
}
function x3dhInitiator(aliceIkSk, aliceIkPk, bobIkPk, bobSpkPk) {
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
  const combined = Buffer.concat([Buffer.alloc(32, 0), dh1, dh2, dh3]);
  const zeroKey = Buffer.alloc(32, 0);
  const [sharedSecret] = hkdf(zeroKey, combined, "X3DHv1.0");
  sodium.sodium_memzero(dh1);
  sodium.sodium_memzero(dh2);
  sodium.sodium_memzero(dh3);
  sodium.sodium_memzero(aliceIkSkCurve);
  sodium.sodium_memzero(ekSk);
  return { sharedSecret, ekPub: ekPk };
}
function x3dhResponder(bobIkSk, bobSpkSk, aliceIkPk, aliceEkPk) {
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
  const combined = Buffer.concat([Buffer.alloc(32, 0), dh1, dh2, dh3]);
  const zeroKey = Buffer.alloc(32, 0);
  const [sharedSecret] = hkdf(zeroKey, combined, "X3DHv1.0");
  sodium.sodium_memzero(dh1);
  sodium.sodium_memzero(dh2);
  sodium.sodium_memzero(dh3);
  sodium.sodium_memzero(bobIkSkCurve);
  return sharedSecret;
}
function ratchetInitAlice(sharedSecret, bobSpkPk) {
  const dhsPk = Buffer.alloc(sodium.crypto_box_PUBLICKEYBYTES);
  const dhsSk = Buffer.alloc(sodium.crypto_box_SECRETKEYBYTES);
  sodium.crypto_box_keypair(dhsPk, dhsSk);
  const dh = Buffer.alloc(sodium.crypto_scalarmult_BYTES);
  sodium.crypto_scalarmult(dh, dhsSk, bobSpkPk);
  const [newRk, cks] = hkdf(sharedSecret, dh, "ratchet1");
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
    // copia
    skipped: /* @__PURE__ */ new Map()
  };
}
function ratchetInitBob(sharedSecret, bobSpkPk, bobSpkSk) {
  return {
    rk: sharedSecret,
    cks: null,
    ckr: null,
    ns: 0,
    nr: 0,
    pn: 0,
    dhsPk: bobSpkPk,
    dhsSk: bobSpkSk,
    dhr: null,
    skipped: /* @__PURE__ */ new Map()
  };
}
function dhRatchetStep(state, remoteDhPk) {
  state.pn = state.ns;
  state.ns = 0;
  state.nr = 0;
  const dh1 = Buffer.alloc(sodium.crypto_scalarmult_BYTES);
  sodium.crypto_scalarmult(dh1, state.dhsSk, remoteDhPk);
  [state.rk, state.ckr] = hkdf(state.rk, dh1, "ratchet1");
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
  [state.rk, state.cks] = hkdf(state.rk, dh2, "ratchet1");
  sodium.sodium_memzero(dh2);
}
function ratchetEncrypt(state, plaintext) {
  if (!state.cks) throw new Error("Ratchet: sin send chain key (¿no inicializado como Alice?)");
  const [mk, nextCks] = chainStep(state.cks);
  state.cks = nextCks;
  const nonce = Buffer.allocUnsafe(sodium.crypto_secretbox_NONCEBYTES);
  sodium.randombytes_buf(nonce);
  const ct = Buffer.alloc(plaintext.length + sodium.crypto_secretbox_MACBYTES);
  sodium.crypto_secretbox_easy(ct, plaintext, nonce, mk);
  sodium.sodium_memzero(mk);
  const header = {
    dh: state.dhsPk.toString("hex"),
    pn: state.pn,
    n: state.ns
  };
  state.ns++;
  return { header, ciphertext: ct.toString("hex"), nonce: nonce.toString("hex") };
}
function trySkippedKey(state, header, ciphertextHex, nonceHex) {
  const key = `${header.dh}:${header.n}`;
  const mk = state.skipped.get(key);
  if (!mk) return null;
  state.skipped.delete(key);
  const ct = Buffer.from(ciphertextHex, "hex");
  const plaintext = Buffer.alloc(ct.length - sodium.crypto_secretbox_MACBYTES);
  const ok = sodium.crypto_secretbox_open_easy(plaintext, ct, Buffer.from(nonceHex, "hex"), mk);
  sodium.sodium_memzero(mk);
  return ok ? plaintext : null;
}
function skipKeys(state, until) {
  if (!state.ckr) return;
  if (until - state.nr > MAX_SKIP) throw new Error("Ratchet: demasiados mensajes saltados");
  while (state.nr < until) {
    const [mk, nextCkr] = chainStep(state.ckr);
    state.ckr = nextCkr;
    state.skipped.set(`${state.dhr.toString("hex")}:${state.nr}`, mk);
    state.nr++;
    if (state.skipped.size > MAX_SKIPPED_TOTAL) {
      const oldest = state.skipped.keys().next().value;
      if (oldest) {
        const old = state.skipped.get(oldest);
        sodium.sodium_memzero(old);
        state.skipped.delete(oldest);
      }
    }
  }
}
function ratchetDecrypt(state, header, ciphertextHex, nonceHex) {
  if (ciphertextHex.length < 32) return null;
  const skippedResult = trySkippedKey(state, header, ciphertextHex, nonceHex);
  if (skippedResult) return skippedResult;
  const msgDhPk = Buffer.from(header.dh, "hex");
  const needsDhStep = !state.dhr || !msgDhPk.equals(state.dhr);
  if (needsDhStep) {
    if (state.ckr && header.pn - state.nr > MAX_SKIP) {
      throw new Error("Ratchet: demasiados mensajes saltados (pre-DH step, pn)");
    }
  }
  const nrAfterDhStep = needsDhStep ? 0 : state.nr;
  if (header.n - nrAfterDhStep > MAX_SKIP) {
    throw new Error("Ratchet: demasiados mensajes saltados (pre-skipKeys, n)");
  }
  if (needsDhStep) {
    skipKeys(state, header.pn);
    dhRatchetStep(state, msgDhPk);
  }
  skipKeys(state, header.n);
  if (!state.ckr) return null;
  const [mk, nextCkr] = chainStep(state.ckr);
  state.ckr = nextCkr;
  state.nr++;
  const ct = Buffer.from(ciphertextHex, "hex");
  const plaintext = Buffer.alloc(ct.length - sodium.crypto_secretbox_MACBYTES);
  const ok = sodium.crypto_secretbox_open_easy(plaintext, ct, Buffer.from(nonceHex, "hex"), mk);
  sodium.sodium_memzero(mk);
  return ok ? plaintext : null;
}
function serializeState(s) {
  var _a, _b, _c;
  const skipped = {};
  for (const [k, v] of s.skipped) skipped[k] = v.toString("hex");
  return {
    rk: s.rk.toString("hex"),
    cks: ((_a = s.cks) == null ? void 0 : _a.toString("hex")) ?? null,
    ckr: ((_b = s.ckr) == null ? void 0 : _b.toString("hex")) ?? null,
    ns: s.ns,
    nr: s.nr,
    pn: s.pn,
    dhsPk: s.dhsPk.toString("hex"),
    dhsSk: s.dhsSk.toString("hex"),
    dhr: ((_c = s.dhr) == null ? void 0 : _c.toString("hex")) ?? null,
    skipped
  };
}
function deserializeState(s) {
  const skipped = /* @__PURE__ */ new Map();
  for (const [k, v] of Object.entries(s.skipped)) skipped.set(k, Buffer.from(v, "hex"));
  return {
    rk: Buffer.from(s.rk, "hex"),
    cks: s.cks ? Buffer.from(s.cks, "hex") : null,
    ckr: s.ckr ? Buffer.from(s.ckr, "hex") : null,
    ns: s.ns,
    nr: s.nr,
    pn: s.pn,
    dhsPk: Buffer.from(s.dhsPk, "hex"),
    dhsSk: Buffer.from(s.dhsSk, "hex"),
    dhr: s.dhr ? Buffer.from(s.dhr, "hex") : null,
    skipped
  };
}
export {
  deserializeState,
  ratchetDecrypt,
  ratchetEncrypt,
  ratchetInitAlice,
  ratchetInitBob,
  serializeState,
  x3dhInitiator,
  x3dhResponder
};
