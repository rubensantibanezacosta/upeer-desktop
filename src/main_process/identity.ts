import sodium from 'sodium-native';
import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';

let publicKey: Buffer;
let secretKey: Buffer;
let revelnestId: string;

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
