import sodium from 'sodium-native';
import { info, error, debug, warn } from './secure-logger.js';
import fs from 'node:fs';
import path from 'node:path';
import * as bip39 from 'bip39';

let publicKey: Buffer;
let secretKey: Buffer;
let upeerId: string;
let ephemeralPublicKey: Buffer;
let ephemeralSecretKey: Buffer;
// ── Signed PreKey (SPK) para X3DH / Double Ratchet ───────────────────────────
// El SPK es un par X25519 firmado por nuestra clave Ed25519. Lo publicamos en
// cada HANDSHAKE para que el iniciador pueda hacer X3DH sin ronda de negociación.
// Se rota semanalmente (≠ ephemeral que rota cada 5 min).
let spkPublicKey: Buffer;
let spkSecretKey: Buffer;
let spkId: number = 0;
const SPK_ROTATION_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000; // 1 semana
let spkRotationInterval: NodeJS.Timeout | null = null;
// Ring buffer de SPKs anteriores para X3DH: cubre peers offline hasta 2 semanas.
// Índice: { id, pk, sk }  (máx 2 entradas → 3 semanas de cobertura total).
const MAX_PREVIOUS_SPK = 2;
let previousSpkEntries: Array<{ spkId: number; spkPk: Buffer; spkSk: Buffer }> = [];
// Ring buffer of previous ephemeral secret keys — kept so peers that miss a
// rotation PING (e.g. during offline simulation or transient network loss) can
// still have their messages decrypted. 6 keys @ 5-min rotation = 30 min coverage.
const MAX_PREVIOUS_EPH_KEYS = 6;
let previousEphemeralSecretKeys: Buffer[] = [];
let ephemeralKeyRotationInterval: NodeJS.Timeout | null = null;
let ephemeralKeyRotationCounter: number = 0;
const EPHEMERAL_KEY_ROTATION_INTERVAL_MS = 5 * 60 * 1000; // Rotate every 5 minutes
const EPHEMERAL_KEY_MAX_MESSAGES = 100; // Rotate after 100 messages
let dhtSeq: number = 0;
let dhtStatePath: string; let myAlias: string = '';
let myAvatar: string = '';
// ── Identity state ────────────────────────────────────────────────────────────
let _userDataPath: string = '';
let _isLocked: boolean = true;  // App starts locked until user provides mnemonic
let _isMnemonicBased: boolean = false;

/**
 * Mode detection file — written when user creates a mnemonic-based identity.
 */
const MNEMONIC_MODE_FLAG = 'identity.mnemonic_mode';
/**
 * Random 32-byte key unique to this device installation.
 * Used to encrypt the in-memory secret key so it survives normal app restarts
 * without asking the user for their mnemonic every time.
 */
const DEVICE_KEY_FILE = 'device.key';
/**
 * Encrypted copy of the Ed25519 secret key (nonce + ciphertext).
 * Written after every successful unlock; deleted on explicit lockSession().
 */
const SESSION_ENC_FILE = 'identity.enc';
/**
 * Marker written by lockSession(). Its presence means the user actively
 * chose to lock; the app must ask for the mnemonic on next start.
 */
const SESSION_LOCKED_FILE = 'session.locked';
/** Plain-text file with the user’s chosen display name. Not sensitive. */
const ALIAS_FILE = 'identity.alias';/** Plain-text file with the user's chosen avatar (base64 data URL). Not sensitive. */
const AVATAR_FILE = 'identity.avatar';
// ── Device key helpers ────────────────────────────────────────────────────────

function _getOrCreateDeviceKey(userDataPath: string): Buffer {
    const p = path.join(userDataPath, DEVICE_KEY_FILE);
    if (fs.existsSync(p)) {
        const k = fs.readFileSync(p);
        if (k.length === sodium.crypto_secretbox_KEYBYTES) return k;
    }
    const k = Buffer.allocUnsafe(sodium.crypto_secretbox_KEYBYTES);
    sodium.randombytes_buf(k);
    fs.writeFileSync(p, k, { mode: 0o600 });
    return k;
}

function _saveEncryptedSession(userDataPath: string): void {
    try {
        const devKey = _getOrCreateDeviceKey(userDataPath);
        const nonce = Buffer.allocUnsafe(sodium.crypto_secretbox_NONCEBYTES);
        sodium.randombytes_buf(nonce);
        const cipher = Buffer.alloc(secretKey.length + sodium.crypto_secretbox_MACBYTES);
        sodium.crypto_secretbox_easy(cipher, secretKey, nonce, devKey);
        // Format: [nonce (24 B)][ciphertext]
        fs.writeFileSync(path.join(userDataPath, SESSION_ENC_FILE), Buffer.concat([nonce, cipher]), { mode: 0o600 });
        // Remove the explicit-lock marker if it existed
        const lockedPath = path.join(userDataPath, SESSION_LOCKED_FILE);
        if (fs.existsSync(lockedPath)) fs.unlinkSync(lockedPath);
    } catch (e) {
        error('No se pudo guardar la sesión cifrada', e, 'identity');
    }
}

function _tryLoadEncryptedSession(userDataPath: string): boolean {
    const encPath = path.join(userDataPath, SESSION_ENC_FILE);
    const lockedPath = path.join(userDataPath, SESSION_LOCKED_FILE);
    if (!fs.existsSync(encPath) || fs.existsSync(lockedPath)) return false;
    try {
        const devKey = _getOrCreateDeviceKey(userDataPath);
        const blob = fs.readFileSync(encPath);
        const nonce = blob.subarray(0, sodium.crypto_secretbox_NONCEBYTES);
        const cipher = blob.subarray(sodium.crypto_secretbox_NONCEBYTES);
        const plain = Buffer.alloc(cipher.length - sodium.crypto_secretbox_MACBYTES);
        const ok = sodium.crypto_secretbox_open_easy(plain, cipher, nonce, devKey);
        if (!ok || plain.length !== sodium.crypto_sign_SECRETKEYBYTES) return false;
        secretKey = plain;
        publicKey = secretKey.subarray(32);
        return true;
    } catch (e) {
        error('No se pudo cargar la sesión cifrada', e, 'identity');
        return false;
    }
}

// ── initIdentity ──────────────────────────────────────────────────────────────

export function initIdentity(userDataPath: string) {
    _userDataPath = userDataPath;
    const flagPath = path.join(userDataPath, MNEMONIC_MODE_FLAG);
    const legacyKeyPath = path.join(userDataPath, 'identity.key');

    // Migrate legacy installations: back up the old random keypair.
    if (!fs.existsSync(flagPath) && fs.existsSync(legacyKeyPath)) {
        try { fs.renameSync(legacyKeyPath, legacyKeyPath + '.legacy-bak'); } catch (_) { /* ignore */ }
        info('Instalación heredada detectada. Clave aleatoria respaldada. Se requiere frase semilla.', {}, 'identity');
    }

    dhtStatePath = path.join(userDataPath, 'dht_state.json');
    _isMnemonicBased = fs.existsSync(flagPath);
    _loadDhtSeq();
    // Load alias (not sensitive, readable before unlock)
    const aliasPath = path.join(userDataPath, ALIAS_FILE);
    if (fs.existsSync(aliasPath)) {
        try { myAlias = fs.readFileSync(aliasPath, 'utf8').trim(); } catch (_) { }
    }
    const avatarPath = path.join(userDataPath, AVATAR_FILE);
    if (fs.existsSync(avatarPath)) {
        try { myAvatar = fs.readFileSync(avatarPath, 'utf8').trim(); } catch (_) { }
    }
    if (!_isMnemonicBased) {
        // First run — no identity yet. UI will show setup wizard.
        _isLocked = true;
        info('Primera ejecución. Se requiere crear o importar una frase semilla.', {}, 'identity');
        return;
    }

    const userExplicitlyLocked = fs.existsSync(path.join(userDataPath, SESSION_LOCKED_FILE));

    if (!userExplicitlyLocked && _tryLoadEncryptedSession(userDataPath)) {
        // Normal restart: auto-restore session without asking for mnemonic.
        _isLocked = false;
        _finalizeIdentityInit(userDataPath);
        info('Sesión restaurada automáticamente.', { upeerId }, 'identity');
    } else {
        // Explicit lock or no saved session: ask for mnemonic.
        _isLocked = true;
        info('Sesión bloqueada. Se requiere frase semilla para continuar.', {}, 'identity');
    }
}

function _loadDhtSeq() {
    if (!dhtStatePath) return;
    if (fs.existsSync(dhtStatePath)) {
        try {
            const dhtData = JSON.parse(fs.readFileSync(dhtStatePath, 'utf8'));
            if (typeof dhtData.seq === 'number') {
                dhtSeq = dhtData.seq;
            }
        } catch (e) {
            error('Error reading DHT state', e, 'identity');
        }
    } else {
        dhtSeq = Date.now();
        fs.writeFileSync(dhtStatePath, JSON.stringify({ seq: dhtSeq }));
    }
}

function _finalizeIdentityInit(userDataPath: string) {
    // upeer ID: 16-byte BLAKE2b hash of Public Key for a shorter, cleaner ID
    const hash = Buffer.alloc(16);
    sodium.crypto_generichash(hash, publicKey);
    upeerId = hash.toString('hex');

    // Ephemeral Key setup for PFS per session
    ephemeralPublicKey = Buffer.alloc(sodium.crypto_box_PUBLICKEYBYTES);
    ephemeralSecretKey = Buffer.alloc(sodium.crypto_box_SECRETKEYBYTES);
    sodium.crypto_box_keypair(ephemeralPublicKey, ephemeralSecretKey);
    startEphemeralKeyRotation();

    // ── Signed PreKey (SPK) setup para X3DH ──────────────────────────────────
    _rotateSignedPreKey();
    if (spkRotationInterval) clearInterval(spkRotationInterval);
    spkRotationInterval = setInterval(_rotateSignedPreKey, SPK_ROTATION_INTERVAL_MS);

    dhtStatePath = path.join(userDataPath, 'dht_state.json');
    _loadDhtSeq();

    info('Identidad upeer Inicializada', { upeerId, dhtSeq }, 'identity');
}

// ── Mnemonic API ──────────────────────────────────────────────────────────────

/** Generate a fresh 12-word BIP39 mnemonic */
export function generateMnemonic(): string {
    return bip39.generateMnemonic(128);
}

/** Validate a mnemonic phrase */
export function validateMnemonic(mnemonic: string): boolean {
    return bip39.validateMnemonic(mnemonic.trim().toLowerCase());
}

/**
 * Derive Ed25519 keypair from a mnemonic phrase using Argon2id.
 * The same mnemonic always produces the same keypair on any device.
 */
export async function deriveKeypairFromMnemonic(mnemonic: string): Promise<boolean> {
    const cleaned = mnemonic.trim().toLowerCase();
    if (!bip39.validateMnemonic(cleaned)) {
        error('Invalid mnemonic provided', {}, 'identity');
        return false;
    }

    // Convert mnemonic to entropy bytes (16 bytes for 12-word phrase)
    const entropy = Buffer.from(bip39.mnemonicToEntropy(cleaned), 'hex');

    // Use Argon2id to stretch the entropy into a 64-byte seed
    // This is deliberately expensive to prevent brute-force
    const seed = Buffer.alloc(64);
    const salt = Buffer.alloc(sodium.crypto_pwhash_SALTBYTES);
    // Deterministic salt: BLAKE2b of the fixed string "upeer-identity-v1" 
    sodium.crypto_generichash(salt.subarray(0, 16), Buffer.from('upeer-identity-v1'));

    sodium.crypto_pwhash(
        seed,
        entropy,
        salt,
        sodium.crypto_pwhash_OPSLIMIT_INTERACTIVE,
        sodium.crypto_pwhash_MEMLIMIT_INTERACTIVE,
        sodium.crypto_pwhash_ALG_ARGON2ID13
    );

    // Derive Ed25519 keypair from seed (first 32 bytes)
    publicKey = Buffer.alloc(sodium.crypto_sign_PUBLICKEYBYTES);
    secretKey = Buffer.alloc(sodium.crypto_sign_SECRETKEYBYTES);
    sodium.crypto_sign_seed_keypair(publicKey, secretKey, seed.subarray(0, 32));

    info('Keypair derivado desde frase semilla', {}, 'identity');
    return true;
}

/**
 * Create a new mnemonic-based identity (first time setup).
 * Saves the mode flag to disk. Keys are NOT saved to disk — always derived from mnemonic.
 */
export async function createMnemonicIdentity(mnemonic: string, alias?: string, avatar?: string): Promise<{ success: boolean; upeerId?: string; error?: string }> {
    if (!_userDataPath) return { success: false, error: 'App not initialized' };

    const ok = await deriveKeypairFromMnemonic(mnemonic);
    if (!ok) return { success: false, error: 'Frase semilla inválida' };

    _finalizeIdentityInit(_userDataPath);
    if (alias) setMyAlias(alias);
    if (avatar) setMyAvatar(avatar);

    // Write the mode flag so next launch knows this is a mnemonic-based identity.
    const flagPath = path.join(_userDataPath, MNEMONIC_MODE_FLAG);
    fs.writeFileSync(flagPath, JSON.stringify({ createdAt: Date.now(), version: 1 }));
    _isMnemonicBased = true;
    _isLocked = false;

    // Persist encrypted session so the user doesn't need to type the mnemonic on every restart.
    _saveEncryptedSession(_userDataPath);

    info('Identidad mnemonic creada', { upeerId }, 'identity');
    return { success: true, upeerId };
}

/**
 * Unlock session with mnemonic phrase.
 * Derives keys in memory without writing them to disk.
 */
export async function unlockWithMnemonic(mnemonic: string): Promise<{ success: boolean; upeerId?: string; error?: string }> {
    if (!_isMnemonicBased) return { success: false, error: 'Esta identidad no usa frase semilla' };

    const ok = await deriveKeypairFromMnemonic(mnemonic);
    if (!ok) return { success: false, error: 'Frase semilla inválida' };

    _finalizeIdentityInit(_userDataPath);
    _isLocked = false;

    // Persist encrypted session so next restart is automatic.
    _saveEncryptedSession(_userDataPath);

    info('Sesión desbloqueada con frase semilla', { upeerId }, 'identity');
    return { success: true, upeerId };
}

/**
 * Lock the session — wipe private keys from memory.
 */
export function lockSession(): void {
    if (secretKey) sodium.sodium_memzero(secretKey);
    if (ephemeralSecretKey) sodium.sodium_memzero(ephemeralSecretKey);
    // BUG AO fix: también zerizar las claves privadas X25519 del SPK (actual y ring buffer)
    // y las claves efímeras anteriores. Sin esto, 7+ claves privadas quedan en la heap
    // de V8 después de que el usuario bloquea la sesión, accesibles si se vuelca la memoria.
    if (spkSecretKey) sodium.sodium_memzero(spkSecretKey);
    for (const entry of previousSpkEntries) {
        sodium.sodium_memzero(entry.spkSk);
    }
    previousSpkEntries = [];
    for (const prevSk of previousEphemeralSecretKeys) {
        sodium.sodium_memzero(prevSk);
    }
    previousEphemeralSecretKeys = [];
    if (spkRotationInterval) { clearInterval(spkRotationInterval); spkRotationInterval = null; }
    stopEphemeralKeyRotation();
    _isLocked = true;

    // Write explicit-lock marker and remove the cached encrypted session.
    // Next restart will require the mnemonic.
    if (_userDataPath) {
        try {
            fs.writeFileSync(path.join(_userDataPath, SESSION_LOCKED_FILE), '1');
        } catch (_) { /* ignore */ }
        const encPath = path.join(_userDataPath, SESSION_ENC_FILE);
        if (fs.existsSync(encPath)) {
            try { fs.unlinkSync(encPath); } catch (_) { /* ignore */ }
        }
    }

    info('Sesión bloqueada por el usuario', {}, 'identity');
}

export function isSessionLocked(): boolean {
    return _isLocked;
}

export function isMnemonicMode(): boolean {
    return _isMnemonicBased;
}

export function getMyAlias(): string {
    return myAlias;
}

export function setMyAlias(alias: string): void {
    myAlias = alias.trim().slice(0, 64);
    if (_userDataPath) {
        try {
            fs.writeFileSync(path.join(_userDataPath, ALIAS_FILE), myAlias, { encoding: 'utf8' });
        } catch (_) { /* ignore */ }
    }
}

export function getMyAvatar(): string {
    return myAvatar;
}

export function setMyAvatar(avatar: string): void {
    // Limit avatar size to ~200 KB base64 string
    if (avatar.length > 204800) {
        error('Avatar demasiado grande, debe ser menor de 200 KB', {}, 'identity');
        return;
    }
    myAvatar = avatar;
    if (_userDataPath) {
        try {
            if (avatar) {
                fs.writeFileSync(path.join(_userDataPath, AVATAR_FILE), avatar, { encoding: 'utf8' });
            } else {
                const p = path.join(_userDataPath, AVATAR_FILE);
                if (fs.existsSync(p)) fs.unlinkSync(p);
            }
        } catch (_) { /* ignore */ }
    }
}

export function getMyPublicKey() {
    return publicKey;
}

export function getMyPublicKeyHex() {
    return publicKey.toString('hex');
}

export function getMyUPeerId() {
    return upeerId;
}

export function getUPeerIdFromPublicKey(publicKey: Buffer): string {
    const hash = Buffer.alloc(16);
    sodium.crypto_generichash(hash, publicKey);
    return hash.toString('hex');
}

export function sign(message: Buffer): Buffer {
    const signature = Buffer.allocUnsafe(sodium.crypto_sign_BYTES);
    sodium.crypto_sign_detached(signature, message, secretKey);
    return signature;
}

export function verify(message: Buffer, signature: Buffer, senderPublicKey: Buffer): boolean {
    return sodium.crypto_sign_verify_detached(signature, message, senderPublicKey);
}

export function getMyEphemeralPublicKeyHex() {
    return ephemeralPublicKey.toString('hex');
}

export function rotateEphemeralKeys(): void {
    // Push the outgoing secret into the ring buffer so peers that missed the
    // rotation PING can still have their in-flight messages decrypted.
    previousEphemeralSecretKeys.unshift(ephemeralSecretKey);
    if (previousEphemeralSecretKeys.length > MAX_PREVIOUS_EPH_KEYS) {
        previousEphemeralSecretKeys.length = MAX_PREVIOUS_EPH_KEYS;
    }

    // Generate new ephemeral key pair
    const newEphemeralPublicKey = Buffer.alloc(sodium.crypto_box_PUBLICKEYBYTES);
    const newEphemeralSecretKey = Buffer.alloc(sodium.crypto_box_SECRETKEYBYTES);
    sodium.crypto_box_keypair(newEphemeralPublicKey, newEphemeralSecretKey);

    // Update global variables
    ephemeralPublicKey = newEphemeralPublicKey;
    ephemeralSecretKey = newEphemeralSecretKey;
    ephemeralKeyRotationCounter = 0;

    // BUG CD fix: el pre-incremento ++ephemeralKeyRotationCounter en el log
    // dejaba el contador en 1 tras resetear a 0 → siguientes rotaciones ocurrían
    // cada 99 mensajes en vez de 100. Ahora se registra el número de rotación
    // con una variable local sin mutar el contador compartido.
    info('Ephemeral keys rotated', {}, 'identity');

    // Notify all connected contacts about key rotation
    notifyContactsAboutKeyRotation();
}

// Notify all connected contacts about key rotation
function notifyContactsAboutKeyRotation(): void {
    info('Notifying contacts about ephemeral key rotation', {}, 'identity');
    // Lazy import para evitar dependencia circular con server.ts
    import('../network/server.js').then(({ sendSecureUDPMessage }) => {
        import('../storage/db.js').then(({ getContacts }) => {
            const contacts = getContacts();
            for (const c of contacts) {
                if (c.status === 'connected' && c.address) {
                    // PING con la nueva ephemeralPublicKey para que el peer
                    // actualice su copia de nuestra clave efímera
                    sendSecureUDPMessage(c.address, {
                        type: 'PING',
                        ephemeralPublicKey: getMyEphemeralPublicKeyHex()
                    });
                }
            }
        }).catch((err) => warn('Failed to issue vouch', err, 'reputation'));
    }).catch(() => { });
}

export function incrementEphemeralMessageCounter(): void {
    ephemeralKeyRotationCounter++;

    // Rotate keys if we've sent too many messages
    if (ephemeralKeyRotationCounter >= EPHEMERAL_KEY_MAX_MESSAGES) {
        rotateEphemeralKeys();
    }
}

function startEphemeralKeyRotation(): void {
    // Clear any existing interval
    if (ephemeralKeyRotationInterval) {
        clearInterval(ephemeralKeyRotationInterval);
    }

    // Start new rotation interval
    ephemeralKeyRotationInterval = setInterval(() => {
        rotateEphemeralKeys();
    }, EPHEMERAL_KEY_ROTATION_INTERVAL_MS);

    info('Ephemeral key rotation started', { interval: EPHEMERAL_KEY_ROTATION_INTERVAL_MS }, 'identity');
}

export function stopEphemeralKeyRotation(): void {
    if (ephemeralKeyRotationInterval) {
        clearInterval(ephemeralKeyRotationInterval);
        ephemeralKeyRotationInterval = null;
    }
}

export function getMyDhtSeq() {
    return dhtSeq;
}

export function incrementMyDhtSeq() {
    dhtSeq++;
    try {
        fs.writeFileSync(dhtStatePath, JSON.stringify({ seq: dhtSeq }));
    } catch (e) {
        error('Failed to save DHT state', e, 'identity');
    }
    return dhtSeq;
}

/**
 * ENCRYPTION (E2EE)
 * Using crypto_box (X25519 + Salsa20 + Poly1305)
 * We convert our Ed25519 identity keys to Curve25519 keys for encryption.
 */

export function encrypt(message: Buffer, recipientPublicKey: Buffer, useEphemeral: boolean = false): { ciphertext: Buffer; nonce: Buffer } {
    let recipientCurvePK: Buffer;
    let myCurveSK: Buffer;

    if (useEphemeral) {
        recipientCurvePK = recipientPublicKey; // Already Curve25519
        myCurveSK = ephemeralSecretKey;
        // NOTE: do NOT call incrementEphemeralMessageCounter() here.
        // Callers capture getMyEphemeralPublicKeyHex() *before* calling encrypt(),
        // then increment *after* sending — guaranteeing the key in the packet
        // always matches the secret key used for encryption.
    } else {
        recipientCurvePK = Buffer.alloc(sodium.crypto_box_PUBLICKEYBYTES);
        sodium.crypto_sign_ed25519_pk_to_curve25519(recipientCurvePK, recipientPublicKey);
        myCurveSK = Buffer.alloc(sodium.crypto_box_SECRETKEYBYTES);
        sodium.crypto_sign_ed25519_sk_to_curve25519(myCurveSK, secretKey);
    }

    const nonce = Buffer.allocUnsafe(sodium.crypto_box_NONCEBYTES);
    sodium.randombytes_buf(nonce);

    const ciphertext = Buffer.alloc(message.length + sodium.crypto_box_MACBYTES);
    sodium.crypto_box_easy(ciphertext, message, nonce, recipientCurvePK, myCurveSK);

    // Limpiar claves derivadas X25519 de memoria inmediatamente tras uso.
    // Las claves efímeras son referencias al módulo global — NO zerear.
    if (!useEphemeral) {
        sodium.sodium_memzero(myCurveSK);
        sodium.sodium_memzero(recipientCurvePK);
    }

    return { ciphertext, nonce };
}

export function decrypt(ciphertext: Buffer, nonce: Buffer, senderPublicKey: Buffer, useEphemeral: boolean = false): Buffer | null {
    let senderCurvePK: Buffer;
    let myCurveSK: Buffer;

    if (useEphemeral) {
        senderCurvePK = senderPublicKey; // Already Curve25519
        myCurveSK = ephemeralSecretKey;
    } else {
        senderCurvePK = Buffer.alloc(sodium.crypto_box_PUBLICKEYBYTES);
        sodium.crypto_sign_ed25519_pk_to_curve25519(senderCurvePK, senderPublicKey);
        myCurveSK = Buffer.alloc(sodium.crypto_box_SECRETKEYBYTES);
        sodium.crypto_sign_ed25519_sk_to_curve25519(myCurveSK, secretKey);
    }

    const decrypted = Buffer.alloc(ciphertext.length - sodium.crypto_box_MACBYTES);
    const success = sodium.crypto_box_open_easy(decrypted, ciphertext, nonce, senderCurvePK, myCurveSK);
    if (success) {
        if (!useEphemeral) { sodium.sodium_memzero(myCurveSK); sodium.sodium_memzero(senderCurvePK); }
        return decrypted;
    }

    // Grace-window fallback: try each previous ephemeral secret key in order
    // (most-recent first). Covers peers that missed one or more rotation PINGs
    // due to transient network loss or offline-simulation periods.
    if (useEphemeral && previousEphemeralSecretKeys.length > 0) {
        for (let i = 0; i < previousEphemeralSecretKeys.length; i++) {
            const prevSK = previousEphemeralSecretKeys[i];
            const decryptedPrev = Buffer.alloc(ciphertext.length - sodium.crypto_box_MACBYTES);
            const successPrev = sodium.crypto_box_open_easy(decryptedPrev, ciphertext, nonce, senderCurvePK, prevSK);
            if (successPrev) {
                debug(`Decrypted with previous ephemeral key [${i}] (rotation lag fallback)`, {}, 'identity');
                return decryptedPrev;
            }
        }
    }

    // BUG M fix: expandir la línea combinada memzero+return para que los
    // minificadores / formateadores no puedan asociar incorrectamente el
    // `return null` con el bloque `if`.
    if (!useEphemeral) {
        sodium.sodium_memzero(myCurveSK);
        sodium.sodium_memzero(senderCurvePK);
    }
    return null;
}

// ── Signed PreKey (SPK) ───────────────────────────────────────────────────────

function _rotateSignedPreKey(): void {
    // Guardar el SPK actual en el ring buffer antes de rotarlo
    if (spkPublicKey && spkSecretKey) {
        previousSpkEntries.unshift({ spkId, spkPk: spkPublicKey, spkSk: spkSecretKey });
        if (previousSpkEntries.length > MAX_PREVIOUS_SPK) {
            // Limpiar la entrada más antigua de memoria segura
            const old = previousSpkEntries.pop()!;
            sodium.sodium_memzero(old.spkSk);
        }
    }

    spkPublicKey = Buffer.alloc(sodium.crypto_box_PUBLICKEYBYTES);
    spkSecretKey = Buffer.alloc(sodium.crypto_box_SECRETKEYBYTES);
    sodium.crypto_box_keypair(spkPublicKey, spkSecretKey);
    spkId = Math.floor(Date.now() / 1000); // ID basado en timestamp

    info('Signed PreKey rotado', { spkId }, 'identity');
}

/** Obtener el bundle SPK para incluir en HANDSHAKE */
export function getMySignedPreKeyBundle(): { spkPub: string; spkSig: string; spkId: number } {
    // Firmar el SPK con nuestra clave Ed25519 de identidad
    const sig = Buffer.allocUnsafe(sodium.crypto_sign_BYTES);
    sodium.crypto_sign_detached(sig, spkPublicKey, secretKey);
    return {
        spkPub: spkPublicKey.toString('hex'),
        spkSig: sig.toString('hex'),
        spkId,
    };
}

/** Obtener la clave secreta del SPK actual (para X3DH como respondedor) */
export function getMySignedPreKeySk(): Buffer {
    return spkSecretKey;
}

/** Obtener la clave pública del SPK actual */
export function getMySignedPreKeyPk(): Buffer {
    return spkPublicKey;
}

/**
 * Buscar un SPK (actual o previo) por su ID numérico.
 * Necesario para X3DH responder cuando el peer usó un SPK que ya fue rotado.
 * Cubre hasta MAX_PREVIOUS_SPK rotaciones anteriores (≈2–3 semanas).
 */
export function getSpkBySpkId(id: number): { spkPk: Buffer; spkSk: Buffer } | null {
    if (id === spkId) return { spkPk: spkPublicKey, spkSk: spkSecretKey };
    const prev = previousSpkEntries.find(e => e.spkId === id);
    return prev ? { spkPk: prev.spkPk, spkSk: prev.spkSk } : null;
}

/**
 * Obtener la clave secreta de identidad Ed25519.
 * Necesaria para X3DH: x3dhInitiator (Alice) y x3dhResponder (Bob).
 * NUNCA enviar este buffer fuera del proceso main; usarlo solo en módulos de seguridad.
 */
export function getMyIdentitySkBuffer(): Buffer {
    return secretKey;
}

/**
 * Obtener la clave pública de identidad Ed25519.
 * Se incluye en x3dhInit para que el respondedor pueda calcular el mismo shared secret.
 */
export function getMyIdentityPkBuffer(): Buffer {
    return publicKey;
}

/**
 * Sealed Sender: descifrar un paquete SEALED que fue cifrado con nuestra
 * clave pública Ed25519 (convertida a X25519).
 * Se ejecuta en identity.ts para que la clave secreta nunca salga del módulo.
 */
export function decryptSealed(senderEphPub: Buffer, nonce: Buffer, ciphertext: Buffer): Buffer | null {
    const myCurveSk = Buffer.alloc(sodium.crypto_box_SECRETKEYBYTES);
    sodium.crypto_sign_ed25519_sk_to_curve25519(myCurveSk, secretKey);

    const plaintext = Buffer.alloc(ciphertext.length - sodium.crypto_box_MACBYTES);
    const ok = sodium.crypto_box_open_easy(plaintext, ciphertext, nonce, senderEphPub, myCurveSk);
    sodium.sodium_memzero(myCurveSk);
    return ok ? plaintext : null;
}