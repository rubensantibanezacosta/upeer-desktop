// Mock for sodium-native module for testing

// Constants used in DHT encryption
const crypto_secretbox_KEYBYTES = 32;
const crypto_secretbox_NONCEBYTES = 24;
const crypto_secretbox_MACBYTES = 16;

// Simple encryption/decryption simulation for testing
// Note: This is NOT secure, just for testing purposes

function randombytes_buf(buffer: Buffer): void {
    // Fill buffer with pseudo-random bytes
    for (let i = 0; i < buffer.length; i++) {
        buffer[i] = Math.floor(Math.random() * 256);
    }
}

function crypto_secretbox_easy(ciphertext: Buffer, message: Buffer, nonce: Buffer, key: Buffer): void {
    // Mock encryption: just XOR with key (not secure!)
    // For testing, we need to produce consistent results
    const macSize = crypto_secretbox_MACBYTES;
    
    // First 16 bytes are MAC (simulated)
    for (let i = 0; i < macSize; i++) {
        ciphertext[i] = (message.length + i) ^ key[i % key.length];
    }
    
    // Rest is XOR "encryption"
    for (let i = 0; i < message.length; i++) {
        ciphertext[macSize + i] = message[i] ^ key[(i + nonce[0]) % key.length];
    }
}

function crypto_secretbox_open_easy(message: Buffer, ciphertext: Buffer, nonce: Buffer, key: Buffer): boolean {
    // Mock decryption: reverse XOR
    const macSize = crypto_secretbox_MACBYTES;
    
    if (ciphertext.length < macSize) {
        return false;
    }
    
    // Verify mock MAC (simple check)
    for (let i = 0; i < macSize; i++) {
        const expectedMac = (message.length + i) ^ key[i % key.length];
        if (ciphertext[i] !== expectedMac) {
            return false;
        }
    }
    
    // Decrypt message
    for (let i = 0; i < message.length; i++) {
        message[i] = ciphertext[macSize + i] ^ key[(i + nonce[0]) % key.length];
    }
    
    return true;
}

// Export as default object
const sodium = {
    crypto_secretbox_KEYBYTES,
    crypto_secretbox_NONCEBYTES,
    crypto_secretbox_MACBYTES,
    randombytes_buf,
    crypto_secretbox_easy,
    crypto_secretbox_open_easy
};

export default sodium;