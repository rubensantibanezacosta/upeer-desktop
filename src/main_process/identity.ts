import sodium from 'sodium-native';
import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';

let publicKey: Buffer;
let secretKey: Buffer;
let revelnestId: string;
let ephemeralPublicKey: Buffer;
let ephemeralSecretKey: Buffer;

export function initIdentity() {
    const keyPath = path.join(app.getPath('userData'), 'identity.key');

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

    console.log('--- Identidad RevelNest Inicializada ---');
    console.log('RevelNest ID:', revelnestId);
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
