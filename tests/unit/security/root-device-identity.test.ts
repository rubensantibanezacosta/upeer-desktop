import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sodium from 'sodium-native';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.unmock('sodium-native');

import { deriveDeviceId } from '../../../src/main_process/security/deviceCertificate.js';
import { verifyDeviceCertificate } from '../../../src/main_process/security/deviceIdentity.js';
import {
    getDeviceIdentity,
    getDeviceIdentityStatus,
    resetDeviceIdentityCache,
} from '../../../src/main_process/security/deviceIdentity.js';
import { saveStoredDeviceIdentity } from '../../../src/main_process/security/deviceIdentityStorage.js';
import { getOrCreateDeviceKey } from '../../../src/main_process/security/identityStorage.js';
import {
    clearIdentityState,
    createMnemonicIdentity,
    initIdentity,
} from '../../../src/main_process/security/identity.js';
import { getIdentityMode, isDeviceOnlyMode } from '../../../src/main_process/security/identityMode.js';
import { identityState } from '../../../src/main_process/security/identityState.js';

let userDataPath = '';

const deviceFile = () => path.join(userDataPath, 'device-identity.enc');

const readStoredPlaintext = (): { secretKey?: unknown; certificate?: unknown } | null => {
    const blob = fs.readFileSync(deviceFile());
    const nonce = blob.subarray(0, sodium.crypto_secretbox_NONCEBYTES);
    const cipher = blob.subarray(sodium.crypto_secretbox_NONCEBYTES);
    const plain = Buffer.alloc(cipher.length - sodium.crypto_secretbox_MACBYTES);
    const deviceKey = getOrCreateDeviceKey(userDataPath);
    if (!sodium.crypto_secretbox_open_easy(plain, cipher, nonce, deviceKey)) return null;
    return JSON.parse(plain.toString('utf8')) as { secretKey?: unknown; certificate?: unknown };
};

describe('identidad raíz con clave de dispositivo propia', () => {
    beforeEach(() => {
        userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'upeer-root-device-'));
        clearIdentityState();
        resetDeviceIdentityCache();
        initIdentity(userDataPath);
        createMnemonicIdentity();
    });

    afterEach(() => {
        resetDeviceIdentityCache();
        clearIdentityState();
        identityState.userDataPath = '';
        fs.rmSync(userDataPath, { recursive: true, force: true });
    });

    it('sigue en modo raíz y no en modo dispositivo', () => {
        expect(getIdentityMode()).toBe('root');
        expect(isDeviceOnlyMode()).toBe(false);
        expect(getDeviceIdentityStatus()).toBe('root');
    });

    it('genera una clave de dispositivo distinta de la raíz', () => {
        const identity = getDeviceIdentity();
        const rootSecret = identityState.secretKey;

        expect(identity).not.toBeNull();
        expect(rootSecret).not.toBeNull();
        expect(identity?.publicKey).not.toBe(rootSecret?.subarray(32).toString('hex'));
        expect(identity?.secretKey.equals(rootSecret as Buffer)).toBe(false);
        expect(identity?.deviceId).toBe(deriveDeviceId(identity?.publicKey as string));
    });

    it('firma el certificado con la raíz, no con la clave de dispositivo', () => {
        const identity = getDeviceIdentity();
        const certificate = identity?.certificate;

        expect(certificate).toBeDefined();
        expect(certificate?.accountUpeerId).toBe(identityState.upeerId);
        expect(certificate?.accountPublicKey).toBe(identityState.publicKey?.toString('hex'));
        expect(certificate?.devicePublicKey).toBe(identity?.publicKey);
        expect(verifyDeviceCertificate(certificate, identityState.upeerId)).not.toBeNull();
    });

    it('no guarda la raíz en el fichero de la identidad de dispositivo', () => {
        const identity = getDeviceIdentity();
        const stored = readStoredPlaintext();
        const rootSecret = identityState.secretKey as Buffer;

        expect(stored).not.toBeNull();
        expect(stored?.secretKey).toBe(identity?.secretKey.toString('hex'));
        expect(stored?.secretKey).not.toBe(rootSecret.toString('hex'));
    });

    it('emite el certificado con capacidades canónicas', () => {
        const capabilities = getDeviceIdentity()?.certificate.capabilities;

        expect(capabilities).toEqual(['dht', 'location']);
        expect(capabilities).toEqual([...capabilities as string[]].sort());
    });

    it('reutiliza la misma clave de dispositivo tras reiniciar', () => {
        const first = getDeviceIdentity();
        resetDeviceIdentityCache();

        const second = getDeviceIdentity();

        expect(second?.publicKey).toBe(first?.publicKey);
        expect(second?.certificate.issuedAt).toBe(first?.certificate.issuedAt);
    });

    it('descarta una identidad de dispositivo que era la raíz y emite una nueva', () => {
        const identity = getDeviceIdentity();
        const rootSecret = identityState.secretKey as Buffer;
        resetDeviceIdentityCache();
        saveStoredDeviceIdentity(rootSecret, identity?.certificate as never);

        const migrated = getDeviceIdentity();

        expect(migrated).not.toBeNull();
        expect(migrated?.secretKey.equals(rootSecret)).toBe(false);
        expect(migrated?.publicKey).not.toBe(rootSecret.subarray(32).toString('hex'));
        expect(readStoredPlaintext()?.secretKey).toBe(migrated?.secretKey.toString('hex'));
        expect(verifyDeviceCertificate(migrated?.certificate, identityState.upeerId)).not.toBeNull();
    });

    it('reutiliza la clave de dispositivo tras reiniciar el proceso entero', () => {
        const first = getDeviceIdentity();
        clearIdentityState();
        resetDeviceIdentityCache();

        initIdentity(userDataPath);

        expect(fs.existsSync(deviceFile())).toBe(true);
        expect(getDeviceIdentity()?.publicKey).toBe(first?.publicKey);
        expect(getDeviceIdentity()?.certificate.signature).toBe(first?.certificate.signature);
    });
});
