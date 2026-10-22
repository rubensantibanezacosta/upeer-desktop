import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

vi.unmock('sodium-native');
import {
    verifyDeviceCertificate,
    verifyDeviceLocationBlock,
} from '../../../src/main_process/security/deviceIdentity.js';
import {
    accountRegistryKey,
    verifyAccountRegistry,
    verifyDeviceAdmission,
    type AccountRegistry,
} from '../../../src/main_process/network/accountRegistry.js';

type AccountVector = {
    generatedBy: string;
    now: number;
    accountPublicKey: string;
    accountUpeerId: string;
    devicePublicKey: string;
    deviceId: string;
    registryKey: string;
    certificate: Record<string, unknown>;
    registry: Record<string, unknown>;
    locationBlock: Record<string, unknown>;
};

const vector = JSON.parse(
    fs.readFileSync(path.resolve('tests/fixtures/dht-account-go.json'), 'utf8'),
) as AccountVector;

describe('account device interoperability', () => {
    it('verifica el certificado, registro, admisión y bloque generados por el bridge Go', () => {
        expect(vector.generatedBy).toBe('upper-transport-bridge');
        expect(accountRegistryKey(vector.accountUpeerId).toString('hex')).toBe(vector.registryKey);

        const certificate = verifyDeviceCertificate(vector.certificate, vector.accountUpeerId, vector.now);
        const registry = verifyAccountRegistry(vector.registry, vector.accountUpeerId, vector.now);

        expect(certificate).not.toBeNull();
        expect(registry).not.toBeNull();
        if (!certificate || !registry) throw new Error('Go vector was rejected');
        expect(certificate.deviceId).toBe(vector.deviceId);
        expect(certificate.devicePublicKey).toBe(vector.devicePublicKey);
        expect(verifyDeviceAdmission(certificate, registry, vector.now)).toBe(true);
        expect(verifyDeviceLocationBlock(
            vector.accountUpeerId,
            vector.locationBlock,
            vector.accountPublicKey,
            vector.now,
        )).toBe(true);
    });

    it('rechaza un bloque Go manipulado y un registro con epoch divergente', () => {
        const tampered = { ...vector.locationBlock, dhtSeq: Number(vector.locationBlock.dhtSeq) + 1 };
        expect(verifyDeviceLocationBlock(
            vector.accountUpeerId,
            tampered,
            vector.accountPublicKey,
            vector.now,
        )).toBe(false);

        const registry = verifyAccountRegistry(vector.registry, vector.accountUpeerId, vector.now);
        const certificate = verifyDeviceCertificate(vector.certificate, vector.accountUpeerId, vector.now);
        if (!registry || !certificate) throw new Error('Go vector was rejected');
        const diverged: AccountRegistry = { ...registry, epoch: registry.epoch + 1 };
        expect(verifyDeviceAdmission(certificate, diverged, vector.now)).toBe(true);
        const stale: AccountRegistry = { ...registry, epoch: registry.epoch - 1 };
        expect(verifyDeviceAdmission(certificate, stale, vector.now)).toBe(false);
    });
});
