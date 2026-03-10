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
const MAX_SKIP = 1000;              // Máximo de message keys "saltadas" almacenadas
const MAX_SKIPPED_TOTAL = 2000;     // Límite duro total de skipped keys

// ── Tipos públicos ────────────────────────────────────────────────────────────

/** Bundle de clave pre-firmada (SPK) publicada en cada HANDSHAKE */
export interface SignedPreKeyBundle {
    spkPub: string;   // hex X25519 public key
    spkSig: string;   // hex Ed25519 signature de spkPub por IK
    spkId: number;    // ID incremental (para correlacionar con el SK en DB)
}

/** Campo adjunto al primer mensaje CHAT para iniciar X3DH en el lado del receptor */
export interface X3DHInitPacket {
    ekPub: string;    // Clave efímera X25519 de Alice (hex)
    spkId: number;    // ID del SPK de Bob que Alice usó
    ikPub: string;    // Clave de identidad Ed25519 de Alice (hex)
}

/** Estado completo del Double Ratchet para una sesión con un contacto */
export interface RatchetState {
    rk: Buffer;              // Root key (32 bytes)
    cks: Buffer | null;      // Send chain key
    ckr: Buffer | null;      // Recv chain key
    ns: number;              // Contador envíos
    nr: number;              // Contador recepciones
    pn: number;              // Previous chain length
    dhsPk: Buffer;           // Nuestra DH ratchet public key (X25519)
    dhsSk: Buffer;           // Nuestra DH ratchet secret key (X25519)
    dhr: Buffer | null;      // DH ratchet public key del peer
    skipped: Map<string, Buffer>; // "dhPub:n" → messageKey
}

/** Cabecera de un mensaje ratchet (viaja en el paquete CHAT) */
export interface RatchetHeader {
    dh: string;   // Nuestra DH ratchet public key (hex)
    pn: number;   // Previous chain length
    n: number;    // Message number
}

// ── HKDF basado en BLAKE2b ────────────────────────────────────────────────────

/**
 * Derive two 32-byte subkeys from a root key and input material.
 * Usa crypto_kdf_derive_from_key (BLAKE2b internamente).
 */
function hkdf(rootKey: Buffer, inputMaterial: Buffer, info: string): [Buffer, Buffer] {
    // PRK = BLAKE2b(inputMaterial, key=rootKey)
    const prk = Buffer.alloc(sodium.crypto_kdf_KEYBYTES); // 32 bytes
    sodium.crypto_generichash(prk, inputMaterial, rootKey);

    // Derivar dos subclaves
    const out1 = Buffer.alloc(sodium.crypto_kdf_KEYBYTES);
    const out2 = Buffer.alloc(sodium.crypto_kdf_KEYBYTES);
    const ctx = Buffer.alloc(8);
    Buffer.from(info.slice(0, 8).padEnd(8, '\0'), 'ascii').copy(ctx);

    sodium.crypto_kdf_derive_from_key(out1, 1, ctx, prk);
    sodium.crypto_kdf_derive_from_key(out2, 2, ctx, prk);

    return [out1, out2];
}

// ── Chain KDF (HMAC-SHA256) ───────────────────────────────────────────────────

/**
 * Avanza un chain key para producir una message key y el siguiente chain key.
 * KDF_CK(ck) → (message_key, next_chain_key)
 */
function chainStep(ck: Buffer): [messageKey: Buffer, nextCk: Buffer] {
    // HMAC-SHA256 con la chain key como clave y constantes 0x01 / 0x02
    const mk = crypto.createHmac('sha256', ck).update(Buffer.from([0x01])).digest() as Buffer;
    const nck = crypto.createHmac('sha256', ck).update(Buffer.from([0x02])).digest() as Buffer;
    return [mk, nck];
}

// ── X3DH ─────────────────────────────────────────────────────────────────────

/**
 * X3DH lado iniciador (Alice).
 * Computa el shared secret para establecer una sesión con Bob.
 *
 * @param aliceIkSk   Ed25519 secret key de Alice (64 bytes)
 * @param aliceIkPk   Ed25519 public key de Alice (32 bytes)
 * @param bobIkPk     Ed25519 public key de Bob (32 bytes)
 * @param bobSpkPk    X25519 signed prekey public key de Bob (32 bytes)
 */
export function x3dhInitiator(
    aliceIkSk: Buffer,
    aliceIkPk: Buffer,
    bobIkPk: Buffer,
    bobSpkPk: Buffer
): { sharedSecret: Buffer; ekPub: Buffer } {
    // Convertir claves Ed25519 → X25519 para DH
    const aliceIkSkCurve = Buffer.alloc(sodium.crypto_box_SECRETKEYBYTES);
    sodium.crypto_sign_ed25519_sk_to_curve25519(aliceIkSkCurve, aliceIkSk);

    const bobIkPkCurve = Buffer.alloc(sodium.crypto_box_PUBLICKEYBYTES);
    sodium.crypto_sign_ed25519_pk_to_curve25519(bobIkPkCurve, bobIkPk);

    // Par efímero de Alice
    const ekPk = Buffer.alloc(sodium.crypto_box_PUBLICKEYBYTES);
    const ekSk = Buffer.alloc(sodium.crypto_box_SECRETKEYBYTES);
    sodium.crypto_box_keypair(ekPk, ekSk);

    // DH1 = DH(Alice_IK_X25519, Bob_SPK)
    const dh1 = Buffer.alloc(sodium.crypto_scalarmult_BYTES);
    sodium.crypto_scalarmult(dh1, aliceIkSkCurve, bobSpkPk);

    // DH2 = DH(Alice_EK, Bob_IK_X25519)
    const dh2 = Buffer.alloc(sodium.crypto_scalarmult_BYTES);
    sodium.crypto_scalarmult(dh2, ekSk, bobIkPkCurve);

    // DH3 = DH(Alice_EK, Bob_SPK)
    const dh3 = Buffer.alloc(sodium.crypto_scalarmult_BYTES);
    sodium.crypto_scalarmult(dh3, ekSk, bobSpkPk);

    // shared_secret = HKDF(0x00...||DH1||DH2||DH3, info="X3DHv1.0")
    const combined = Buffer.concat([Buffer.alloc(32, 0), dh1, dh2, dh3]);
    const zeroKey = Buffer.alloc(32, 0);
    const [sharedSecret] = hkdf(zeroKey, combined, 'X3DHv1.0');

    // Limpiar intermedios
    sodium.sodium_memzero(dh1);
    sodium.sodium_memzero(dh2);
    sodium.sodium_memzero(dh3);
    sodium.sodium_memzero(aliceIkSkCurve);
    // ekSk ya cumplió su función (DH2, DH3). Eliminarlo de memoria antes de retornar.
    sodium.sodium_memzero(ekSk);

    return { sharedSecret, ekPub: ekPk };
}

/**
 * X3DH lado respondedor (Bob).
 * Computa el mismo shared secret a partir del init packet de Alice.
 *
 * @param bobIkSk    Ed25519 secret key de Bob (64 bytes)
 * @param bobSpkSk   X25519 signed prekey secret key de Bob (32 bytes)
 * @param aliceIkPk  Ed25519 public key de Alice (32 bytes)
 * @param aliceEkPk  X25519 ephemeral public key de Alice (32 bytes)
 */
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

    // DH1 = DH(Bob_SPK, Alice_IK_X25519)
    const dh1 = Buffer.alloc(sodium.crypto_scalarmult_BYTES);
    sodium.crypto_scalarmult(dh1, bobSpkSk, aliceIkPkCurve);

    // DH2 = DH(Bob_IK_X25519, Alice_EK)
    const dh2 = Buffer.alloc(sodium.crypto_scalarmult_BYTES);
    sodium.crypto_scalarmult(dh2, bobIkSkCurve, aliceEkPk);

    // DH3 = DH(Bob_SPK, Alice_EK)
    const dh3 = Buffer.alloc(sodium.crypto_scalarmult_BYTES);
    sodium.crypto_scalarmult(dh3, bobSpkSk, aliceEkPk);

    const combined = Buffer.concat([Buffer.alloc(32, 0), dh1, dh2, dh3]);
    const zeroKey = Buffer.alloc(32, 0);
    const [sharedSecret] = hkdf(zeroKey, combined, 'X3DHv1.0');

    sodium.sodium_memzero(dh1);
    sodium.sodium_memzero(dh2);
    sodium.sodium_memzero(dh3);
    sodium.sodium_memzero(bobIkSkCurve);

    return sharedSecret;
}

// ── Inicialización del ratchet ────────────────────────────────────────────────

/**
 * Inicializar Double Ratchet como iniciador (Alice).
 * Alice empieza con send chain key, sin recv chain key.
 * @param bobSpkPk El SPK de Bob es también su DH ratchet initial key.
 */
export function ratchetInitAlice(sharedSecret: Buffer, bobSpkPk: Buffer): RatchetState {
    // Par DH inicial de Alice (para el ratchet, diferente del EK de X3DH)
    const dhsPk = Buffer.alloc(sodium.crypto_box_PUBLICKEYBYTES);
    const dhsSk = Buffer.alloc(sodium.crypto_box_SECRETKEYBYTES);
    sodium.crypto_box_keypair(dhsPk, dhsSk);

    // DH inicial con la SPK de Bob
    const dh = Buffer.alloc(sodium.crypto_scalarmult_BYTES);
    sodium.crypto_scalarmult(dh, dhsSk, bobSpkPk);

    const [newRk, cks] = hkdf(sharedSecret, dh, 'ratchet1');
    sodium.sodium_memzero(dh);

    return {
        rk: newRk, cks, ckr: null,
        ns: 0, nr: 0, pn: 0,
        dhsPk, dhsSk,
        dhr: bobSpkPk.subarray(0), // copia
        skipped: new Map(),
    };
}

/**
 * Inicializar Double Ratchet como respondedor (Bob).
 * Bob empieza sin send chain key (espera el primer mensaje de Alice).
 * @param bobSpkPk Bob usa su SPK como DH ratchet initial key.
 * @param bobSpkSk La clave privada del SPK.
 */
export function ratchetInitBob(sharedSecret: Buffer, bobSpkPk: Buffer, bobSpkSk: Buffer): RatchetState {
    return {
        rk: sharedSecret, cks: null, ckr: null,
        ns: 0, nr: 0, pn: 0,
        dhsPk: bobSpkPk, dhsSk: bobSpkSk,
        dhr: null,
        skipped: new Map(),
    };
}

// ── DH Ratchet step ───────────────────────────────────────────────────────────

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

    const nonce = Buffer.allocUnsafe(sodium.crypto_secretbox_NONCEBYTES);
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
        state.skipped.set(`${state.dhr!.toString('hex')}:${state.nr}`, mk);
        state.nr++;

        // Límite duro anti-DoS
        if (state.skipped.size > MAX_SKIPPED_TOTAL) {
            const oldest = state.skipped.keys().next().value;
            if (oldest) {
                const old = state.skipped.get(oldest)!;
                sodium.sodium_memzero(old);
                state.skipped.delete(oldest);
            }
        }
    }
}

/**
 * Descifrar un mensaje con el Double Ratchet.
 * Gestiona automáticamente mensajes fuera de orden.
 */
export function ratchetDecrypt(
    state: RatchetState,
    header: RatchetHeader,
    ciphertextHex: string,
    nonceHex: string
): Buffer | null {
    // BUG DK fix: comprobar longitud mínima antes de mutar el estado del ratchet.
    // crypto_secretbox_MACBYTES = 16 bytes = 32 hex chars. Si ciphertextHex es más corto,
    // Buffer.alloc(ct.length - MACBYTES) lanza RangeError DESPUÉS de que skipKeys y
    // dhRatchetStep han mutado el estado → sesión DR corrupta en memoria hasta reinicio.
    // Un peer autenticado malicioso podría enviar content='ab' con ratchetHeader válido
    // para desincronizar permanentemente la sesión DR con el servidor.
    if (ciphertextHex.length < 32) return null;

    // Intentar con skipped keys primero
    const skippedResult = trySkippedKey(state, header, ciphertextHex, nonceHex);
    if (skippedResult) return skippedResult;

    const msgDhPk = Buffer.from(header.dh, 'hex');
    const needsDhStep = !state.dhr || !msgDhPk.equals(state.dhr);

    // BUG AL fix: validar los saltos ANTES de mutar el estado.
    // Si skipKeys lanza después de haber llamado a dhRatchetStep (que muta rk, ckr,
    // dhsPk, dhsSk), el estado queda a medias y la sesión se rompe permanentemente.
    // El BUG T fix (no guardar sesión si plaintext===null) mitiga la persistencia,
    // pero el estado en RAM sigue corrupto para mensajes posteriores en la misma sesión.
    // Pre-validar garantiza que si vamos a rechazar, lo hacemos antes de tocar el estado.
    if (needsDhStep) {
        // Validar saltos de la cadena anterior (header.pn - state.nr en cadena actual)
        if (state.ckr && header.pn - state.nr > MAX_SKIP) {
            throw new Error('Ratchet: demasiados mensajes saltados (pre-DH step, pn)');
        }
    }
    // Validar saltos en la cadena nueva/actual (header.n)
    const nrAfterDhStep = needsDhStep ? 0 : state.nr;
    if (header.n - nrAfterDhStep > MAX_SKIP) {
        throw new Error('Ratchet: demasiados mensajes saltados (pre-skipKeys, n)');
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

    const ct = Buffer.from(ciphertextHex, 'hex');
    const plaintext = Buffer.alloc(ct.length - sodium.crypto_secretbox_MACBYTES);
    const ok = sodium.crypto_secretbox_open_easy(plaintext, ct, Buffer.from(nonceHex, 'hex'), mk);
    sodium.sodium_memzero(mk);
    return ok ? plaintext : null;
}

// ── Serialización (para SQLite) ───────────────────────────────────────────────

export interface SerializedRatchetState {
    rk: string;
    cks: string | null;
    ckr: string | null;
    ns: number;
    nr: number;
    pn: number;
    dhsPk: string;
    dhsSk: string;        // Protegido por SQLCipher
    dhr: string | null;
    skipped: Record<string, string>;
}

export function serializeState(s: RatchetState): SerializedRatchetState {
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
    };
}

export function deserializeState(s: SerializedRatchetState): RatchetState {
    const skipped = new Map<string, Buffer>();
    for (const [k, v] of Object.entries(s.skipped)) skipped.set(k, Buffer.from(v, 'hex'));
    return {
        rk: Buffer.from(s.rk, 'hex'),
        cks: s.cks ? Buffer.from(s.cks, 'hex') : null,
        ckr: s.ckr ? Buffer.from(s.ckr, 'hex') : null,
        ns: s.ns, nr: s.nr, pn: s.pn,
        dhsPk: Buffer.from(s.dhsPk, 'hex'),
        dhsSk: Buffer.from(s.dhsSk, 'hex'),
        dhr: s.dhr ? Buffer.from(s.dhr, 'hex') : null,
        skipped,
    };
}
