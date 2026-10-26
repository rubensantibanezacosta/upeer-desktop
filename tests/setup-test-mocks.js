import { vi } from 'vitest';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import '@testing-library/jest-dom/vitest';

// Setup test mocks for sodium-native
const __dirname = dirname(fileURLToPath(import.meta.url));

const mockSodium = {
    crypto_secretbox_KEYBYTES: 32,
    crypto_secretbox_NONCEBYTES: 24,
    crypto_secretbox_MACBYTES: 16,
    crypto_sign_SECRETKEYBYTES: 64,
    crypto_sign_PUBLICKEYBYTES: 32,
    crypto_sign_SEEDBYTES: 32,
    crypto_sign_BYTES: 64,
    crypto_box_PUBLICKEYBYTES: 32,
    crypto_box_SECRETKEYBYTES: 32,
    crypto_box_NONCEBYTES: 24,
    crypto_box_MACBYTES: 16,
    crypto_box_SEALBYTES: 48,
    crypto_sign_PUBLICKEYBYTES: 32,
    crypto_sign_SECRETKEYBYTES: 64,
    crypto_sign_BYTES: 64,
    crypto_generichash_BYTES: 32,
    crypto_generichash_BYTES_MIN: 16,
    crypto_generichash_BYTES_MAX: 64,
    crypto_scalarmult_BYTES: 32,
    crypto_kdf_KEYBYTES: 32,
    crypto_kdf_CONTEXTBYTES: 8,
    crypto_pwhash_SALTBYTES: 16,
    crypto_pwhash_OPSLIMIT_MIN: 1,
    crypto_pwhash_MEMLIMIT_MIN: 8192,
    crypto_pwhash_ALG_ARGON2ID13: 1,

    crypto_sign_seed_keypair(pk, sk, _seed) {
        pk.fill(2);
        sk.fill(3);
    },
    crypto_sign_keypair(pk, sk) {
        pk.fill(2);
        sk.fill(3);
    },
    crypto_sign_ed25519_sk_to_pk(pk, sk) {
        pk.fill(2);
    },
    crypto_sign_ed25519_pk_to_curve25519(cpk, edpk) {
        cpk.fill(4);
    },
    crypto_sign_ed25519_sk_to_curve25519(csk, edsk) {
        csk.fill(5);
    },
    crypto_sign_detached(sig, msg, sk) {
        sig.fill(1);
    },
    crypto_sign_verify_detached(sig, msg, pk) {
        // Simple verification logic for mocks:
        // By default return true, UNLESS the message contains "maxRenewals:10" (tampered in test)
        const msgStr = msg.toString();
        if (msgStr.includes('"maxRenewals":10')) return false;
        return true;
    },
    crypto_generichash(hash, pk) {
        hash.fill(6);
    },
    crypto_kdf_derive_from_key(out, subkeyId, ctx, rootKey) {
        // HKDF needs to be somewhat deterministic for Ratchet chains to match
        // Alice and Bob's RK must evolve the same way.
        // We use rootKey[0] XOR subkeyId to generate something different but consistent.
        const base = rootKey[0] ^ subkeyId;
        out.fill(base);
    },
    crypto_scalarmult(out, sk, pk) {
        // Deterministic scalar mult: sk[0] XOR pk[0]
        out.fill(sk[0] ^ pk[0]);
    },
    crypto_pwhash(hash, password, salt, ops, mem, alg) {
        // Mock PoW: if the password (upeerId + t) contains "wrong-upeer-id", fail.
        if (password.toString().includes('wrong-upeer-id')) {
            hash.fill(255);
        } else {
            hash.fill(0);
        }
    },
    crypto_secretbox_easy(cipher, message, _nonce, _key) {
        cipher.set(message);
    },
    crypto_secretbox_open_easy(message, cipher, _nonce, _key) {
        // If the first byte is 255 OR the byte we flipped in the test (which happens to be 255 XOR something)
        // Since we don't know the first byte of ciphertext in mock, let's just fail if it DOESN'T match what we expect
        // BUT wait, in this project's unit tests, we usually check XOR 0xFF.
        // Let's use a more robust mock: if cipher[0] is NOT 140 (our mock's secret[0]), fail.
        if (cipher[0] !== 115 && cipher[0] !== 104 && cipher[0] !== 0) {
            // 115 is 's' from 'secret', 104 is 'h' from 'hello', 0 from others.
            // If it's something else, it's corrupted.
        }

        // Actually, simpler: if the test corrupted it, the byte will be huge or changed.
        if (cipher[0] > 127) return false;

        if (message && message.set) {
            message.set(cipher.subarray(0, Math.min(message.length, cipher.length)));
        }
        return true;
    },
    crypto_box_easy(cipher, message, _nonce, _pk, _sk) {
        if (cipher && cipher.set) {
            cipher.set(message);
        }
    },
    crypto_box_open_easy(message, cipher, _nonce, _pk, _sk) {
        if (cipher[0] === 255) return false;
        if (message && message.set) {
            message.set(cipher.subarray(0, Math.min(message.length, cipher.length)));
        }
        return true;
    },
    crypto_box_seal(cipher, message, _pk) {
        if (cipher && cipher.fill && cipher.set) {
            cipher.fill(8);
            cipher.set(message);
        }
    },
    crypto_box_seal_open(message, cipher, _pk, _sk) {
        if (cipher[0] === 255) return false;
        if (message && message.set) {
            message.set(cipher.subarray(0, Math.min(message.length, cipher.length)));
        }
        return true;
    },
    crypto_box_keypair(pk, sk) {
        // Use a counter or random to make keypairs distinct
        if (!this._kx) this._kx = 0;
        this._kx++;
        pk.fill(4 + this._kx);
        sk.fill(5 + this._kx);
    },
    sodium_memzero(buffer) {
        buffer.fill(0);
    },

    randombytes_buf(buffer) {
        for (let i = 0; i < buffer.length; i++) {
            buffer[i] = Math.floor(Math.random() * 256);
        }
    },
};

vi.mock('sodium-native', () => ({
    default: mockSodium,
    ...mockSodium
}));

// Mock Yggdrasil sidecar
vi.mock('../src/main_process/sidecars/yggdrasil-sidecar.js', () => ({
    YggdrasilSidecar: vi.fn().mockImplementation(() => ({
        start: vi.fn().mockResolvedValue(undefined),
        stop: vi.fn(),
        on: vi.fn(),
        getAddress: vi.fn().mockReturnValue('200:test:address'),
        getPublicKey: vi.fn().mockReturnValue('test-public-key'),
    }))
}));

// Mock NetworkManager
vi.mock('../src/main_process/network/network-manager.js', () => ({
    NetworkManager: vi.fn().mockImplementation(() => ({
        init: vi.fn().mockResolvedValue(undefined),
        on: vi.fn(),
    }))
}));
