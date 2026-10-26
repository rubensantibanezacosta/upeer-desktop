import { describe, it, expect, vi, beforeEach } from 'vitest';

const calls = vi.hoisted(() => ({
    keys: [] as string[],
    valid: new Set<string>(),
}));

vi.mock('../../../src/main_process/security/identity.js', () => ({
    verify: (_message: Buffer, _signature: Buffer, publicKey: Buffer) => {
        const key = publicKey.toString('hex');
        calls.keys.push(key);
        return calls.valid.has(key);
    },
}));

import { verifyFileTransferPacketFromSigner } from '../../../src/main_process/network/file-transfer/signature.js';

const ACCOUNT_KEY = 'a'.repeat(64);
const DEVICE_KEY = 'b'.repeat(64);
const DEVICE_ID = 'c'.repeat(64);

const packet = (extra: Record<string, unknown> = {}) => ({
    type: 'FILE_ACK',
    fileId: 'file-1',
    chunkIndex: 3,
    signature: 'f'.repeat(128),
    ...extra,
});

const uniqueKeys = () => Array.from(new Set(calls.keys));

const signer = (extra: Record<string, unknown> = {}) => ({
    publicKey: ACCOUNT_KEY,
    deviceId: DEVICE_ID,
    devicePublicKey: DEVICE_KEY,
    ...extra,
});

describe('verifyFileTransferPacketFromSigner', () => {
    beforeEach(() => {
        calls.keys = [];
        calls.valid = new Set();
    });

    it('accepts a packet without signature without touching any key', () => {
        const unsigned = { ...packet(), signature: undefined };

        expect(verifyFileTransferPacketFromSigner(unsigned, signer())).toBe(true);
        expect(calls.keys).toEqual([]);
    });

    it('accepts an account signature', () => {
        calls.valid.add(ACCOUNT_KEY);

        expect(verifyFileTransferPacketFromSigner(packet(), signer())).toBe(true);
        expect(calls.keys).toContain(ACCOUNT_KEY);
        expect(calls.keys).not.toContain(DEVICE_KEY);
    });

    it('accepts a device signature when the announced device matches the contact', () => {
        calls.valid.add(DEVICE_KEY);

        expect(verifyFileTransferPacketFromSigner(packet({ senderDeviceId: DEVICE_ID }), signer())).toBe(true);
        expect(uniqueKeys()).toEqual([ACCOUNT_KEY, DEVICE_KEY]);
    });

    it('compares the announced device id regardless of case', () => {
        calls.valid.add(DEVICE_KEY);

        expect(verifyFileTransferPacketFromSigner(packet({ senderDeviceId: DEVICE_ID.toUpperCase() }), signer())).toBe(true);
        expect(calls.keys).toContain(DEVICE_KEY);
    });

    it('rejects a signature from an unknown device without trying the device key', () => {
        calls.valid.add(DEVICE_KEY);

        expect(verifyFileTransferPacketFromSigner(packet({ senderDeviceId: 'd'.repeat(64) }), signer())).toBe(false);
        expect(uniqueKeys()).toEqual([ACCOUNT_KEY]);
    });

    it('rejects a device signature when the contact has no stored device id', () => {
        calls.valid.add(DEVICE_KEY);

        expect(verifyFileTransferPacketFromSigner(packet({ senderDeviceId: DEVICE_ID }), signer({ deviceId: null }))).toBe(false);
        expect(uniqueKeys()).toEqual([ACCOUNT_KEY]);
    });

    it('rejects a device signature when the stored device key is missing or malformed', () => {
        calls.valid.add(DEVICE_KEY);

        expect(verifyFileTransferPacketFromSigner(packet({ senderDeviceId: DEVICE_ID }), signer({ devicePublicKey: null }))).toBe(false);
        expect(verifyFileTransferPacketFromSigner(packet({ senderDeviceId: DEVICE_ID }), signer({ devicePublicKey: 'zz' }))).toBe(false);
        expect(uniqueKeys()).toEqual([ACCOUNT_KEY]);
    });

    it('rejects when neither the account nor the device key validates the signature', () => {
        expect(verifyFileTransferPacketFromSigner(packet({ senderDeviceId: DEVICE_ID }), signer())).toBe(false);
        expect(uniqueKeys()).toEqual([ACCOUNT_KEY, DEVICE_KEY]);
    });

    it('rejects a signed packet without a known signer', () => {
        expect(verifyFileTransferPacketFromSigner(packet(), null)).toBe(false);
        expect(verifyFileTransferPacketFromSigner(packet(), {})).toBe(false);
        expect(calls.keys).toEqual([]);
    });

    it('keeps the device id inside the signed payload so canonical forms still match', () => {
        calls.valid.add(DEVICE_KEY);

        verifyFileTransferPacketFromSigner(packet({ senderDeviceId: DEVICE_ID }), signer());

        expect(calls.keys.at(-1)).toBe(DEVICE_KEY);
    });
});
