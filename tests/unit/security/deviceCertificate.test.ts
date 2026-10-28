import { describe, expect, it } from 'vitest';
import {
    certificatePayload,
    normalizeAddresses,
    parseCertificate,
    type AccountDeviceCertificate,
} from '../../../src/main_process/security/deviceCertificate.js';
import {
    verifyAccountRegistry,
    verifyDeviceAdmission,
    type AccountRegistry,
} from '../../../src/main_process/network/accountRegistry.js';

const account = '06'.repeat(32);
const publicKey = '11'.repeat(32);
const devicePublicKey = '22'.repeat(32);
const now = 1_800_000_000_000;

function certificate(): AccountDeviceCertificate {
    return {
        version: 1,
        accountUpeerId: account,
        accountPublicKey: publicKey,
        deviceId: '06'.repeat(32),
        devicePublicKey,
        platform: 'linux',
        capabilities: ['dht', 'location'],
        issuedAt: now - 1_000,
        expiresAt: now + 86_400_000,
        epoch: 4,
        signature: 'aa'.repeat(64),
    };
}

function registry(overrides: Partial<AccountRegistry> = {}): AccountRegistry {
    const device = certificate();
    return {
        version: 1,
        accountUpeerId: account,
        accountPublicKey: publicKey,
        epoch: 4,
        issuedAt: device.issuedAt,
        expiresAt: device.expiresAt,
        devices: [{
            deviceId: device.deviceId,
            devicePublicKey: device.devicePublicKey,
            platform: device.platform,
            capabilities: device.capabilities,
            authorizedAt: device.issuedAt,
            expiresAt: device.expiresAt,
            epoch: device.epoch,
        }],
        revoked: [],
        signature: 'bb'.repeat(64),
        ...overrides,
    };
}

describe('device certificates and account registries', () => {
    it('parses a well-formed certificate and preserves canonical fields', () => {
        const parsed = parseCertificate(certificate());
        if (!parsed) throw new Error('certificate was rejected');

        expect(parsed.deviceId).toBe('06'.repeat(32));
        expect(parsed.devicePublicKey).toBe(devicePublicKey);
        expect(certificatePayload(parsed)).toEqual({
            version: 1,
            accountUpeerId: account,
            accountPublicKey: publicKey,
            deviceId: '06'.repeat(32),
            devicePublicKey,
            issuedAt: now - 1_000,
            expiresAt: now + 86_400_000,
            epoch: 4,
            platform: 'linux',
            capabilities: ['dht', 'location'],
        });
    });

    it('rejects certificates whose device id does not derive from the key', () => {
        expect(parseCertificate({ ...certificate(), deviceId: '33'.repeat(32) })).toBeNull();
        expect(parseCertificate({ ...certificate(), signature: 'aa' })).toBeNull();
    });

    it('verifies a matching registry and device admission', () => {
        const parsedRegistry = verifyAccountRegistry(registry(), account, now);
        const parsedCertificate = parseCertificate(certificate());

        expect(parsedRegistry).not.toBeNull();
        expect(parsedCertificate).not.toBeNull();
        if (!parsedRegistry || !parsedCertificate) throw new Error('registry or certificate was rejected');
        expect(verifyDeviceAdmission(parsedCertificate, parsedRegistry, now)).toBe(true);
    });

    it('rejects revoked devices and mismatched certificate epochs', () => {
        const revoked = registry({
            revoked: [{ deviceId: '06'.repeat(32), revokedAt: now, reason: 'lost' }],
        });

        expect(verifyDeviceAdmission(certificate(), revoked, now)).toBe(false);
        expect(verifyDeviceAdmission({ ...certificate(), epoch: 5 }, registry(), now)).toBe(false);
    });

    it('treats capabilities as a set when admitting a device', () => {
        const parsedRegistry = verifyAccountRegistry(registry(), account, now);
        if (!parsedRegistry) throw new Error('registry was rejected');

        expect(verifyDeviceAdmission(
            { ...certificate(), capabilities: ['location', 'dht'] },
            parsedRegistry,
            now,
        )).toBe(true);
        expect(verifyDeviceAdmission(
            { ...certificate(), capabilities: ['DHT', ' location ', 'dht'] },
            parsedRegistry,
            now,
        )).toBe(true);
        expect(verifyDeviceAdmission(
            { ...certificate(), capabilities: ['dht'] },
            parsedRegistry,
            now,
        )).toBe(false);
        expect(verifyDeviceAdmission(
            { ...certificate(), capabilities: ['dht', 'location', 'vault'] },
            parsedRegistry,
            now,
        )).toBe(false);
    });

    it('normalizes and sorts location addresses', () => {
        expect(normalizeAddresses({
            address: '200::2',
            addresses: ['200::2', ' 200::1 ', '200::2'],
        })).toEqual(['200::1', '200::2']);
        expect(normalizeAddresses({ address: '10.0.0.1' })).toBeNull();
    });
});
