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

export type {
    SignedPreKeyBundle,
    X3DHInitPacket,
    RatchetState,
    RatchetHeader,
    SerializedRatchetState,
} from './ratchetShared.js';
export { x3dhInitiator, x3dhResponder, ratchetInitAlice, ratchetInitBob } from './ratchetX3dh.js';
export { ratchetEncrypt, ratchetDecrypt } from './ratchetCipher.js';
export { serializeState, deserializeState } from './ratchetState.js';
