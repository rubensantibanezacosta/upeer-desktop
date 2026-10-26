import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import sodium from 'sodium-native';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.unmock('sodium-native');

import { decryptChunk } from '../../../src/main_process/network/file-transfer/crypto.js';
import { unsealTransferKeyEnvelope } from '../../../src/main_process/network/file-transfer/keyEnvelope.js';
import { TransferValidator } from '../../../src/main_process/network/file-transfer/validator.js';
import { identityState } from '../../../src/main_process/security/identityState.js';

type MobileChunk = {
    index: number;
    data: string;
    iv: string;
    tag: string;
    chunkHash: string;
};

type MobilePayload = {
    accountPublicKey: string;
    accountSecretKey: string;
    devicePublicKey: string;
    deviceSecretKey: string;
    fileKey: string;
    fileId: string;
    fileName: string;
    fileSize: number;
    chunkSize: number;
    totalChunks: number;
    mimeType: string;
    fileHash: string;
    encryptedKey: string;
    deviceEncryptedKey: string;
    chunks: MobileChunk[];
};

const payload: MobilePayload = JSON.parse(
    fs.readFileSync(path.resolve('tests/fixtures/file-transfer-mobile-go.json'), 'utf8'),
);

function adoptIdentity(publicKeyHex: string, secretKeyHex: string): void {
    identityState.publicKey = Buffer.from(publicKeyHex, 'hex');
    identityState.secretKey = Buffer.from(secretKeyHex, 'hex');
    identityState.isLocked = false;
}

function openSealedWith(ciphertextHex: string, publicKeyHex: string, secretKeyHex: string): Buffer | null {
    const curvePublicKey = Buffer.alloc(sodium.crypto_box_PUBLICKEYBYTES);
    const curveSecretKey = Buffer.alloc(sodium.crypto_box_SECRETKEYBYTES);
    sodium.crypto_sign_ed25519_pk_to_curve25519(curvePublicKey, Buffer.from(publicKeyHex, 'hex'));
    sodium.crypto_sign_ed25519_sk_to_curve25519(curveSecretKey, Buffer.from(secretKeyHex, 'hex'));
    const ciphertext = Buffer.from(ciphertextHex, 'hex');
    const plaintext = Buffer.alloc(ciphertext.length - sodium.crypto_box_SEALBYTES);
    return sodium.crypto_box_seal_open(plaintext, ciphertext, curvePublicKey, curveSecretKey) ? plaintext : null;
}

beforeEach(() => {
    adoptIdentity(payload.accountPublicKey, payload.accountSecretKey);
});

afterEach(() => {
    identityState.publicKey = null;
    identityState.secretKey = null;
    identityState.isLocked = true;
});

describe('propuesta FILE_* generada por el móvil', () => {
    it('pasa la validación del receptor del escritorio', () => {
        const validator = new TransferValidator();
        expect(() => validator.validateIncomingFile(payload)).not.toThrow();
    });

    it('rechaza la propuesta si el nombre viaja sin sanear', () => {
        const validator = new TransferValidator();
        expect(() => validator.validateIncomingFile({ ...payload, fileName: '../secreto.txt' })).toThrow();
    });

    it('abre la clave de archivo sellada a la identidad de cuenta', () => {
        const opened = unsealTransferKeyEnvelope(
            { encryptedKey: payload.encryptedKey, deviceEncryptedKey: payload.deviceEncryptedKey },
            payload.accountPublicKey,
        );
        expect(opened?.toString('hex')).toBe(payload.fileKey);
    });

    it('sella la misma clave de archivo al dispositivo', () => {
        const opened = openSealedWith(payload.deviceEncryptedKey, payload.devicePublicKey, payload.deviceSecretKey);
        expect(opened?.toString('hex')).toBe(payload.fileKey);
    });

    it('no entrega la clave a una identidad de cuenta distinta', () => {
        const other = crypto.generateKeyPairSync('ed25519');
        adoptIdentity(
            Buffer.from(other.publicKey.export({ type: 'spki', format: 'der' }).subarray(-32)).toString('hex'),
            Buffer.from(other.privateKey.export({ type: 'pkcs8', format: 'der' }).subarray(-32)).toString('hex'),
        );
        expect(unsealTransferKeyEnvelope({ encryptedKey: payload.encryptedKey }, payload.accountPublicKey)).toBeNull();
    });
});

describe('trozos FILE_CHUNK generados por el móvil', () => {
    const aesKey = Buffer.from(payload.fileKey, 'hex');

    it('descifran y coinciden con su hash de texto plano', () => {
        for (const chunk of payload.chunks) {
            const plain = decryptChunk(chunk.data, chunk.iv, chunk.tag, aesKey);
            const hash = crypto.createHash('sha256').update(plain).digest('hex');
            expect(hash).toBe(chunk.chunkHash);
        }
    });

    it('reconstruyen el archivo con el hash global de la propuesta', () => {
        const file = Buffer.alloc(payload.fileSize);
        for (const chunk of payload.chunks) {
            const plain = decryptChunk(chunk.data, chunk.iv, chunk.tag, aesKey);
            const offset = chunk.index * payload.chunkSize;
            expect(offset + plain.length).toBeLessThanOrEqual(payload.fileSize);
            plain.copy(file, offset);
        }
        expect(file.length).toBe(payload.fileSize);
        expect(crypto.createHash('sha256').update(file).digest('hex')).toBe(payload.fileHash);
    });

    it('el último trozo es más corto y el total cuadra con el tamaño', () => {
        const last = payload.chunks[payload.chunks.length - 1];
        const plain = decryptChunk(last.data, last.iv, last.tag, aesKey);
        expect(last.index).toBe(payload.totalChunks - 1);
        expect(plain.length).toBe(payload.fileSize - last.index * payload.chunkSize);
        expect(plain.length).toBeLessThan(payload.chunkSize);
    });

    it('rechaza un trozo manipulado', () => {
        const chunk = payload.chunks[0];
        const tag = Buffer.from(chunk.tag, 'hex');
        tag[0] ^= 0xff;
        expect(() => decryptChunk(chunk.data, chunk.iv, tag.toString('hex'), aesKey)).toThrow();
    });
});
