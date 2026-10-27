import sodium from 'sodium-native';
import { describe, expect, it, vi } from 'vitest';

vi.unmock('sodium-native');

import { canonicalStringify } from '../../../src/main_process/network/utils.js';
import { verifyHandshakeSignature } from '../../../src/main_process/network/handlers/contactsShared.js';
import { certificatePayload, deriveDeviceId, type AccountDeviceCertificate } from '../../../src/main_process/security/deviceCertificate.js';
import { getUPeerIdFromPublicKey } from '../../../src/main_process/security/identityCrypto.js';

const ACCOUNT_SEED = 5;
const DEVICE_SEED = 9;
const NOW = Date.UTC(2026, 9, 27, 12, 0, 0);
const ADDRESS = '200::a1';

type KeyPair = { publicKey: string; secretKey: Buffer };

function keyPair(seed: number): KeyPair {
    const publicKey = Buffer.alloc(sodium.crypto_sign_PUBLICKEYBYTES);
    const secretKey = Buffer.alloc(sodium.crypto_sign_SECRETKEYBYTES);
    sodium.crypto_sign_seed_keypair(publicKey, secretKey, Buffer.alloc(32, seed));
    return { publicKey: publicKey.toString('hex'), secretKey };
}

function sign(payload: unknown, secretKey: Buffer): string {
    const signature = Buffer.alloc(sodium.crypto_sign_BYTES);
    sodium.crypto_sign_detached(signature, Buffer.from(canonicalStringify(payload)), secretKey);
    return signature.toString('hex');
}

function certificateFor(account: KeyPair, device: KeyPair): AccountDeviceCertificate {
    const deviceId = deriveDeviceId(device.publicKey) as string;
    const certificate: AccountDeviceCertificate = {
        version: 1,
        accountUpeerId: getUPeerIdFromPublicKey(Buffer.from(account.publicKey, 'hex')),
        accountPublicKey: account.publicKey,
        deviceId,
        devicePublicKey: device.publicKey,
        issuedAt: NOW - 60_000,
        expiresAt: NOW + 24 * 60 * 60 * 1000,
        epoch: 1,
        signature: '',
    };
    certificate.signature = sign(certificatePayload(certificate), account.secretKey);
    return certificate;
}

function deviceFields(account: KeyPair, device: KeyPair, certificate: AccountDeviceCertificate): Record<string, unknown> {
    const spkPublicKey = Buffer.alloc(sodium.crypto_sign_PUBLICKEYBYTES);
    const spkSecretKey = Buffer.alloc(sodium.crypto_sign_SECRETKEYBYTES);
    sodium.crypto_sign_keypair(spkPublicKey, spkSecretKey);
    const spkSignature = Buffer.alloc(sodium.crypto_sign_BYTES);
    sodium.crypto_sign_detached(spkSignature, spkPublicKey, device.secretKey);
    return {
        devicePublicKey: device.publicKey,
        deviceId: certificate.deviceId,
        deviceCertificate: certificate,
        deviceSignedPreKey: {
            spkPub: spkPublicKey.toString('hex'),
            spkSig: spkSignature.toString('hex'),
            spkId: NOW,
        },
    };
}

function linkedHandshake(
    account: KeyPair,
    device: KeyPair,
    certificate: AccountDeviceCertificate,
    type: 'HANDSHAKE_REQ' | 'HANDSHAKE_ACCEPT',
): { data: Record<string, unknown>; signature: string; senderUpeerId: string } {
    const senderUpeerId = getUPeerIdFromPublicKey(Buffer.from(account.publicKey, 'hex'));
    const data: Record<string, unknown> = {
        type,
        publicKey: account.publicKey,
        isInternalSync: false,
        alias: 'móvil',
        ...deviceFields(account, device, certificate),
    };
    const signature = sign({ ...data, senderUpeerId, senderYggAddress: ADDRESS }, device.secretKey);
    return { data, signature, senderUpeerId };
}

describe('verifyHandshakeSignature', () => {
    it('acepta un handshake firmado por el dispositivo con certificado válido', () => {
        const account = keyPair(ACCOUNT_SEED);
        const device = keyPair(DEVICE_SEED);
        const certificate = certificateFor(account, device);
        const request = linkedHandshake(account, device, certificate, 'HANDSHAKE_REQ');

        expect(verifyHandshakeSignature(request.data as never, request.signature, request.senderUpeerId, ADDRESS, 'request')).toBe(true);
    });

    it('acepta un HANDSHAKE_ACCEPT firmado por el dispositivo', () => {
        const account = keyPair(ACCOUNT_SEED);
        const device = keyPair(DEVICE_SEED);
        const certificate = certificateFor(account, device);
        const accept = linkedHandshake(account, device, certificate, 'HANDSHAKE_ACCEPT');

        expect(verifyHandshakeSignature(accept.data as never, accept.signature, accept.senderUpeerId, ADDRESS, 'accept')).toBe(true);
    });

    it('sigue aceptando el handshake de raíz sin campos de dispositivo', () => {
        const account = keyPair(ACCOUNT_SEED);
        const senderUpeerId = getUPeerIdFromPublicKey(Buffer.from(account.publicKey, 'hex'));
        const data = { type: 'HANDSHAKE_REQ', publicKey: account.publicKey, isInternalSync: false, alias: 'escritorio' };
        const signature = sign({ ...data, senderUpeerId, senderYggAddress: ADDRESS }, account.secretKey);

        expect(verifyHandshakeSignature(data as never, signature, senderUpeerId, ADDRESS, 'request')).toBe(true);
    });

    it('rechaza un certificado emitido para otra cuenta', () => {
        const account = keyPair(ACCOUNT_SEED);
        const foreignAccount = keyPair(ACCOUNT_SEED + 1);
        const device = keyPair(DEVICE_SEED);
        const certificate = certificateFor(foreignAccount, device);
        const request = linkedHandshake(account, device, certificate, 'HANDSHAKE_REQ');

        expect(verifyHandshakeSignature(request.data as never, request.signature, request.senderUpeerId, ADDRESS, 'request')).toBe(false);
    });

    it('rechaza un paquete manipulado después de firmarse', () => {
        const account = keyPair(ACCOUNT_SEED);
        const device = keyPair(DEVICE_SEED);
        const certificate = certificateFor(account, device);
        const request = linkedHandshake(account, device, certificate, 'HANDSHAKE_REQ');
        const tampered = { ...request.data, alias: 'suplantado' };

        expect(verifyHandshakeSignature(tampered as never, request.signature, request.senderUpeerId, ADDRESS, 'request')).toBe(false);
    });

    it('acepta la firma de la cuenta cuando lleva campos de dispositivo, como el escritorio con raíz', () => {
        const account = keyPair(ACCOUNT_SEED);
        const device = keyPair(DEVICE_SEED);
        const certificate = certificateFor(account, device);
        const request = linkedHandshake(account, device, certificate, 'HANDSHAKE_REQ');
        const accountSignature = sign(
            { ...request.data, senderUpeerId: request.senderUpeerId, senderYggAddress: ADDRESS },
            account.secretKey,
        );

        expect(verifyHandshakeSignature(request.data as never, accountSignature, request.senderUpeerId, ADDRESS, 'request')).toBe(true);
    });

    it('rechaza una firma de dispositivo que no es la del certificado', () => {
        const account = keyPair(ACCOUNT_SEED);
        const device = keyPair(DEVICE_SEED);
        const impostor = keyPair(DEVICE_SEED + 1);
        const certificate = certificateFor(account, device);
        const request = linkedHandshake(account, device, certificate, 'HANDSHAKE_REQ');
        const impostorSignature = sign(
            { ...request.data, senderUpeerId: request.senderUpeerId, senderYggAddress: ADDRESS },
            impostor.secretKey,
        );

        expect(verifyHandshakeSignature(request.data as never, impostorSignature, request.senderUpeerId, ADDRESS, 'request')).toBe(false);
    });
});
