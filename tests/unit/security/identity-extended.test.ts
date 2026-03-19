import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import sodium from 'sodium-native';
import fs from 'node:fs';
import path from 'node:path';
import * as bip39 from 'bip39';
import {
    initIdentity,
    unlockSession,
    lockSession,
    getMySignedPreKey,
    getSpkBySpkId,
    encrypt,
    decrypt,
    incrementDhtSeq,
    getDhtSeq,
    getMyDeviceId,
    getMyEphemeralPublicKey
} from '../../../src/main_process/security/identity.js';

vi.mock('../../../src/main_process/security/secure-logger.js', () => ({
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
}));

describe('Identity Protection - Extended Tests', () => {
    const tempDir = path.join(__dirname, 'temp_identity_ext');
    const mnemonic = bip39.generateMnemonic();

    beforeEach(() => {
        if (fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true, force: true });
        fs.mkdirSync(tempDir, { recursive: true });
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.restoreAllMocks();
        vi.useRealTimers();
        if (fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true, force: true });
    });

    it('should handle DHT sequence increment and persistence', () => {
        initIdentity(tempDir);
        unlockSession(mnemonic);

        const initialSeq = getDhtSeq();
        const nextSeq = incrementDhtSeq();
        expect(nextSeq).toBe(initialSeq + 1);

        // Re-init to check persistence
        initIdentity(tempDir);
        expect(getDhtSeq()).toBe(nextSeq);
    });

    it('should rotate Signed PreKeys (SPK) correctly', () => {
        initIdentity(tempDir);
        unlockSession(mnemonic);

        const spk1 = getMySignedPreKey();
        const id1 = spk1.spkId;

        // Advance time by 8 days (SPK_ROTATION_INTERVAL_MS is 7 days)
        vi.advanceTimersByTime(8 * 24 * 60 * 60 * 1000);

        const spk2 = getMySignedPreKey();
        expect(spk2.spkId).not.toBe(id1);

        // Both should be available
        expect(getSpkBySpkId(id1)).not.toBeNull();
        expect(getSpkBySpkId(spk2.spkId)).not.toBeNull();
    });

    it('should rotate Ephemeral Keys after MAX_MESSAGES', () => {
        initIdentity(tempDir);
        unlockSession(mnemonic);

        const initialEphPk = getMyEphemeralPublicKey().toString('hex');
        const recipientPk = Buffer.alloc(32);
        sodium.randombytes_buf(recipientPk);

        // Encrypt 100 messages (EPHEMERAL_KEY_MAX_MESSAGES)
        for (let i = 0; i < 100; i++) {
            encrypt(Buffer.from('hello'), recipientPk);
        }

        const newEphPk = getMyEphemeralPublicKey().toString('hex');
        expect(newEphPk).not.toBe(initialEphPk);
    });

    it('should secure-erase keys from memory on lockSession', () => {
        initIdentity(tempDir);
        unlockSession(mnemonic);

        // We can't easily verify sodium_memzero from JS without native hooks,
        // but we can verify the state transitions and that files are removed.
        lockSession();

        const sessionFile = path.join(tempDir, 'identity.enc');
        const lockedFile = path.join(tempDir, 'session.locked');

        expect(fs.existsSync(sessionFile)).toBe(false);
        expect(fs.existsSync(lockedFile)).toBe(true);
    });

    it('should generate a unique device ID based on local key', () => {
        initIdentity(tempDir);
        const id1 = getMyDeviceId();
        expect(id1).toHaveLength(64); // SHA-256 hex

        // Should be persistent
        const id2 = getMyDeviceId();
        expect(id1).toBe(id2);
    });

    it('should handle encryption and decryption', () => {
        initIdentity(tempDir);
        unlockSession(mnemonic);

        const message = Buffer.from('secret message');
        const myPk = getMyEphemeralPublicKey();

        const { nonce, ciphertext } = encrypt(message, myPk);
        const decrypted = decrypt(
            Buffer.from(nonce, 'hex'),
            Buffer.from(ciphertext, 'hex'),
            myPk
        );

        expect(decrypted).not.toBeNull();
        if (decrypted) {
            expect(decrypted.toString()).toBe('secret message');
        }
    });
});
