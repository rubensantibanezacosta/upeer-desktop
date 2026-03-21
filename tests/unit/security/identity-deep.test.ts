import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import sodium from 'sodium-native';
import fs from 'node:fs';
import path from 'node:path';
import * as bip39 from 'bip39';
import * as identity from '../../../src/main_process/security/identity.js';

describe('Identity Deep Coverage & Bug Hunting', () => {
    const tempDir = path.join(process.cwd(), 'temp-identity-test');
    const mnemonic = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

    beforeEach(() => {
        if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);
        identity.initIdentity(tempDir);
    });

    afterEach(() => {
        if (fs.existsSync(tempDir)) {
            fs.rmSync(tempDir, { recursive: true, force: true });
        }
        vi.restoreAllMocks();
    });

    it('should correctly rotate Ephemeral Keys and search previous keys during decryption', () => {
        identity.unlockSession(mnemonic);
        const originalPk = identity.getMyEphemeralPublicKey();
        const msg = Buffer.from('hello');

        // Encrypt with current key
        const encrypted = identity.encrypt(msg, originalPk);

        // Rotate many times to populate previousEphemeralSecretKeys
        for (let i = 0; i < 3; i++) {
            identity.incrementEphemeralMessageCounter(); // This will reach 100 in loop? No, the counter is internal.
            // Force rotation by calling it 100 times or just mocking the interval/counter
            for (let j = 0; j < 101; j++) identity.incrementEphemeralMessageCounter();
        }

        const newPk = identity.getMyEphemeralPublicKey();
        expect(newPk.toString('hex')).not.toBe(originalPk.toString('hex'));

        // Decrypt with an OLD key (should work because it's in previousEphemeralSecretKeys)
        const decrypted = identity.decrypt(
            Buffer.from(encrypted.nonce, 'hex'),
            Buffer.from(encrypted.ciphertext, 'hex'),
            originalPk // Sender is "me" using the old pk
        );

        expect(decrypted?.toString()).toBe('hello');
    });

    it('should correctly rotate SPK and handle multiple previous SPKs', () => {
        identity.unlockSession(mnemonic);
        const spk1 = identity.getMySignedPreKeyBundle();

        // Wait or force rotation (not exported but we can wait or mock if needed, 
        // but wait, we want to test the logic of decryptX3DH with old SPKs)

        // Since we can't easily trigger _rotateSpk from outside without waiting 7 days,
        // and it's not exported, we identify that decryptX3DH uses previousSpkEntries.
        // Let's test decryptX3DH logic.

        const msg = Buffer.from('x3dh-secret');
        const ephemeralPk = Buffer.alloc(sodium.crypto_box_PUBLICKEYBYTES);
        const ephemeralSk = Buffer.alloc(sodium.crypto_box_SECRETKEYBYTES);
        sodium.crypto_box_keypair(ephemeralPk, ephemeralSk);

        const nonce = Buffer.alloc(sodium.crypto_box_NONCEBYTES);
        sodium.randombytes_buf(nonce);

        // Encrypt to SPK1
        const spk1Pk = Buffer.from(spk1.spkPub, 'hex');
        const ciphertext = Buffer.alloc(msg.length + sodium.crypto_box_MACBYTES);
        sodium.crypto_box_easy(ciphertext, msg, nonce, spk1Pk, ephemeralSk);

        // Now unlock again or find a way to rotate? 
        // Re-unlocking calls _rotateSpk — need to advance time first
        vi.useFakeTimers();
        vi.advanceTimersByTime(7 * 24 * 60 * 60 * 1000 + 1000);
        identity.unlockSession(mnemonic);
        vi.useRealTimers();
        const spk2 = identity.getMySignedPreKeyBundle();
        expect(spk2.spkId).not.toBe(spk1.spkId);

        // Decrypt using OLD SPK ID
        const decrypted = identity.decryptX3DH(nonce, ciphertext, ephemeralPk, spk1.spkId);
        expect(decrypted?.toString()).toBe('x3dh-secret');
    });

    it('should handle session restoration with device key correctly', () => {
        identity.unlockSession(mnemonic);
        const originalUPeerId = identity.getMyUPeerId();

        // Simulate app restart
        identity.initIdentity(tempDir);

        // Re-init should load the encrypted session automatically if not locked
        expect(identity.isSessionLocked()).toBe(false);
        expect(identity.getMyUPeerId()).toBe(originalUPeerId);
    });

    it('should fail decryption if session is locked', () => {
        identity.unlockSession(mnemonic);
        identity.lockSession();

        expect(() => identity.sign(Buffer.from('test'))).toThrow('Identity is locked');
        expect(identity.decryptSealed(Buffer.alloc(32), Buffer.alloc(24), Buffer.alloc(100))).toBeNull();
    });

    it('should correctly convert Ed25519 to Curve25519 in decryptSealed', () => {
        identity.unlockSession(mnemonic);
        const myPk = identity.getMyPublicKey();

        // Encrypt using sealed box (anonymous sender)
        const msg = Buffer.from('sealed-secret');

        // To use sealed box with Ed25519 identity, sender MUST convert my Ed25519 PK to Curve25519
        const curvePk = Buffer.alloc(32);
        sodium.crypto_sign_ed25519_pk_to_curve25519(curvePk, myPk);

        const ciphertext = Buffer.alloc(msg.length + sodium.crypto_box_SEALBYTES);
        sodium.crypto_box_seal(ciphertext, msg, curvePk);

        const decrypted = identity.decryptSealed(ciphertext);
        expect(decrypted?.toString()).toBe('sealed-secret');
    });

    it('should persist and retrieve Alias and Avatar', () => {
        identity.setAvatar('data:image/png;base64,abc');
        identity.setAlias('TestUser');

        // Restart
        identity.initIdentity(tempDir);
        expect(identity.getAvatar()).toBe('data:image/png;base64,abc');
        expect(identity.getAlias()).toBe('TestUser');
    });

    it('should handle DHT sequence persistence', () => {
        identity.unlockSession(mnemonic);
        const seq = identity.incrementMyDhtSeq();
        expect(seq).toBe(1);

        // Restart
        identity.initIdentity(tempDir);
        expect(identity.getMyDhtSeq()).toBe(1);
        identity.incrementMyDhtSeq();
        expect(identity.getMyDhtSeq()).toBe(2);
    });

    it('should generate a mnemonic identity and unlock it', () => {
        const mnemonicGenerated = identity.createMnemonicIdentity();
        expect(bip39.validateMnemonic(mnemonicGenerated)).toBe(true);
        expect(identity.isSessionLocked()).toBe(false);
        expect(identity.isMnemonicMode()).toBe(true);
    });

    it('should unlock session with a valid mnemonic', () => {
        const ok = identity.unlockWithMnemonic(mnemonic);
        expect(ok).toBe(true);
        expect(identity.isSessionLocked()).toBe(false);
    });

    it('should fail to unlock with an invalid mnemonic', () => {
        const ok = identity.unlockWithMnemonic('invalid mnemonic word list');
        expect(ok).toBe(false);
    });

    it('should handle legacy keys properly during init', () => {
        // Create mock legacy key
        const legacyPath = path.join(tempDir, 'identity.key');
        fs.writeFileSync(legacyPath, Buffer.alloc(sodium.crypto_sign_SECRETKEYBYTES));

        identity.initIdentity(tempDir);

        // Should have renamed to .legacy-bak
        expect(fs.existsSync(legacyPath + '.legacy-bak')).toBe(true);
    });
});
