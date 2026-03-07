import sodium from 'sodium-native';
import { info, error, debug } from './secure-logger.js';
import fs from 'node:fs';
import path from 'node:path';

let publicKey: Buffer;
let secretKey: Buffer;
let revelnestId: string;
let ephemeralPublicKey: Buffer;
let ephemeralSecretKey: Buffer;
let ephemeralKeyRotationInterval: NodeJS.Timeout | null = null;
let ephemeralKeyRotationCounter: number = 0;
const EPHEMERAL_KEY_ROTATION_INTERVAL_MS = 5 * 60 * 1000; // Rotate every 5 minutes
const EPHEMERAL_KEY_MAX_MESSAGES = 100; // Rotate after 100 messages
let dhtSeq: number = 0;
let dhtStatePath: string;

export function initIdentity(userDataPath: string) {
    const keyPath = path.join(userDataPath, 'identity.key');

    if (fs.existsSync(keyPath)) {
        const data = fs.readFileSync(keyPath);
        if (data.length === sodium.crypto_sign_SECRETKEYBYTES) {
            secretKey = data;
            publicKey = Buffer.alloc(sodium.crypto_sign_PUBLICKEYBYTES);
            // Public key is just the last 32 bytes of the secret key in Ed25519
            publicKey = secretKey.subarray(32);
        } else {
            generateNewKeypair(keyPath);
        }
    } else {
        generateNewKeypair(keyPath);
    }

    // RevelNest ID: 16-byte BLAKE2b hash of Public Key for a shorter, cleaner ID
    const hash = Buffer.alloc(16);
    sodium.crypto_generichash(hash, publicKey);
    revelnestId = hash.toString('hex');

    // Ephemeral Key setup for PFS per session
    ephemeralPublicKey = Buffer.alloc(sodium.crypto_box_PUBLICKEYBYTES);
    ephemeralSecretKey = Buffer.alloc(sodium.crypto_box_SECRETKEYBYTES);
    sodium.crypto_box_keypair(ephemeralPublicKey, ephemeralSecretKey);
    
    // Start ephemeral key rotation
    startEphemeralKeyRotation();

    // DHT State setup
    dhtStatePath = path.join(userDataPath, 'dht_state.json');
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
        dhtSeq = Date.now(); // Start seq at current timestamp to ensure monotony across complete wipes if key is kept
        fs.writeFileSync(dhtStatePath, JSON.stringify({ seq: dhtSeq }));
    }

    info('Identidad RevelNest Inicializada', { revelnestId, dhtSeq }, 'identity');
}

function generateNewKeypair(keyPath: string) {
    publicKey = Buffer.alloc(sodium.crypto_sign_PUBLICKEYBYTES);
    secretKey = Buffer.alloc(sodium.crypto_sign_SECRETKEYBYTES);
    sodium.crypto_sign_keypair(publicKey, secretKey);
    fs.writeFileSync(keyPath, secretKey);
}

export function getMyPublicKey() {
    return publicKey;
}

export function getMyPublicKeyHex() {
    return publicKey.toString('hex');
}

export function getMyRevelNestId() {
    return revelnestId;
}

export function getRevelNestIdFromPublicKey(publicKey: Buffer): string {
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
    // Generate new ephemeral key pair
    const newEphemeralPublicKey = Buffer.alloc(sodium.crypto_box_PUBLICKEYBYTES);
    const newEphemeralSecretKey = Buffer.alloc(sodium.crypto_box_SECRETKEYBYTES);
    sodium.crypto_box_keypair(newEphemeralPublicKey, newEphemeralSecretKey);
    
    // Update global variables
    ephemeralPublicKey = newEphemeralPublicKey;
    ephemeralSecretKey = newEphemeralSecretKey;
    ephemeralKeyRotationCounter = 0;
    
    info('Ephemeral keys rotated', { rotation: ++ephemeralKeyRotationCounter }, 'identity');
    
    // Notify all connected contacts about key rotation
    notifyContactsAboutKeyRotation();
}

// Notify all connected contacts about key rotation
function notifyContactsAboutKeyRotation(): void {
    // This would notify contacts to update their stored ephemeral public key
    // Implementation depends on how contacts are managed
    // For now, we'll log it
    info('Notifying contacts about ephemeral key rotation', {}, 'identity');
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
        // Increment message counter for ephemeral keys
        incrementEphemeralMessageCounter();
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

    if (!success) return null;
    return decrypted;
}
