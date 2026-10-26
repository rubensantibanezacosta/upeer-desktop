import { describe, it, expect, vi, beforeEach } from 'vitest';

const state = vi.hoisted(() => ({
    accountAvailable: true,
    deviceAvailable: true,
}));

vi.mock('../../../src/main_process/security/secure-logger.js', () => ({
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
    network: vi.fn(),
    security: vi.fn(),
}));

vi.mock('../../../src/main_process/network/file-transfer/crypto.js', () => ({
    sealTransferKey: (aesKey: Buffer, publicKey: string) => ({
        ciphertext: `aa${publicKey}${aesKey.toString('hex')}`.padEnd(160, '0'),
    }),
    unsealTransferKey: (ciphertext: string) => (
        state.accountAvailable ? Buffer.from(ciphertext.slice(66, 130), 'hex') : null
    ),
}));

vi.mock('../../../src/main_process/security/deviceMessaging.js', () => ({
    decryptSealedWithDevice: (ciphertext: Buffer) => (
        state.deviceAvailable
            ? Buffer.from(ciphertext.toString('hex').slice(66, 130), 'hex')
            : null
    ),
}));

import { sealTransferKeyEnvelope, unsealTransferKeyEnvelope } from '../../../src/main_process/network/file-transfer/keyEnvelope.js';
import { validateFileProposal } from '../../../src/main_process/security/validationFiles.js';

const ACCOUNT_KEY = '11'.repeat(32);
const DEVICE_KEY = '22'.repeat(32);
const AES_KEY = Buffer.from('33'.repeat(32), 'hex');

describe('keyEnvelope', () => {
    beforeEach(() => {
        state.accountAvailable = true;
        state.deviceAvailable = true;
    });

    it('sella solo a la cuenta cuando no hay clave de dispositivo', () => {
        const envelope = sealTransferKeyEnvelope(AES_KEY, ACCOUNT_KEY, undefined);
        expect(envelope.encryptedKey).toHaveLength(160);
        expect(envelope.deviceEncryptedKey).toBeUndefined();
    });

    it('sella también al dispositivo cuando la clave es distinta de la cuenta', () => {
        const envelope = sealTransferKeyEnvelope(AES_KEY, ACCOUNT_KEY, DEVICE_KEY);
        expect(envelope.encryptedKey).toHaveLength(160);
        expect(envelope.deviceEncryptedKey).toHaveLength(160);
        expect(envelope.deviceEncryptedKey).not.toBe(envelope.encryptedKey);
    });

    it('no duplica el sobre cuando la clave de dispositivo coincide con la de cuenta', () => {
        const envelope = sealTransferKeyEnvelope(AES_KEY, ACCOUNT_KEY, ACCOUNT_KEY);
        expect(envelope.encryptedKey).toBeDefined();
        expect(envelope.deviceEncryptedKey).toBeUndefined();
    });

    it('ignora claves con forma inválida', () => {
        expect(sealTransferKeyEnvelope(AES_KEY, 'no-hex', 'ff')).toEqual({});
    });

    it('abre el sobre de cuenta con la identidad de cuenta', () => {
        const envelope = sealTransferKeyEnvelope(AES_KEY, ACCOUNT_KEY, DEVICE_KEY);
        expect(unsealTransferKeyEnvelope(envelope, ACCOUNT_KEY)?.equals(AES_KEY)).toBe(true);
    });

    it('cae al sobre de dispositivo cuando la cuenta no puede abrirlo', () => {
        state.accountAvailable = false;
        const envelope = sealTransferKeyEnvelope(AES_KEY, ACCOUNT_KEY, DEVICE_KEY);
        expect(unsealTransferKeyEnvelope(envelope, ACCOUNT_KEY)?.equals(AES_KEY)).toBe(true);
    });

    it('devuelve null cuando ninguna identidad puede abrir el sobre', () => {
        state.accountAvailable = false;
        state.deviceAvailable = false;
        const envelope = sealTransferKeyEnvelope(AES_KEY, ACCOUNT_KEY, DEVICE_KEY);
        expect(unsealTransferKeyEnvelope(envelope, ACCOUNT_KEY)).toBeNull();
    });

    it('devuelve null sin sobres en la propuesta', () => {
        expect(unsealTransferKeyEnvelope({}, ACCOUNT_KEY)).toBeNull();
    });
});

describe('validateFileProposal con deviceEncryptedKey', () => {
    const base = {
        fileId: 'file-1',
        fileName: 'informe.pdf',
        fileSize: 1024,
        totalChunks: 1,
        chunkSize: 1024,
    };

    it('acepta un sobre de dispositivo con longitud válida', () => {
        expect(validateFileProposal({ ...base, deviceEncryptedKey: 'a'.repeat(160) }).valid).toBe(true);
    });

    it('rechaza un sobre de dispositivo con longitud inválida', () => {
        expect(validateFileProposal({ ...base, deviceEncryptedKey: 'a'.repeat(100) }).valid).toBe(false);
    });
});
