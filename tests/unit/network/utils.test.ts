import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as utils from '../../../src/main_process/network/utils';
import * as identity from '../../../src/main_process/security/identity';
import sodium from 'sodium-native';

import * as yggstack from '../../../src/main_process/sidecars/yggstack';
import * as dhtShared from '../../../src/main_process/network/dht/shared';

vi.mock('../../../src/main_process/security/identity');
vi.mock('../../../src/main_process/security/secure-logger');
vi.mock('../../../src/main_process/sidecars/yggstack');
vi.mock('../../../src/main_process/network/dht/shared');

import os from 'node:os';
vi.mock('node:os', () => ({
    default: {
        networkInterfaces: vi.fn()
    },
    networkInterfaces: vi.fn()
}));

describe('Network Utils', () => {
    const myId = 'my-upeer-id';
    const myPk = Buffer.alloc(sodium.crypto_sign_PUBLICKEYBYTES);
    const mySk = Buffer.alloc(sodium.crypto_sign_SECRETKEYBYTES);
    sodium.crypto_sign_keypair(myPk, mySk);
    const myPkHex = myPk.toString('hex');

    beforeEach(() => {
        vi.clearAllMocks();

        vi.mocked(identity.getMyUPeerId).mockReturnValue(myId);
        vi.mocked(identity.getMyDeviceId).mockReturnValue('device-1');
        vi.mocked(identity.getMyAlias).mockReturnValue('Alice');
        vi.mocked(identity.sign).mockImplementation((data: Buffer) => {
            const sig = Buffer.alloc(sodium.crypto_sign_BYTES);
            sodium.crypto_sign_detached(sig, data, mySk);
            return sig;
        });
        vi.mocked(identity.verify).mockImplementation((msg, sig, pk) => {
            return sodium.crypto_sign_verify_detached(sig, msg, pk);
        });
    });

    describe('validateAddress', () => {
        it('should validate IPv4', () => {
            expect(() => utils.validateAddress('127.0.0.1')).not.toThrow();
            expect(() => utils.validateAddress('192.168.1.1')).not.toThrow();
        });

        it('should validate IPv6/Yggdrasil', () => {
            expect(() => utils.validateAddress('200:1234::1')).not.toThrow();
            expect(() => utils.validateAddress('::1')).not.toThrow();
        });

        it('should throw on invalid address', () => {
            expect(() => utils.validateAddress('not-an-ip')).toThrow();
            expect(() => utils.validateAddress('123.456.789.0')).toThrow();
        });
    });

    describe('canonicalStringify', () => {
        it('should sort keys alphabetically', () => {
            const obj = { b: 2, a: 1, c: { e: 5, d: 4 } };
            const expected = '{"a":1,"b":2,"c":{"d":4,"e":5}}';
            expect(utils.canonicalStringify(obj)).toBe(expected);
        });

        it('should handle arrays', () => {
            const obj = { a: [3, 2, 1] };
            const expected = '{"a":[3,2,1]}';
            expect(utils.canonicalStringify(obj)).toBe(expected);
        });

        it('should handle null and simple types', () => {
            expect(utils.canonicalStringify(null)).toBe('null');
            expect(utils.canonicalStringify(123)).toBe('123');
            expect(utils.canonicalStringify("test")).toBe('"test"');
        });
    });

    describe('Renewal Tokens', () => {
        it('should generate and verify a renewal token', () => {
            const token = utils.generateRenewalToken('target-id', 5);
            expect(token.targetId).toBe('target-id');
            expect(token.maxRenewals).toBe(5);

            const isValid = utils.verifyRenewalToken(token, myPkHex);
            expect(isValid).toBe(true);
        });

        it('should fail verification if token is tampered', () => {
            const token = utils.generateRenewalToken('target-id', 5);
            // Tamper with a SIGNED field (maxRenewals)
            token.maxRenewals = 10;
            const isValid = utils.verifyRenewalToken(token, myPkHex);
            expect(isValid).toBe(false);
        });

        it('should NOT fail verification if renewalsUsed is incremented (BUG AF fix)', () => {
            const token = utils.generateRenewalToken('target-id', 5);
            // Simulate a network peer incrementing the counter
            token.renewalsUsed = 1;
            const isValid = utils.verifyRenewalToken(token, myPkHex);
            // This MUST be true because renewalsUsed is excluded from signature (it's mutable)
            expect(isValid).toBe(true);
        });
    });

    describe('DHT Sequence Validation (BUG BG fix)', () => {
        it('should allow initial jump from 0 without PoW', () => {
            const result = utils.validateDhtSequence(0, 1000);
            expect(result.valid).toBe(true);
            expect(result.requiresPoW).toBe(false);
        });

        it('should require PoW for large sequence jumps', () => {
            // MAX_DHT_SEQ_JUMP is 24h (86400000)
            const result = utils.validateDhtSequence(100, 100 + 86400000 + 1);
            expect(result.valid).toBe(false);
            expect(result.requiresPoW).toBe(true);
        });
    });

    describe('Location Block Renewal', () => {
        it('should renew a location block correctly', () => {
            const initialBlock = utils.generateSignedLocationBlock('1.1.1.1', 1, -1000);
            const canRenew = utils.canRenewLocationBlock(initialBlock, myPkHex);
            expect(canRenew).toBe(true);

            const renewed = utils.renewLocationBlock(initialBlock, myPkHex);
            expect(renewed).not.toBeNull();
            if (renewed && renewed.renewalToken) {
                expect(renewed.address).toBe('1.1.1.1');
                expect(renewed.renewalToken.renewalsUsed).toBe(1);

                // Un bloque expirado ya no es válido para verifyLocationBlock (ATAJO DE RENEWAL ELIMINADO POR SEGURIDAD)
                const isValid = utils.verifyLocationBlock(myId, renewed as any, myPkHex);
                expect(isValid).toBe(false);
            }
        });
    });

    describe('prioritizeYggdrasil', () => {
        it('should put Yggdrasil/IPv6 before IPv4', () => {
            const list = ['192.168.1.1', '200:1::1', '127.0.0.1'];
            const sorted = list.sort(utils.prioritizeYggdrasil);
            expect(sorted[0]).toBe('200:1::1');
        });
    });

    describe('Location Block Signing and Verification', () => {
        it('should generate and verify a signed location block without renewal token', () => {
            const block = utils.generateSignedLocationBlock('200:1::1', 1, undefined, null as any);
            const isValid = utils.verifyLocationBlock(myId, block, myPkHex);
            expect(isValid).toBe(true);
        });

        it('should verify with correct sorting (prioritizeYggdrasil)', () => {
            const addresses = ['192.168.1.1', '200:1::1'];
            const block = utils.generateSignedLocationBlock(addresses, 1);
            const isValid = utils.verifyLocationBlock(myId, block, myPkHex);
            expect(isValid).toBe(true);
        });

        it('should reject expired block even if signature is valid', () => {
            const block = utils.generateSignedLocationBlock('200:1::1', 1, -1000, null as any);
            const isValid = utils.verifyLocationBlock(myId, block, myPkHex);
            expect(isValid).toBe(false);
        });

        it('should reject tampered block even if renewal token is valid (expired)', () => {
            const block = utils.generateSignedLocationBlock('200:1::1', 1, -1000);
            const maliciousBlock = { ...block, address: '66.66.66.66', addresses: ['66.66.66.66'] };
            const isValid = utils.verifyLocationBlock(myId, maliciousBlock, myPkHex);
            expect(isValid).toBe(false);
        });
    });

    describe('safeBufferFromHex', () => {
        it('should convert valid hex to Buffer', () => {
            const buf = utils.safeBufferFromHex('deadbeef');
            expect(buf.toString('hex')).toBe('deadbeef');
        });

        it('should validate length if provided', () => {
            expect(() => utils.safeBufferFromHex('deadbeef', 4)).not.toThrow();
            expect(() => utils.safeBufferFromHex('deadbeef', 5)).toThrow(/Invalid length/);
        });

        it('should throw on invalid hex', () => {
            expect(() => utils.safeBufferFromHex('not-hex')).toThrow(/Invalid hex string/);
        });
    });

    describe('getNetworkAddresses', () => {
        it('should return Yggdrasil address if available', () => {
            vi.mocked(yggstack.getYggstackAddress).mockReturnValue('200:test::1');
            vi.mocked(os.networkInterfaces).mockReturnValue({});

            const addresses = utils.getNetworkAddresses();
            expect(addresses).toContain('200:test::1');
        });

        it('should scan network interfaces', () => {
            vi.mocked(os.networkInterfaces).mockReturnValue({
                eth0: [
                    { address: '192.168.1.10', family: 'IPv4', internal: false, netmask: '255.255.255.0', mac: '00:00:00:00:00:00', scopeid: 0 },
                    { address: 'fe80::1', family: 'IPv6', internal: false, netmask: 'ffff:ffff:ffff:ffff::', mac: '00:00:00:00:00:00', scopeid: 0 },
                    { address: '201:test::2', family: 'IPv6', internal: false, netmask: 'ffff:ffff:ffff:ffff::', mac: '00:00:00:00:00:00', scopeid: 0 }
                ],
                lo: [
                    { address: '127.0.0.1', family: 'IPv4', internal: true, netmask: '255.0.0.0', mac: '00:00:00:00:00:00', scopeid: 0 }
                ]
            } as any);

            const addresses = utils.getNetworkAddresses();
            expect(addresses).toContain('192.168.1.10');
            expect(addresses).toContain('fe80::1');
            expect(addresses).toContain('201:test::2');
            expect(addresses).not.toContain('127.0.0.1');
        });
    });

    describe('DHT Renewal Token store/find', () => {
        const mockKademlia = {
            storeValue: vi.fn().mockResolvedValue(true),
            findValue: vi.fn()
        };

        beforeEach(() => {
            (dhtShared.getKademliaInstance as any).mockReturnValue(mockKademlia as any);
        });

        it('should store renewal token in DHT', async () => {
            const token = utils.generateRenewalToken('target-id');
            const success = await utils.storeRenewalTokenInDHT(token);
            expect(success).toBe(true);
            expect(mockKademlia.storeValue).toHaveBeenCalled();
        });

        it('should find renewal token in DHT', async () => {
            const token = utils.generateRenewalToken('target-id');
            mockKademlia.findValue.mockResolvedValue({ value: token });

            const found = await utils.findRenewalTokenInDHT('target-id');
            expect(found).toEqual(token);
        });

        it('should return null if token not found in DHT', async () => {
            mockKademlia.findValue.mockResolvedValue(null);
            const found = await utils.findRenewalTokenInDHT('target-id');
            expect(found).toBeNull();
        });
    });

    describe('Enhanced Renewal with DHT', () => {
        const mockKademlia = {
            findValue: vi.fn()
        };

        beforeEach(() => {
            vi.mocked(dhtShared.getKademliaInstance).mockReturnValue(mockKademlia as any);
        });

        it('should canRenewLocationBlockWithDHT with local token', async () => {
            const token = utils.generateRenewalToken('target-id');
            const canRenew = await utils.canRenewLocationBlockWithDHT({ renewalToken: token }, myPkHex, 'target-id');
            expect(canRenew).toBe(true);
        });

        it('should canRenewLocationBlockWithDHT with DHT token', async () => {
            const token = utils.generateRenewalToken('target-id');
            mockKademlia.findValue.mockResolvedValue({ value: token });

            const canRenew = await utils.canRenewLocationBlockWithDHT({}, myPkHex, 'target-id');
            expect(canRenew).toBe(true);
        });
    });

    describe('validateDhtSequence', () => {
        it('should allow progressive sequence', () => {
            expect(utils.validateDhtSequence(100, 101).valid).toBe(true);
        });

        it('should detect rollback', () => {
            const res = utils.validateDhtSequence(100, 99);
            expect(res.valid).toBe(false);
            expect(res.reason).toContain('rollback');
        });

        it('should detect large jump and require PoW', () => {
            const largeJump = utils.MAX_DHT_SEQ_JUMP + 1;
            const res = utils.validateDhtSequence(100, 100 + largeJump);
            expect(res.valid).toBe(false);
            expect(res.requiresPoW).toBe(true);
        });
    });
});
