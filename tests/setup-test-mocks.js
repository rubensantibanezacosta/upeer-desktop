// Setup test mocks for sodium-native
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// require will be defined later for mocking
const __dirname = dirname(fileURLToPath(import.meta.url));

// Mock sodium-native module
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
    crypto_generichash_BYTES_MIN: 16,
    crypto_generichash_BYTES_MAX: 64,
    
    randombytes_buf(buffer) {
        for (let i = 0; i < buffer.length; i++) {
            buffer[i] = Math.floor(Math.random() * 256);
        }
    },
    
    crypto_secretbox_easy(ciphertext, message, nonce, key) {
        const macSize = this.crypto_secretbox_MACBYTES;
        
        // Simulate MAC
        for (let i = 0; i < macSize; i++) {
            ciphertext[i] = (message.length + i) ^ key[i % key.length];
        }
        
        // Simulate encryption
        for (let i = 0; i < message.length; i++) {
            ciphertext[macSize + i] = message[i] ^ key[(i + nonce[0]) % key.length];
        }
    },
    
    crypto_secretbox_open_easy(message, ciphertext, nonce, key) {
        const macSize = this.crypto_secretbox_MACBYTES;
        
        if (ciphertext.length < macSize) {
            return false;
        }
        
        // Verify mock MAC
        for (let i = 0; i < macSize; i++) {
            const expectedMac = (message.length + i) ^ key[i % key.length];
            if (ciphertext[i] !== expectedMac) {
                return false;
            }
        }
        
        // Decrypt
        for (let i = 0; i < message.length; i++) {
            message[i] = ciphertext[macSize + i] ^ key[(i + nonce[0]) % key.length];
        }
        
        return true;
    },
    
    crypto_sign_keypair(publicKey, secretKey) {
        // Generate deterministic keypair for testing
        for (let i = 0; i < publicKey.length; i++) {
            publicKey[i] = i;
            secretKey[i] = i;
        }
        // Ed25519: public key is last 32 bytes of secret key
        publicKey.set(secretKey.subarray(32));
    },
    
    crypto_sign_seed_keypair(publicKey, secretKey, seed) {
        // Deterministic from seed
        for (let i = 0; i < publicKey.length; i++) {
            publicKey[i] = seed[i % seed.length] || i;
        }
        // Fill secret key with deterministic data
        for (let i = 0; i < secretKey.length; i++) {
            secretKey[i] = (seed[i % seed.length] || i) ^ 0xFF;
        }
        // Set public key in secret key
        secretKey.set(publicKey, 32);
    },
    
    crypto_sign_detached(signature, message, secretKey) {
        // Deterministic signature for testing
        for (let i = 0; i < signature.length; i++) {
            signature[i] = (message[i % message.length] || i) ^ secretKey[i % secretKey.length];
        }
        return 0; // success
    },
    
    crypto_sign_verify_detached(signature, message, publicKey) {
        // Always return true for testing
        return true;
    },
    
    crypto_box_easy(ciphertext, message, nonce, publicKey, secretKey) {
        // Mock encryption
        const macSize = this.crypto_box_MACBYTES;
        // Simulate MAC
        for (let i = 0; i < macSize; i++) {
            ciphertext[i] = (message.length + i) ^ publicKey[i % publicKey.length];
        }
        // Simulate encryption
        for (let i = 0; i < message.length; i++) {
            ciphertext[macSize + i] = message[i] ^ publicKey[i % publicKey.length];
        }
    },
    
    crypto_box_open_easy(message, ciphertext, nonce, publicKey, secretKey) {
        // Mock decryption
        // Skip MAC bytes
        const macSize = this.crypto_box_MACBYTES;
        if (ciphertext.length < macSize) {
            return -1; // error
        }
        for (let i = 0; i < message.length; i++) {
            message[i] = ciphertext[macSize + i] ^ publicKey[i % publicKey.length];
        }
        return 0; // success
    },
    
    crypto_generichash(output, input, key = null) {
        // Simple deterministic hash for testing
        for (let i = 0; i < output.length; i++) {
            output[i] = (input[i % input.length] || i) ^ (i * 7);
        }
    },
    
    crypto_sign_ed25519_pk_to_curve25519(curve25519Pk, ed25519Pk) {
        // Mock conversion: just copy first 32 bytes
        curve25519Pk.set(ed25519Pk.subarray(0, curve25519Pk.length));
    },
    
    crypto_sign_ed25519_sk_to_curve25519(curve25519Sk, ed25519Sk) {
        // Mock conversion: just copy first 32 bytes
        curve25519Sk.set(ed25519Sk.subarray(0, curve25519Sk.length));
    }
};

// Mock identity module
const mockIdentity = {
    getMyRevelNestId() {
        return 'test1234567890abcdef1234567890abcd';
    },
    sign(message) {
        // Return deterministic signature for testing
        const sig = Buffer.alloc(64);
        for (let i = 0; i < sig.length; i++) {
            sig[i] = (message[i % message.length] || i) ^ (i * 13);
        }
        return sig;
    },
    verify(signature, message, publicKey) {
        // Always return true for testing
        return true;
    },
    encrypt(message, recipientPublicKey, useEphemeral = false) {
        // Mock encryption
        const nonce = Buffer.alloc(24);
        mockSodium.randombytes_buf(nonce);
        const ciphertext = Buffer.alloc(message.length + mockSodium.crypto_box_MACBYTES);
        mockSodium.crypto_box_easy(ciphertext, message, nonce, recipientPublicKey, Buffer.alloc(32));
        return { ciphertext, nonce };
    },
    decrypt(ciphertext, nonce, senderPublicKey, useEphemeral = false) {
        // Mock decryption
        const message = Buffer.alloc(ciphertext.length - mockSodium.crypto_box_MACBYTES);
        const success = mockSodium.crypto_box_open_easy(message, ciphertext, nonce, senderPublicKey, Buffer.alloc(32));
        return success === 0 ? message : null;
    }
};

// Override the module cache for sodium-native
// Note: createRequire already imported above
const require = createRequire(import.meta.url);

const Module = require('node:module');
const originalRequire = Module.prototype.require;

Module.prototype.require = function(id) {
    if (id === 'sodium-native') {
        return mockSodium;
    }
    // Mock identity module
    if (id.includes('identity') && (id.endsWith('.js') || id.endsWith('.ts'))) {
        return mockIdentity;
    }
    return originalRequire.apply(this, arguments);
};

// Also handle ESM imports using import hooks
import { register } from 'node:module';

// Register mock for sodium-native in ESM
// register('sodium-native', () => ({ default: mockSodium })); // Not needed with require hook

// For identity module, we need to handle it differently
// We'll use a dynamic import interceptor
const originalResolve = import.meta.resolve;
// Note: This is a simplified approach - in practice we'd need a more robust solution
// For now, rely on require hook above