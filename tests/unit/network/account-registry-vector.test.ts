import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.unmock('sodium-native');

import {
    accountRegistrySignedPayload,
    verifyAccountRegistry,
    verifyDeviceAdmission,
} from '../../../src/main_process/network/accountRegistry.js';
import { verifyDeviceCertificate } from '../../../src/main_process/security/deviceIdentity.js';

type RegistryVector = {
    generatedBy: string;
    now: number;
    accountSecretKeySeed: string;
    accountPublicKey: string;
    accountUpeerId: string;
    certificates: string[];
    revoked: string[];
    registry: string;
    signedPayload: string;
};

const vector = JSON.parse(
    fs.readFileSync(path.resolve('tests/fixtures/account-registry-go.json'), 'utf8'),
) as RegistryVector;

const verifiedRegistry = () => {
    const registry = verifyAccountRegistry(JSON.parse(vector.registry) as unknown, vector.accountUpeerId, vector.now);
    if (!registry) throw new Error('el registro del vector no verifica');
    return registry;
};

const mobileCertificate = () => {
    const certificate = verifyDeviceCertificate(vector.certificates[0], vector.accountUpeerId, vector.now);
    if (!certificate) throw new Error('el certificado del móvil no verifica');
    return certificate;
};

describe('vector Go del registro de cuenta', () => {
    afterEach(() => {
        vi.useRealTimers();
    });

    it('declara el generador esperado', () => {
        expect(vector.generatedBy).toBe('upper-transport-bridge');
    });

    it('acepta el registro que firma el puente', () => {
        const verified = verifyAccountRegistry(JSON.parse(vector.registry) as unknown, vector.accountUpeerId, vector.now);

        expect(verified).not.toBeNull();
        expect(verified?.accountUpeerId).toBe(vector.accountUpeerId);
        expect(verified?.accountPublicKey).toBe(vector.accountPublicKey);
        expect(verified?.epoch).toBe(2);
    });

    it('reconstruye byte a byte el sobre que firmó Go', () => {
        const verified = verifiedRegistry();

        expect(accountRegistrySignedPayload(verified)).toBe(vector.signedPayload);
    });

    it('conserva la clave estática del dispositivo móvil', () => {
        const verified = verifyAccountRegistry(JSON.parse(vector.registry) as unknown, vector.accountUpeerId, vector.now);
        const mobile = verified?.devices.find((device) => device.platform === 'android');

        expect(mobile?.staticX25519PublicKey).toBe('6d1c2c3f4a5b6c7d8e9f0a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f');
        expect(mobile?.capabilities).toEqual(['chat', 'dht', 'vault']);
    });

    it('respeta los dispositivos revocados que viajan en el registro', () => {
        const verified = verifyAccountRegistry(JSON.parse(vector.registry) as unknown, vector.accountUpeerId, vector.now);

        expect(verified?.revoked.map((item) => item.deviceId)).toEqual(vector.revoked);
        expect(verified?.revoked[0]?.reason).toBe('dispositivo perdido');
    });

    it('rechaza el registro si se cambia la época', () => {
        const tampered = JSON.parse(vector.registry) as Record<string, unknown>;
        tampered.epoch = 3;

        expect(verifyAccountRegistry(tampered, vector.accountUpeerId, vector.now)).toBeNull();
    });

    it('rechaza el registro si se cambia la clave estática del móvil', () => {
        const tampered = JSON.parse(vector.registry) as {
            devices: Array<Record<string, unknown>>;
        };
        tampered.devices[0].staticX25519PublicKey = 'f'.repeat(64);

        expect(verifyAccountRegistry(tampered, vector.accountUpeerId, vector.now)).toBeNull();
    });

    it('acepta los certificados que emitió el puente', () => {
        expect(vector.certificates).toHaveLength(2);
        for (const encoded of vector.certificates) {
            const certificate = verifyDeviceCertificate(encoded, vector.accountUpeerId, vector.now);
            expect(certificate).not.toBeNull();
            expect(certificate?.accountUpeerId).toBe(vector.accountUpeerId);
        }
    });

    it('conserva la clave estática en el certificado del móvil', () => {
        const mobile = verifyDeviceCertificate(vector.certificates[0], vector.accountUpeerId, vector.now);

        expect(mobile?.platform).toBe('android');
        expect(mobile?.staticX25519PublicKey).toBe('6d1c2c3f4a5b6c7d8e9f0a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f');
    });

    it('rechaza el certificado si se cambia la clave estática', () => {
        const tampered = JSON.parse(vector.certificates[0]) as Record<string, unknown>;
        tampered.staticX25519PublicKey = 'f'.repeat(64);

        expect(verifyDeviceCertificate(tampered, vector.accountUpeerId, vector.now)).toBeNull();
    });

    it('admite al móvil contra el registro con su certificado', () => {
        expect(verifyDeviceAdmission(mobileCertificate(), verifiedRegistry(), vector.now)).toBe(true);
    });

    it('no admite un certificado cuya clave estática no está en el registro', () => {
        const registryWithoutKey = JSON.parse(JSON.stringify(verifiedRegistry())) as { devices: Array<Record<string, unknown>> };
        delete registryWithoutKey.devices[0].staticX25519PublicKey;

        expect(verifyDeviceAdmission(mobileCertificate(), registryWithoutKey as never, vector.now)).toBe(false);
    });

    it('rechaza el registro de otra cuenta', () => {
        expect(verifyAccountRegistry(JSON.parse(vector.registry) as unknown, 'a'.repeat(64), vector.now)).toBeNull();
    });

    it('rechaza el registro cuando la ventana ya venció', () => {
        const later = vector.now + 8 * 24 * 60 * 60 * 1000;

        expect(verifyAccountRegistry(JSON.parse(vector.registry) as unknown, vector.accountUpeerId, later)).toBeNull();
    });

    it('acepta el registro mientras siga vigente', () => {
        const almost = vector.now + 23 * 60 * 60 * 1000;

        expect(verifyAccountRegistry(JSON.parse(vector.registry) as unknown, vector.accountUpeerId, almost)).not.toBeNull();
    });
});
