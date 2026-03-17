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
    getMyPublicKey
} from '../../../src/main_process/security/identity.js';

// Mocks de logger
vi.mock('../../../src/main_process/security/secure-logger.js', () => ({
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
}));

describe('IdentityManager', () => {
    const tempDir = path.join(__dirname, 'temp_identity_test');

    beforeEach(() => {
        if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
        vi.clearAllMocks();
    });

    afterEach(() => {
        if (fs.existsSync(tempDir)) {
            fs.rmSync(tempDir, { recursive: true, force: true });
        }
    });

    it('should initialize and be locked by default', () => {
        initIdentity(tempDir);
        expect(isLocked()).toBe(true);
    });

    it('should unlock with a valid mnemonic', () => {
        initIdentity(tempDir);
        const mnemonic = bip39.generateMnemonic();
        const result = unlockSession(mnemonic);

        expect(result).toBe(true);
        expect(isLocked()).toBe(false);
        expect(getMyUPeerId()).toBeDefined();
        expect(getMyUPeerId().length).toBeGreaterThan(0);
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
});
