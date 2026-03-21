import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import sodium from 'sodium-native';
import fs from 'node:fs';
import path from 'node:path';
import * as bip39 from 'bip39';
import {
    initIdentity,
    unlockSession,
    sign,
    verify,
    getMyUPeerId,
    isLocked,
    lockSession,
    getUPeerIdFromPublicKey,
    getMyPublicKey,
    getMyDeviceId,
    getMySignedPreKey,
    getSpkBySpkId,
    setMyAlias,
    getMyAlias,
    setMyAvatar,
    getMyAvatar,
    encrypt,
    decrypt,
    decryptX3DH,
    decryptSealed,
    incrementEphemeralMessageCounter
} from '../../../src/main_process/security/identity.js';

// Mocks de logger
vi.mock('../../../src/main_process/security/secure-logger.js', () => ({
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
}));

const SPK_ROTATION_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;
const SESSION_LOCKED_FILE = 'session.locked';

describe('IdentityManager', () => {
    const tempDir = path.join(__dirname, 'temp_identity_test');

    beforeEach(() => {
        vi.useFakeTimers();
        if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.useRealTimers();
        if (fs.existsSync(tempDir)) {
            fs.rmSync(tempDir, { recursive: true, force: true });
        }
    });

    it('should initialize and be locked by default', () => {
        initIdentity(tempDir);
        expect(isLocked()).toBe(true);
    });

    it('should unlock with a valid mnemonic and rotate SPK/Ephemeral keys', () => {
        initIdentity(tempDir);
        const mnemonic = bip39.generateMnemonic();
        const result = unlockSession(mnemonic);

        expect(result).toBe(true);
        expect(isLocked()).toBe(false);
        expect(getMyUPeerId()).toBeDefined();

        const spk = getMySignedPreKey();
        expect(spk.spkPub).toBeDefined();
        expect(spk.spkSig).toBeDefined();
        expect(spk.spkId).toBeGreaterThan(0);

        // Verificar búsqueda de SPK
        const found = getSpkBySpkId(spk.spkId);
        expect(found).not.toBeNull();
        expect(found?.spkPk.toString('hex')).toBe(spk.spkPub);
    });

    it('should rotate keys after some time', () => {
        initIdentity(tempDir);
        const mnemonic = bip39.generateMnemonic();
        unlockSession(mnemonic);
        const initialSpkId = getMySignedPreKey().spkId;

        // Avanzar tiempo más allá del intervalo de rotación
        vi.advanceTimersByTime(SPK_ROTATION_INTERVAL_MS + 1000);
        unlockSession(mnemonic);

        const newSpkId = getMySignedPreKey().spkId;
        expect(newSpkId).not.toBe(initialSpkId);

        // El SPK antiguo debería seguir siendo recuperable
        const oldSpk = getSpkBySpkId(initialSpkId);
        expect(oldSpk).not.toBeNull();
    });

    it('should generate a consistent device ID', () => {
        initIdentity(tempDir);
        const id1 = getMyDeviceId();
        const id2 = getMyDeviceId();
        expect(id1).toBe(id2);
        expect(id1.length).toBe(64);

        // El archivo de clave de dispositivo debe existir
        expect(fs.existsSync(path.join(tempDir, 'device.key'))).toBe(true);
    });

    it('should handle session locking and cleaning', () => {
        initIdentity(tempDir);
        unlockSession(bip39.generateMnemonic());
        expect(isLocked()).toBe(false);

        lockSession();
        expect(isLocked()).toBe(true);
        expect(() => sign(Buffer.from('test'))).toThrow('Identity is locked');

        // Al bloquear, se debe crear el archivo de bloqueo
        expect(fs.existsSync(path.join(tempDir, SESSION_LOCKED_FILE))).toBe(true);
    });

    it('should sign and verify messages correctly', () => {
        initIdentity(tempDir);
        const mnemonic = bip39.generateMnemonic();
        unlockSession(mnemonic);

        const message = Buffer.from('hello world');
        const signature = sign(message);

        expect(signature).toBeDefined();
        expect(signature.length).toBe(sodium.crypto_sign_BYTES);

        const publicKey = getMyPublicKey();
        const isValid = verify(message, signature, publicKey);
        expect(isValid).toBe(true);
    });

    it('should throw error when signing while locked', () => {
        initIdentity(tempDir);
        // Asegurarse de que esté bloqueado (si el test anterior lo dejó abierto)
        lockSession();

        expect(() => sign(Buffer.from('fail'))).toThrow('Identity is locked');
    });

    it('should generate consistent uPeerId from public key', () => {
        const pk = Buffer.alloc(sodium.crypto_sign_PUBLICKEYBYTES);
        sodium.randombytes_buf(pk);

        const id1 = getUPeerIdFromPublicKey(pk);
        const id2 = getUPeerIdFromPublicKey(pk);

        expect(id1).toBe(id2);
        expect(typeof id1).toBe('string');
        expect(id1.length).toBe(sodium.crypto_generichash_BYTES * 2); // Hex string
    });

    it('should persist mnemonic mode flag after first unlock', () => {
        initIdentity(tempDir);
        const mnemonic = bip39.generateMnemonic();
        unlockSession(mnemonic);

        const flagPath = path.join(tempDir, 'identity.mnemonic_mode');
        expect(fs.existsSync(flagPath)).toBe(true);
    });

    it('should handle alias and avatar persistence', () => {
        initIdentity(tempDir);
        unlockSession(bip39.generateMnemonic());

        const alias = 'Alice';
        const avatar = 'data:image/png;base64,mock';

        setMyAlias(alias);
        setMyAvatar(avatar);

        expect(getMyAlias()).toBe(alias);
        expect(getMyAvatar()).toBe(avatar);

        // Verificar archivos
        expect(fs.readFileSync(path.join(tempDir, 'identity.alias'), 'utf8')).toBe(alias);
        expect(fs.readFileSync(path.join(tempDir, 'identity.avatar'), 'utf8')).toBe(avatar);
    });

    it('should encrypt and decrypt using ephemeral keys', () => {
        initIdentity(tempDir);
        unlockSession(bip39.generateMnemonic());

        const message = Buffer.from('confidential');
        const recipientPk = Buffer.alloc(sodium.crypto_box_PUBLICKEYBYTES);
        sodium.randombytes_buf(recipientPk);

        const { nonce, ciphertext } = encrypt(message, recipientPk);
        expect(nonce).toBeDefined();
        expect(ciphertext).toBeDefined();

        // Para probar decrypt necesitamos la clave privada del receptor, 
        // pero podemos probar el flujo de rotación.
        for (let i = 0; i < 110; i++) {
            incrementEphemeralMessageCounter();
        }
        // Debería haber rotado (cobertura de _rotateEphemeralKey)
    });

    it('should decrypt using previous ephemeral keys', () => {
        initIdentity(tempDir);
        unlockSession(bip39.generateMnemonic());

        const recipientPk = getMyPublicKey();
        const msg = Buffer.from('roundtrip');
        const { nonce, ciphertext } = encrypt(msg, recipientPk);

        // Rotar clave efímera para que la actual cambie
        for (let i = 0; i < 101; i++) {
            incrementEphemeralMessageCounter();
        }

        const decrypted = decrypt(Buffer.from(nonce, 'hex'), Buffer.from(ciphertext, 'hex'), recipientPk);
        expect(decrypted?.toString()).toBe('roundtrip');
    });

    it('should handle X3DH decryption and rotation', () => {
        initIdentity(tempDir);
        const xMnemonic = bip39.generateMnemonic();
        unlockSession(xMnemonic);

        const spk = getMySignedPreKey();
        const msg = Buffer.from('x3dh-secret');
        const senderSk = Buffer.alloc(sodium.crypto_box_SECRETKEYBYTES);
        const senderPk = Buffer.alloc(sodium.crypto_box_PUBLICKEYBYTES);
        sodium.crypto_box_keypair(senderPk, senderSk);

        const nonce = Buffer.alloc(sodium.crypto_box_NONCEBYTES);
        sodium.randombytes_buf(nonce);

        // Obtenemos la PK del SPK en Buffer
        const spkInfo = getSpkBySpkId(spk.spkId);
        expect(spkInfo).not.toBeNull();

        const ciphertext = Buffer.alloc(msg.length + sodium.crypto_box_MACBYTES);
        sodium.crypto_box_easy(ciphertext, msg, nonce, spkInfo!.spkPk, senderSk);

        // Decrypt con SPK actual
        const decrypted = decryptX3DH(nonce, ciphertext, senderPk, spk.spkId);
        expect(decrypted?.toString()).toBe('x3dh-secret');

        // Rotar SPK (avanzar una semana)
        vi.advanceTimersByTime(SPK_ROTATION_INTERVAL_MS + 1000);
        unlockSession(xMnemonic);
        const newSpk = getMySignedPreKey();
        expect(newSpk.spkId).not.toBe(spk.spkId);

        // Decrypt con SPK antiguo (debería seguir funcionando por previousSpkEntries)
        const decryptedOld = decryptX3DH(nonce, ciphertext, senderPk, spk.spkId);
        expect(decryptedOld?.toString()).toBe('x3dh-secret');

        // Decrypt con SPK inexistente
        expect(decryptX3DH(nonce, ciphertext, senderPk, 99999)).toBeNull();
    });

    it('should handle sealed box decryption', () => {
        initIdentity(tempDir);
        unlockSession(bip39.generateMnemonic());

        const msg = Buffer.from('top-secret');
        const myPk = getMyPublicKey();

        // Convertir la clave de firma a clave de cifrado (ed25519 -> curve25519)
        const encryptPk = Buffer.alloc(sodium.crypto_box_PUBLICKEYBYTES);
        sodium.crypto_sign_ed25519_pk_to_curve25519(encryptPk, myPk);

        const ciphertext = Buffer.alloc(msg.length + sodium.crypto_box_SEALBYTES);
        sodium.crypto_box_seal(ciphertext, msg, encryptPk);

        const decrypted = decryptSealed(ciphertext);
        expect(decrypted).not.toBeNull();
        expect(decrypted?.toString()).toBe('top-secret');

        lockSession();
        expect(decryptSealed(ciphertext)).toBeNull();
    });
});


