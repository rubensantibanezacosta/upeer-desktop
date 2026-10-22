import sodium from 'sodium-native';
import { describe, expect, it } from 'vitest';
import { verifySelfSyncSignature } from '../../../src/main_process/network/sync/auth.js';
import { canonicalStringify } from '../../../src/main_process/network/utils.js';
import type { AccountDeviceCertificate } from '../../../src/main_process/security/deviceCertificate.js';

function signPayload(secretKey: Buffer, payload: Record<string, unknown>): string {
    const signature = Buffer.alloc(sodium.crypto_sign_BYTES);
    sodium.crypto_sign_detached(signature, Buffer.from(canonicalStringify(payload)), secretKey);
    return signature.toString('hex');
}

describe('Sync device packet authentication', () => {
    const publicKey = Buffer.alloc(sodium.crypto_sign_PUBLICKEYBYTES);
    const secretKey = Buffer.alloc(sodium.crypto_sign_SECRETKEYBYTES);
    sodium.crypto_sign_keypair(publicKey, secretKey);
    const certificate = {
        version: 1,
        accountUpeerId: 'a'.repeat(32),
        accountPublicKey: 'b'.repeat(64),
        deviceId: 'c'.repeat(64),
        devicePublicKey: publicKey.toString('hex'),
        issuedAt: 1,
        expiresAt: 2,
        epoch: 1,
        signature: 'd'.repeat(128),
    } as AccountDeviceCertificate;

    it('accepts a device signature over the canonical packet', () => {
        const data = {
            type: 'SYNC_HELLO',
            senderDeviceId: certificate.deviceId,
            senderDeviceCertificate: certificate,
            timestamp: 10,
            ack: false,
            isInternalSync: false,
        };
        const signature = signPayload(secretKey, {
            ...data,
            senderUpeerId: certificate.accountUpeerId,
            senderYggAddress: '200::1',
        });
        expect(verifySelfSyncSignature(
            data,
            certificate,
            signature,
            certificate.accountUpeerId,
            '200::1',
        )).toBe(true);
    });

    it('normalizes the signed packet before verification', () => {
        const data = {
            type: 'SYNC_HELLO',
            senderDeviceId: certificate.deviceId,
            senderDeviceCertificate: certificate,
            timestamp: 10,
            ack: false,
            isInternalSync: false,
        };
        const signature = signPayload(secretKey, {
            ...data,
            senderUpeerId: certificate.accountUpeerId,
            senderYggAddress: '200::1',
        });
        expect(verifySelfSyncSignature(
            { ...data, signature, senderUpeerId: certificate.accountUpeerId },
            certificate,
            signature,
            certificate.accountUpeerId,
            '200::1',
        )).toBe(true);
    });
});
