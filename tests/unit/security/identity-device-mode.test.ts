import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sodium from 'sodium-native';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.unmock('sodium-native');

import { canonicalStringify } from '../../../src/main_process/network/cryptoUtils.js';
import {
    certificatePayload,
    deriveDeviceId,
    type AccountDeviceCertificate,
} from '../../../src/main_process/security/deviceCertificate.js';
import {
    getDeviceIdentity,
    getDeviceIdentityStatus,
    installDeviceCertificate,
    resetDeviceIdentityCache,
} from '../../../src/main_process/security/deviceIdentity.js';
import { getUPeerIdFromPublicKey } from '../../../src/main_process/security/identityCrypto.js';
import {
    clearIdentityState,
    decryptSealed,
    decryptX3DH,
    getMyIdentitySkBuffer,
    getMySignedPreKey,
    getMyUPeerId,
    initIdentity,
    isLocked,
    isMnemonicMode,
    lockSession,
    sign,
    unlockWithMnemonic,
} from '../../../src/main_process/security/identity.js';
import {
    clearAccountPublicIdentity,
    enableDeviceOnlyMode,
    getIdentityMode,
    isDeviceOnlyMode,
    loadAccountPublicIdentity,
    RootIdentityUnavailableError,
} from '../../../src/main_process/security/identityMode.js';
import { identityState } from '../../../src/main_process/security/identityState.js';

const MNEMONIC = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

let userDataPath = '';
let account: { publicKey: Buffer; secretKey: Buffer; upeerId: string };

function createAccount(): { publicKey: Buffer; secretKey: Buffer; upeerId: string } {
    const publicKey = Buffer.alloc(sodium.crypto_sign_PUBLICKEYBYTES);
    const secretKey = Buffer.alloc(sodium.crypto_sign_SECRETKEYBYTES);
    sodium.crypto_sign_keypair(publicKey, secretKey);
    return { publicKey, secretKey, upeerId: getUPeerIdFromPublicKey(publicKey) };
}

function createDeviceKeypair(): { publicKey: Buffer; secretKey: Buffer } {
    const publicKey = Buffer.alloc(sodium.crypto_sign_PUBLICKEYBYTES);
    const secretKey = Buffer.alloc(sodium.crypto_sign_SECRETKEYBYTES);
    sodium.crypto_sign_keypair(publicKey, secretKey);
    return { publicKey, secretKey };
}

function issueCertificate(
    devicePublicKey: Buffer,
    options: { issuer?: Buffer; issuedAt?: number; expiresAt?: number } = {},
): AccountDeviceCertificate {
    const now = Date.now();
    const certificate: AccountDeviceCertificate = {
        version: 1,
        accountUpeerId: account.upeerId,
        accountPublicKey: account.publicKey.toString('hex'),
        deviceId: deriveDeviceId(devicePublicKey.toString('hex')) as string,
        devicePublicKey: devicePublicKey.toString('hex'),
        platform: 'linux',
        capabilities: ['dht'],
        issuedAt: options.issuedAt ?? now - 1_000,
        expiresAt: options.expiresAt ?? now + 86_400_000,
        epoch: 1,
        signature: '',
    };
    const signature = Buffer.alloc(sodium.crypto_sign_BYTES);
    sodium.crypto_sign_detached(
        signature,
        Buffer.from(canonicalStringify(certificatePayload(certificate))),
        options.issuer ?? account.secretKey,
    );
    certificate.signature = signature.toString('hex');
    return certificate;
}

function enableDeviceMode(): void {
    expect(enableDeviceOnlyMode(userDataPath, {
        accountUpeerId: account.upeerId,
        accountPublicKey: account.publicKey.toString('hex'),
    })).toBe(true);
}

beforeEach(() => {
    userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'upeer-device-mode-'));
    clearIdentityState();
    resetDeviceIdentityCache();
    account = createAccount();
});

afterEach(() => {
    resetDeviceIdentityCache();
    clearIdentityState();
    clearAccountPublicIdentity(userDataPath);
    identityState.userDataPath = '';
    fs.rmSync(userDataPath, { recursive: true, force: true });
});

describe('modo de identidad sin raíz', () => {
    it('activa el modo dispositivo con la identidad pública de la cuenta', () => {
        enableDeviceMode();

        expect(getIdentityMode()).toBe('device');
        expect(isDeviceOnlyMode()).toBe(true);
        expect(isLocked()).toBe(false);
        expect(identityState.secretKey).toBeNull();
        expect(getMyUPeerId()).toBe(account.upeerId);
        expect(identityState.publicKey?.equals(account.publicKey)).toBe(true);
        expect(loadAccountPublicIdentity(userDataPath)).toEqual({
            accountUpeerId: account.upeerId,
            accountPublicKey: account.publicKey.toString('hex'),
        });
    });

    it('restaura el modo dispositivo al arrancar sin raíz', () => {
        enableDeviceMode();
        const device = createDeviceKeypair();
        installDeviceCertificate(device.secretKey.toString('hex'), issueCertificate(device.publicKey));
        clearIdentityState();
        resetDeviceIdentityCache();

        initIdentity(userDataPath);

        expect(getIdentityMode()).toBe('device');
        expect(isLocked()).toBe(false);
        expect(getMyUPeerId()).toBe(account.upeerId);
        expect(identityState.secretKey).toBeNull();
    });

    it('bloquea el arranque sin raíz cuando falta el certificado de dispositivo', () => {
        enableDeviceMode();
        clearIdentityState();
        resetDeviceIdentityCache();

        initIdentity(userDataPath);

        expect(getIdentityMode()).toBe('device');
        expect(isLocked()).toBe(true);
        expect(getDeviceIdentityStatus()).toBe('locked');
    });

    it('rechaza una cuenta cuya clave pública no deriva en el upeerId', () => {
        const other = createAccount();

        const enabled = enableDeviceOnlyMode(userDataPath, {
            accountUpeerId: account.upeerId,
            accountPublicKey: other.publicKey.toString('hex'),
        });

        expect(enabled).toBe(false);
        expect(getIdentityMode()).toBe('root');
        expect(loadAccountPublicIdentity(userDataPath)).toBeNull();
    });

    it('rechaza activar el modo dispositivo con una raíz cargada en memoria', () => {
        identityState.secretKey = createAccount().secretKey;

        expect(enableDeviceOnlyMode(userDataPath, {
            accountUpeerId: account.upeerId,
            accountPublicKey: account.publicKey.toString('hex'),
        })).toBe(false);
        expect(getIdentityMode()).toBe('root');
    });

    it('falla cerrado en las rutas que firman con la raíz', () => {
        enableDeviceMode();

        expect(() => sign(Buffer.from('payload'))).toThrow(RootIdentityUnavailableError);
        expect(() => getMyIdentitySkBuffer()).toThrow(RootIdentityUnavailableError);
        expect(() => getMySignedPreKey()).toThrow(RootIdentityUnavailableError);
        expect(decryptSealed(Buffer.alloc(sodium.crypto_box_SEALBYTES))).toBeNull();
        expect(decryptX3DH(Buffer.alloc(24), Buffer.alloc(32), Buffer.alloc(32), 1)).toBeNull();
    });

    it('no crea ni renueva certificados de dispositivo sin raíz', () => {
        enableDeviceMode();

        expect(getDeviceIdentity()).toBeNull();
        expect(getDeviceIdentityStatus()).toBe('renewal-required');
    });

    it('instala un certificado emitido por la cuenta', () => {
        enableDeviceMode();
        const device = createDeviceKeypair();
        const certificate = issueCertificate(device.publicKey);

        expect(installDeviceCertificate(device.secretKey.toString('hex'), certificate)).toBe(true);

        const identity = getDeviceIdentity();
        expect(identity?.deviceId).toBe(certificate.deviceId);
        expect(identity?.publicKey).toBe(certificate.devicePublicKey);
        expect(getDeviceIdentityStatus()).toBe('ready');
    });

    it('rechaza un certificado firmado por otra cuenta', () => {
        enableDeviceMode();
        const device = createDeviceKeypair();
        const certificate = issueCertificate(device.publicKey, { issuer: createAccount().secretKey });

        expect(installDeviceCertificate(device.secretKey.toString('hex'), certificate)).toBe(false);
        expect(getDeviceIdentity()).toBeNull();
    });

    it('rechaza un certificado emitido para otra clave de dispositivo', () => {
        enableDeviceMode();
        const device = createDeviceKeypair();
        const certificate = issueCertificate(createDeviceKeypair().publicKey);

        expect(installDeviceCertificate(device.secretKey.toString('hex'), certificate)).toBe(false);
    });

    it('rechaza un certificado expirado', () => {
        enableDeviceMode();
        const device = createDeviceKeypair();
        const now = Date.now();
        const certificate = issueCertificate(device.publicKey, {
            issuedAt: now - 30 * 24 * 60 * 60 * 1000,
            expiresAt: now - 24 * 60 * 60 * 1000,
        });

        expect(installDeviceCertificate(device.secretKey.toString('hex'), certificate)).toBe(false);
    });

    it('vuelve al modo raíz al importar la frase semilla', () => {
        enableDeviceMode();

        expect(unlockWithMnemonic(MNEMONIC)).toBe(true);

        expect(getIdentityMode()).toBe('root');
        expect(isMnemonicMode()).toBe(true);
        expect(isDeviceOnlyMode()).toBe(false);
        expect(loadAccountPublicIdentity(userDataPath)).toBeNull();
    });

    it('respeta el bloqueo explícito del dispositivo sin raíz', () => {
        enableDeviceMode();
        fs.writeFileSync(path.join(userDataPath, 'session.locked'), '1');
        clearIdentityState();

        initIdentity(userDataPath);

        expect(getIdentityMode()).toBe('device');
        expect(isLocked()).toBe(true);
        expect(getDeviceIdentityStatus()).toBe('locked');
    });

    it('prioriza el modo raíz cuando existe la frase semilla', () => {
        enableDeviceMode();
        fs.writeFileSync(path.join(userDataPath, 'identity.mnemonic_mode'), '1');
        clearIdentityState();

        initIdentity(userDataPath);

        expect(getIdentityMode()).toBe('root');
        expect(isLocked()).toBe(true);
    });

    it('bloquea el acceso al dispositivo al bloquear la sesión', () => {
        enableDeviceMode();
        const device = createDeviceKeypair();
        installDeviceCertificate(device.secretKey.toString('hex'), issueCertificate(device.publicKey));
        expect(getDeviceIdentity()).not.toBeNull();

        lockSession();

        expect(isLocked()).toBe(true);
        expect(getDeviceIdentity()).toBeNull();
        expect(getDeviceIdentityStatus()).toBe('locked');
    });

    it('un nuevo enrolamiento desbloquea el dispositivo y sobrevive al reinicio', () => {
        enableDeviceMode();
        const device = createDeviceKeypair();
        installDeviceCertificate(device.secretKey.toString('hex'), issueCertificate(device.publicKey));
        lockSession();
        expect(fs.existsSync(path.join(userDataPath, 'session.locked'))).toBe(true);

        expect(installDeviceCertificate(device.secretKey.toString('hex'), issueCertificate(device.publicKey))).toBe(true);
        expect(fs.existsSync(path.join(userDataPath, 'session.locked'))).toBe(false);
        expect(isLocked()).toBe(false);

        clearIdentityState();
        resetDeviceIdentityCache();
        initIdentity(userDataPath);

        expect(isLocked()).toBe(false);
        expect(getDeviceIdentityStatus()).toBe('ready');
    });
});
