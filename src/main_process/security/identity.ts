import sodium from 'sodium-native';
import { info, error, debug } from './secure-logger.js';
import fs from 'node:fs';
import path from 'node:path';
import * as bip39 from 'bip39';

let publicKey: Buffer;
let secretKey: Buffer;
let upeerId: string;
let ephemeralPublicKey: Buffer;
let ephemeralSecretKey: Buffer;
let spkPublicKey: Buffer;
let spkSecretKey: Buffer;
let spkId = 0;
const SPK_ROTATION_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;
let spkRotationInterval: NodeJS.Timeout | null = null;
const MAX_PREVIOUS_SPK = 2;
const previousSpkEntries: Array<{ spkId: number; spkPk: Buffer; spkSk: Buffer }> = [];
const MAX_PREVIOUS_EPH_KEYS = 6;
const previousEphemeralSecretKeys: Buffer[] = [];
let ephemeralKeyRotationInterval: NodeJS.Timeout | null = null;
let ephemeralKeyRotationCounter = 0;
const EPHEMERAL_KEY_ROTATION_INTERVAL_MS = 5 * 60 * 1000;
const EPHEMERAL_KEY_MAX_MESSAGES = 100;
let dhtSeq = 0;
let dhtStatePath: string;
let myAlias = '';
let myAvatar = '';
let _userDataPath = '';
let _isLocked = true;
let _isMnemonicBased = false;
let _mnemonic: string | null = null;

const MNEMONIC_MODE_FLAG = 'identity.mnemonic_mode';
const DEVICE_KEY_FILE = 'device.key';
const SESSION_ENC_FILE = 'identity.enc';
const SESSION_LOCKED_FILE = 'session.locked';
const ALIAS_FILE = 'identity.alias';
const AVATAR_FILE = 'identity.avatar';

function _getOrCreateDeviceKey(userDataPath: string): Buffer {
    const p = path.join(userDataPath, DEVICE_KEY_FILE);
    if (fs.existsSync(p)) {
        const k = fs.readFileSync(p);
        if (k.length === sodium.crypto_secretbox_KEYBYTES) return k;
    }
    const k = Buffer.alloc(sodium.crypto_secretbox_KEYBYTES);
    sodium.randombytes_buf(k);
    fs.writeFileSync(p, k, { mode: 0o600 });
    return k;
}

function _saveEncryptedSession(userDataPath: string): void {
    try {
        const devKey = _getOrCreateDeviceKey(userDataPath);
        const nonce = Buffer.alloc(sodium.crypto_secretbox_NONCEBYTES);
        sodium.randombytes_buf(nonce);
        const cipher = Buffer.alloc(secretKey.length + sodium.crypto_secretbox_MACBYTES);
        sodium.crypto_secretbox_easy(cipher, secretKey, nonce, devKey);
        fs.writeFileSync(path.join(userDataPath, SESSION_ENC_FILE), Buffer.concat([nonce, cipher]), { mode: 0o600 });

        if (_mnemonic) {
            const mNonce = Buffer.alloc(sodium.crypto_secretbox_NONCEBYTES);
            sodium.randombytes_buf(mNonce);
            const mBuf = Buffer.from(_mnemonic, 'utf8');
            const mCipher = Buffer.alloc(mBuf.length + sodium.crypto_secretbox_MACBYTES);
            sodium.crypto_secretbox_easy(mCipher, mBuf, mNonce, devKey);
            fs.writeFileSync(path.join(userDataPath, 'identity.mnemonic.enc'), Buffer.concat([mNonce, mCipher]), { mode: 0o600 });
        }

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
        publicKey = Buffer.alloc(sodium.crypto_sign_PUBLICKEYBYTES);
        sodium.crypto_sign_ed25519_sk_to_pk(publicKey, secretKey);
        upeerId = getUPeerIdFromPublicKey(publicKey);

        // Recuperar el mnemonic si está disponible en la sesión
        const mnemonicPath = path.join(userDataPath, 'identity.mnemonic.enc');
        if (fs.existsSync(mnemonicPath)) {
            try {
                const mBlob = fs.readFileSync(mnemonicPath);
                const mNonce = mBlob.subarray(0, sodium.crypto_secretbox_NONCEBYTES);
                const mCipher = mBlob.subarray(sodium.crypto_secretbox_NONCEBYTES);
                const mPlain = Buffer.alloc(mCipher.length - sodium.crypto_secretbox_MACBYTES);
                const mOk = sodium.crypto_secretbox_open_easy(mPlain, mCipher, mNonce, devKey);
                if (mOk) {
                    _mnemonic = mPlain.toString('utf8');
                }
            } catch (e) {
                error('No se pudo cargar el mnemonic cifrado', e, 'identity');
            }
        }

        _isLocked = false;
        _isMnemonicBased = true;
        return true;
    } catch (e) {
        error('No se pudo cargar la sesión cifrada', e, 'identity');
        return false;
    }
}

export function initIdentity(userDataPath: string) {
    _userDataPath = userDataPath;
    const flagPath = path.join(userDataPath, MNEMONIC_MODE_FLAG);
    const legacyKeyPath = path.join(userDataPath, 'identity.key');

    if (!fs.existsSync(flagPath) && fs.existsSync(legacyKeyPath)) {
        try {
            fs.renameSync(legacyKeyPath, legacyKeyPath + '.legacy-bak');
        } catch (err) {
            error('Error al renombrar clave heredada', err, 'identity');
        }
        info('Instalación heredada detectada. Clave aleatoria respaldada. Se requiere frase semilla.', {}, 'identity');
    }

    dhtStatePath = path.join(userDataPath, 'dht_state.json');
    _isMnemonicBased = fs.existsSync(flagPath);
    _loadDhtSeq();
    const aliasPath = path.join(userDataPath, ALIAS_FILE);
    if (fs.existsSync(aliasPath)) {
        { myAlias = fs.readFileSync(aliasPath, 'utf8').trim(); }
    }
    const avatarPath = path.join(userDataPath, AVATAR_FILE);
    if (fs.existsSync(avatarPath)) {
        { myAvatar = fs.readFileSync(avatarPath, 'utf8').trim(); }
    }
    if (!_isMnemonicBased) {
        _isLocked = true;
        info('Primera ejecución. Se requiere crear o importar una frase semilla.', {}, 'identity');
        return;
    }

    const userExplicitlyLocked = fs.existsSync(path.join(userDataPath, SESSION_LOCKED_FILE));
    if (userExplicitlyLocked) {
        _isLocked = true;
        info('Sesión bloqueada por el usuario.', {}, 'identity');
        return;
    }

    if (_tryLoadEncryptedSession(userDataPath)) {
        upeerId = getUPeerIdFromPublicKey(publicKey);
        _isLocked = false;
        info('Sesión restaurada desde disco.', { upeerId }, 'identity');
        _rotateEphemeralKey();
        _rotateSpk();
        spkRotationInterval = setInterval(() => _rotateSpk(), SPK_ROTATION_INTERVAL_MS);
        ephemeralKeyRotationInterval = setInterval(() => _rotateEphemeralKey(), EPHEMERAL_KEY_ROTATION_INTERVAL_MS);
    } else {
        _isLocked = true;
        info('No hay sesión activa o clave de dispositivo inválida.', {}, 'identity');
    }
}

function _loadDhtSeq() {
    if (fs.existsSync(dhtStatePath)) {
        try {
            const data = JSON.parse(fs.readFileSync(dhtStatePath, 'utf8'));
            if (typeof data.seq === 'number') dhtSeq = data.seq;
        } catch (err) {
            error('Error al cargar dht_state.json', err, 'identity');
        }
    }
}

function _saveDhtSeq() {
    try {
        fs.writeFileSync(dhtStatePath, JSON.stringify({ seq: dhtSeq }));
    } catch (err) {
        error('Error al guardar dht_state.json', err, 'identity');
    }
}

export function getDhtSeq(): number {
    return dhtSeq;
}

export function incrementDhtSeq(): number {
    dhtSeq++;
    _saveDhtSeq();
    return dhtSeq;
}

function _rotateSpk() {
    if (spkPublicKey) {
        previousSpkEntries.unshift({ spkId, spkPk: spkPublicKey, spkSk: spkSecretKey });
        if (previousSpkEntries.length > MAX_PREVIOUS_SPK) previousSpkEntries.pop();
    }
    const pk = Buffer.alloc(sodium.crypto_box_PUBLICKEYBYTES);
    const sk = Buffer.alloc(sodium.crypto_box_SECRETKEYBYTES);
    sodium.crypto_box_keypair(pk, sk);
    spkPublicKey = pk;
    spkSecretKey = sk;
    spkId = Date.now();
    debug('Signed PreKey rotada', { spkId }, 'identity');
}

function _rotateEphemeralKey() {
    if (ephemeralPublicKey) {
        previousEphemeralSecretKeys.unshift(ephemeralSecretKey);
        if (previousEphemeralSecretKeys.length > MAX_PREVIOUS_EPH_KEYS) previousEphemeralSecretKeys.pop();
    }
    const pk = Buffer.alloc(sodium.crypto_box_PUBLICKEYBYTES);
    const sk = Buffer.alloc(sodium.crypto_box_SECRETKEYBYTES);
    sodium.crypto_box_keypair(pk, sk);
    ephemeralPublicKey = pk;
    ephemeralSecretKey = sk;
    ephemeralKeyRotationCounter = 0;
    debug('Clave efímera rotada', {}, 'identity');
}

export function unlockSession(mnemonic: string): boolean {
    info('unlockSession called', { mnemonicValid: bip39.validateMnemonic(mnemonic) }, 'identity');
    if (!bip39.validateMnemonic(mnemonic)) return false;
    _mnemonic = mnemonic;
    info('Mnemonic assigned in memory', { length: mnemonic.length }, 'identity');
    const seed = bip39.mnemonicToSeedSync(mnemonic);
    const entropy = seed.subarray(0, 32);
    publicKey = Buffer.alloc(sodium.crypto_sign_PUBLICKEYBYTES);
    secretKey = Buffer.alloc(sodium.crypto_sign_SECRETKEYBYTES);
    sodium.crypto_sign_seed_keypair(publicKey, secretKey, entropy);
    upeerId = getUPeerIdFromPublicKey(publicKey);
    _isLocked = false;
    _isMnemonicBased = true;
    fs.writeFileSync(path.join(_userDataPath, MNEMONIC_MODE_FLAG), '1');
    _saveEncryptedSession(_userDataPath);
    _rotateEphemeralKey();
    _rotateSpk();
    if (spkRotationInterval) clearInterval(spkRotationInterval);
    if (ephemeralKeyRotationInterval) clearInterval(ephemeralKeyRotationInterval);
    spkRotationInterval = setInterval(() => _rotateSpk(), SPK_ROTATION_INTERVAL_MS);
    ephemeralKeyRotationInterval = setInterval(() => _rotateEphemeralKey(), EPHEMERAL_KEY_ROTATION_INTERVAL_MS);
    info('Sesión desbloqueada con frase semilla.', { upeerId }, 'identity');
    return true;
}

export function lockSession(): void {
    const encPath = path.join(_userDataPath, SESSION_ENC_FILE);
    if (fs.existsSync(encPath)) {
        try {
            fs.unlinkSync(encPath);
        } catch (err) {
            error('Error al eliminar sesión cifrada al bloquear', err, 'identity');
        }
    }
    fs.writeFileSync(path.join(_userDataPath, SESSION_LOCKED_FILE), '1');
    if (secretKey) sodium.sodium_memzero(secretKey);
    _mnemonic = null;
    if (ephemeralSecretKey) sodium.sodium_memzero(ephemeralSecretKey);
    if (spkSecretKey) sodium.sodium_memzero(spkSecretKey);
    previousSpkEntries.forEach(entry => sodium.sodium_memzero(entry.spkSk));
    previousEphemeralSecretKeys.forEach(sk => sodium.sodium_memzero(sk));
    _isLocked = true;
    if (spkRotationInterval) clearInterval(spkRotationInterval);
    if (ephemeralKeyRotationInterval) clearInterval(ephemeralKeyRotationInterval);
    info('Sesión bloqueada explícitamente.', {}, 'identity');
}

export function isLocked(): boolean { return _isLocked; }
export function isMnemonicBased(): boolean { return _isMnemonicBased; }
export function getMyUPeerId(): string { return upeerId || ''; }

export function getMyDeviceId(): string {
    if (!_userDataPath) return 'unknown';
    const devKey = _getOrCreateDeviceKey(_userDataPath);
    const hash = Buffer.alloc(32);
    sodium.crypto_generichash(hash, devKey);
    return hash.toString('hex');
}

export function getMyPublicKey(): Buffer { return publicKey; }
export function getMyIdentitySkBuffer(): Buffer {
    if (_isLocked || !secretKey) throw new Error('Identity is locked');
    return secretKey;
}
export function getMyEphemeralPublicKey(): Buffer { return ephemeralPublicKey; }

export function getSpkBySpkId(id: number): { spkPk: Buffer; spkSk: Buffer } | null {
    if (spkId === id) return { spkPk: spkPublicKey, spkSk: spkSecretKey };
    const entry = previousSpkEntries.find(e => e.spkId === id);
    return entry ? { spkPk: entry.spkPk, spkSk: entry.spkSk } : null;
}

export function getMySignedPreKey(): { spkPub: string, spkSig: string, spkId: number } {
    const sig = Buffer.alloc(sodium.crypto_sign_BYTES);
    sodium.crypto_sign_detached(sig, spkPublicKey, secretKey);
    return {
        spkPub: spkPublicKey.toString('hex'),
        spkSig: sig.toString('hex'),
        spkId
    };
}

export function getUPeerIdFromPublicKey(pk: Buffer): string {
    const hash = Buffer.alloc(sodium.crypto_generichash_BYTES);
    sodium.crypto_generichash(hash, pk);
    return hash.toString('hex');
}

export function sign(message: Buffer): Buffer {
    if (_isLocked) throw new Error('Identity is locked');
    const sig = Buffer.alloc(sodium.crypto_sign_BYTES);
    sodium.crypto_sign_detached(sig, message, secretKey);
    return sig;
}

export function verify(message: Buffer, signature: Buffer, pk: Buffer): boolean {
    return sodium.crypto_sign_verify_detached(signature, message, pk);
}

export function encrypt(message: Buffer, recipientPublicKey: Buffer): { nonce: string, ciphertext: string } {
    const nonce = Buffer.alloc(sodium.crypto_box_NONCEBYTES);
    sodium.randombytes_buf(nonce);
    const ciphertext = Buffer.alloc(message.length + sodium.crypto_box_MACBYTES);
    sodium.crypto_box_easy(ciphertext, message, nonce, recipientPublicKey, ephemeralSecretKey);
    ephemeralKeyRotationCounter++;
    if (ephemeralKeyRotationCounter >= EPHEMERAL_KEY_MAX_MESSAGES) _rotateEphemeralKey();
    return {
        nonce: nonce.toString('hex'),
        ciphertext: ciphertext.toString('hex')
    };
}

export function decrypt(nonce: Buffer, ciphertext: Buffer, senderEphemeralPublicKey: Buffer): Buffer | null {
    const plaintext = Buffer.alloc(ciphertext.length - sodium.crypto_box_MACBYTES);
    let ok = sodium.crypto_box_open_easy(plaintext, ciphertext, nonce, senderEphemeralPublicKey, ephemeralSecretKey);
    if (ok) return plaintext;
    for (const oldSk of previousEphemeralSecretKeys) {
        ok = sodium.crypto_box_open_easy(plaintext, ciphertext, nonce, senderEphemeralPublicKey, oldSk);
        if (ok) return plaintext;
    }
    return null;
}

export function decryptX3DH(nonce: Buffer, ciphertext: Buffer, senderEphemeralPublicKey: Buffer, recipientSpkId: number): Buffer | null {
    let targetSk: Buffer | null = null;
    if (recipientSpkId === spkId) {
        targetSk = spkSecretKey;
    } else {
        const entry = previousSpkEntries.find(e => e.spkId === recipientSpkId);
        if (entry) targetSk = entry.spkSk;
    }
    if (!targetSk) return null;
    const plaintext = Buffer.alloc(ciphertext.length - sodium.crypto_box_MACBYTES);
    const ok = sodium.crypto_box_open_easy(plaintext, ciphertext, nonce, senderEphemeralPublicKey, targetSk);
    return ok ? plaintext : null;
}

export function decryptSealed(ciphertext: Buffer): Buffer | null {
    if (_isLocked || !secretKey) return null;
    const boxPk = Buffer.alloc(sodium.crypto_box_PUBLICKEYBYTES);
    const boxSk = Buffer.alloc(sodium.crypto_box_SECRETKEYBYTES);
    sodium.crypto_sign_ed25519_sk_to_curve25519(boxSk, secretKey);
    sodium.crypto_sign_ed25519_pk_to_curve25519(boxPk, publicKey);

    const plaintext = Buffer.alloc(ciphertext.length - sodium.crypto_box_SEALBYTES);
    const ok = sodium.crypto_box_seal_open(plaintext, ciphertext, boxPk, boxSk);
    return ok ? plaintext : null;
}

export function setAlias(alias: string): void {
    myAlias = alias.trim();
    fs.writeFileSync(path.join(_userDataPath, ALIAS_FILE), myAlias);
}

export function getAlias(): string { return myAlias; }

export function setAvatar(avatarBase64: string): void {
    myAvatar = avatarBase64;
    fs.writeFileSync(path.join(_userDataPath, AVATAR_FILE), myAvatar);
}

export function getAvatar(): string { return myAvatar; }

export function getMyPublicKeyHex(): string {
    return publicKey ? publicKey.toString('hex') : '';
}

export function getMyEphemeralPublicKeyHex(): string {
    return ephemeralPublicKey ? ephemeralPublicKey.toString('hex') : '';
}

export function getMyDhtSeq(): number {
    return dhtSeq;
}

export function incrementMyDhtSeq(): number {
    return incrementDhtSeq();
}

export function generateMnemonic(): string {
    return bip39.generateMnemonic();
}

export function unlockWithMnemonic(mnemonic: string): boolean {
    return unlockSession(mnemonic);
}

export function createMnemonicIdentity(): string {
    const mnemonic = bip39.generateMnemonic();
    unlockSession(mnemonic);
    return mnemonic;
}

export function isSessionLocked(): boolean {
    return isLocked();
}

export function isMnemonicMode(): boolean {
    return isMnemonicBased();
}

export function getMnemonic(): string | null {
    return _mnemonic;
}

export function getMyAlias(): string {
    return getAlias();
}

export function setMyAlias(alias: string): void {
    setAlias(alias);
}

export function getMyAvatar(): string {
    return getAvatar();
}

export function setMyAvatar(avatar: string): void {
    setAvatar(avatar);
}

export function incrementEphemeralMessageCounter(): void {
    ephemeralKeyRotationCounter++;
    if (ephemeralKeyRotationCounter >= EPHEMERAL_KEY_MAX_MESSAGES) _rotateEphemeralKey();
}

export function getMySignedPreKeyBundle(): { spkPub: string, spkSig: string, spkId: number } {
    return getMySignedPreKey();
}
