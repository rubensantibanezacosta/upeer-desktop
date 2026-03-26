import sodium from 'sodium-native';
import { identityState, EPHEMERAL_KEY_MAX_MESSAGES, MAX_PREVIOUS_EPH_KEYS } from './identityState.js';

function rotateEphemeralKey(): void {
    if (identityState.ephemeralPublicKey && identityState.ephemeralSecretKey) {
        identityState.previousEphemeralSecretKeys.unshift(identityState.ephemeralSecretKey);
        if (identityState.previousEphemeralSecretKeys.length > MAX_PREVIOUS_EPH_KEYS) {
            identityState.previousEphemeralSecretKeys.pop();
        }
    }
    const publicKey = Buffer.alloc(sodium.crypto_box_PUBLICKEYBYTES);
    const secretKey = Buffer.alloc(sodium.crypto_box_SECRETKEYBYTES);
    sodium.crypto_box_keypair(publicKey, secretKey);
    identityState.ephemeralPublicKey = publicKey;
    identityState.ephemeralSecretKey = secretKey;
    identityState.ephemeralKeyRotationCounter = 0;
}

export function getUPeerIdFromPublicKey(publicKey: Buffer): string {
    const hash = Buffer.alloc(sodium.crypto_generichash_BYTES);
    sodium.crypto_generichash(hash, publicKey);
    return hash.toString('hex');
}

export function sign(message: Buffer): Buffer {
    if (identityState.isLocked || !identityState.secretKey) throw new Error('Identity is locked');
    const signature = Buffer.alloc(sodium.crypto_sign_BYTES);
    sodium.crypto_sign_detached(signature, message, identityState.secretKey);
    return signature;
}

export function verify(message: Buffer, signature: Buffer, publicKey: Buffer): boolean {
    return sodium.crypto_sign_verify_detached(signature, message, publicKey);
}

export function encrypt(message: Buffer, recipientPublicKey: Buffer): { nonce: string; ciphertext: string } {
    if (!identityState.ephemeralSecretKey) throw new Error('Ephemeral identity is not initialized');
    const nonce = Buffer.alloc(sodium.crypto_box_NONCEBYTES);
    sodium.randombytes_buf(nonce);
    const ciphertext = Buffer.alloc(message.length + sodium.crypto_box_MACBYTES);
    sodium.crypto_box_easy(ciphertext, message, nonce, recipientPublicKey, identityState.ephemeralSecretKey);
    identityState.ephemeralKeyRotationCounter++;
    if (identityState.ephemeralKeyRotationCounter >= EPHEMERAL_KEY_MAX_MESSAGES) rotateEphemeralKey();
    return {
        nonce: nonce.toString('hex'),
        ciphertext: ciphertext.toString('hex'),
    };
}

export function decrypt(nonce: Buffer, ciphertext: Buffer, senderEphemeralPublicKey: Buffer): Buffer | null {
    if (!identityState.ephemeralSecretKey) return null;
    const plaintext = Buffer.alloc(ciphertext.length - sodium.crypto_box_MACBYTES);
    let opened = sodium.crypto_box_open_easy(plaintext, ciphertext, nonce, senderEphemeralPublicKey, identityState.ephemeralSecretKey);
    if (opened) return plaintext;
    for (const previousSecretKey of identityState.previousEphemeralSecretKeys) {
        opened = sodium.crypto_box_open_easy(plaintext, ciphertext, nonce, senderEphemeralPublicKey, previousSecretKey);
        if (opened) return plaintext;
    }
    return null;
}

export function decryptWithIdentityKey(nonce: Buffer, ciphertext: Buffer, senderEphemeralPublicKey: Buffer): Buffer | null {
    if (identityState.isLocked || !identityState.secretKey) return null;
    const plaintext = Buffer.alloc(ciphertext.length - sodium.crypto_box_MACBYTES);
    const identityCurveSecretKey = Buffer.alloc(sodium.crypto_box_SECRETKEYBYTES);
    sodium.crypto_sign_ed25519_sk_to_curve25519(identityCurveSecretKey, identityState.secretKey);
    const opened = sodium.crypto_box_open_easy(plaintext, ciphertext, nonce, senderEphemeralPublicKey, identityCurveSecretKey);
    return opened ? plaintext : null;
}

export function decryptX3DH(nonce: Buffer, ciphertext: Buffer, senderEphemeralPublicKey: Buffer, recipientSpkId: number): Buffer | null {
    let targetSecretKey: Buffer | null = null;
    if (recipientSpkId === identityState.spkId) {
        targetSecretKey = identityState.spkSecretKey;
    } else {
        const entry = identityState.previousSpkEntries.find((candidate) => candidate.spkId === recipientSpkId);
        if (entry) targetSecretKey = entry.spkSk;
    }
    if (!targetSecretKey) return null;
    const plaintext = Buffer.alloc(ciphertext.length - sodium.crypto_box_MACBYTES);
    const opened = sodium.crypto_box_open_easy(plaintext, ciphertext, nonce, senderEphemeralPublicKey, targetSecretKey);
    return opened ? plaintext : null;
}

export function decryptSealed(ciphertext: Buffer): Buffer | null {
    if (identityState.isLocked || !identityState.secretKey || !identityState.publicKey) return null;
    const boxPublicKey = Buffer.alloc(sodium.crypto_box_PUBLICKEYBYTES);
    const boxSecretKey = Buffer.alloc(sodium.crypto_box_SECRETKEYBYTES);
    sodium.crypto_sign_ed25519_sk_to_curve25519(boxSecretKey, identityState.secretKey);
    sodium.crypto_sign_ed25519_pk_to_curve25519(boxPublicKey, identityState.publicKey);
    const plaintext = Buffer.alloc(ciphertext.length - sodium.crypto_box_SEALBYTES);
    const opened = sodium.crypto_box_seal_open(plaintext, ciphertext, boxPublicKey, boxSecretKey);
    return opened ? plaintext : null;
}
