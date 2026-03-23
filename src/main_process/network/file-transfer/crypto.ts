import crypto from 'node:crypto';
import sodium from 'sodium-native';
import { decryptSealed } from '../../security/identity.js';

export function generateTransferKey(): Buffer {
    return crypto.randomBytes(32); // AES-256 key
}

export function encryptChunk(chunk: Buffer, key: Buffer): { data: string; iv: string; tag: string } {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const enc = Buffer.concat([cipher.update(chunk), cipher.final()]);
    const tag = cipher.getAuthTag();
    return { data: enc.toString('base64'), iv: iv.toString('hex'), tag: tag.toString('hex') };
}

export function decryptChunk(data: string, iv: string, tag: string, key: Buffer): Buffer {
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'hex'));
    decipher.setAuthTag(Buffer.from(tag, 'hex'));
    return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]);
}

/**
 * Seals the AES key for a peer using sealed box over the peer static identity key.
 */
export function sealTransferKey(aesKey: Buffer, peerPublicKey: string): { nonce?: string; ciphertext: string } {
    const recipientEdPk = Buffer.from(peerPublicKey, 'hex');
    const recipientCurvePk = Buffer.alloc(sodium.crypto_box_PUBLICKEYBYTES);
    sodium.crypto_sign_ed25519_pk_to_curve25519(recipientCurvePk, recipientEdPk);

    const ciphertext = Buffer.alloc(aesKey.length + sodium.crypto_box_SEALBYTES);
    sodium.crypto_box_seal(ciphertext, aesKey, recipientCurvePk);

    return { ciphertext: ciphertext.toString('hex') };
}

/**
 * Unseals the AES key from a peer
 */
export function unsealTransferKey(encryptedKey: string, nonce?: string, peerPublicKey?: string): Buffer | null {
    void nonce;
    void peerPublicKey;
    return decryptSealed(Buffer.from(encryptedKey, 'hex'));
}
