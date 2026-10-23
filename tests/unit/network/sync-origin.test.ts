import crypto from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const accountUpeerId = 'a'.repeat(64);
const deviceId = '06'.repeat(32);

const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519');
const rawPublicKey = (publicKey.export({ type: 'spki', format: 'der' }) as Buffer).subarray(-32).toString('hex');
const devicePublicKey = rawPublicKey;

const certificate = {
    version: 1,
    accountUpeerId,
    accountPublicKey: 'b'.repeat(64),
    deviceId,
    devicePublicKey,
    issuedAt: 1_000,
    expiresAt: 2_000,
    epoch: 1,
    signature: 'd'.repeat(128),
};

vi.mock('../../../src/main_process/network/sync/auth.js', () => ({
    getMySyncIdentity: vi.fn(() => ({
        deviceId,
        devicePublicKey,
        certificate,
        signedPreKey: { spkPub: devicePublicKey, spkSig: 'e'.repeat(128), spkId: 1 },
    })),
}));

vi.mock('../../../src/main_process/security/deviceMessaging.js', () => ({
    signWithDevice: vi.fn((payload: Buffer) => crypto.sign(null, payload, privateKey)),
    verifyDeviceSignature: vi.fn((payload: Buffer, signatureHex: string, publicKeyHex: string) => {
        try {
            const key = crypto.createPublicKey({
                key: Buffer.concat([
                    Buffer.from('302a300506032b6570032100', 'hex'),
                    Buffer.from(publicKeyHex, 'hex'),
                ]),
                format: 'der',
                type: 'spki',
            });
            return crypto.verify(null, payload, key, Buffer.from(signatureHex, 'hex'));
        } catch {
            return false;
        }
    }),
}));

vi.mock('../../../src/main_process/security/deviceIdentity.js', () => ({
    verifyDeviceCertificate: vi.fn((value: { accountUpeerId: string; issuedAt: number; expiresAt: number }, account: string, at: number) => (
        value.accountUpeerId === account && value.issuedAt <= at && value.expiresAt > at
    )),
}));

import { signSyncEventOrigin, verifySyncEventOrigin } from '../../../src/main_process/network/sync/origin.js';
import type { SyncPlainEvent } from '../../../src/main_process/network/sync/types.js';

const event: SyncPlainEvent = {
    eventId: 'event-1',
    kind: 'MESSAGE_UPSERT',
    occurredAt: 1_500,
    sequence: 3,
    payload: { id: 'm1', message: 'hola' },
};

describe('Sync event origin signature', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('signs the event with the local device certificate', () => {
        const signed = signSyncEventOrigin(event);
        expect(signed.originDeviceId).toBe(deviceId);
        expect(signed.originSignature).toMatch(/^[0-9a-f]{128}$/);
        expect(signed.originCertificate).toEqual(certificate);
    });

    it('verifies a signature produced by the origin device', () => {
        const signed = signSyncEventOrigin(event);
        expect(verifySyncEventOrigin(signed, accountUpeerId, 1_600)).toBe(true);
    });

    it('rejects a tampered payload', () => {
        const signed = signSyncEventOrigin(event);
        const tampered = { ...signed, payload: { ...signed.payload, message: 'alterado' } };
        expect(verifySyncEventOrigin(tampered, accountUpeerId, 1_600)).toBe(false);
    });

    it('rejects events without an origin signature', () => {
        expect(verifySyncEventOrigin({ ...event, originDeviceId: deviceId }, accountUpeerId, 1_600)).toBe(false);
    });

    it('rejects a certificate bound to another device identifier', () => {
        const signed = signSyncEventOrigin(event);
        expect(verifySyncEventOrigin({ ...signed, originDeviceId: 'f'.repeat(64) }, accountUpeerId, 1_600)).toBe(false);
    });

    it('rejects a certificate issued for another account', () => {
        const signed = signSyncEventOrigin(event);
        expect(verifySyncEventOrigin(signed, 'e'.repeat(64), 1_600)).toBe(false);
    });

    it('verifies backlog events against the validity window at signing time', () => {
        const signed = signSyncEventOrigin(event);
        expect(verifySyncEventOrigin(signed, accountUpeerId, 10_000)).toBe(true);
    });
});
