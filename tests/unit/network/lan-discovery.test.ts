import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LanDiscovery, startLanDiscovery, stopLanDiscovery, getLanDiscovery } from '../../../src/main_process/network/lan/discovery.js';
import dgram from 'node:dgram';

// Mocks
vi.mock('node:dgram', () => ({
    default: {
        createSocket: vi.fn(),
    }
}));

vi.mock('../../../src/main_process/security/identity.js');
vi.mock('../../../src/main_process/storage/contacts/operations.js');
vi.mock('../../../src/main_process/security/secure-logger.js');
vi.mock('../../../src/main_process/network/utils.js', () => ({
    getNetworkAddresses: vi.fn().mockReturnValue(['201:1:1:1:1:1:1:1']),
    canonicalStringify: (obj: any) => JSON.stringify(obj),
    generateSignedLocationBlock: vi.fn().mockReturnValue({ address: '201:1:1:1:1:1:1:1', addresses: ['201:1:1:1:1:1:1:1'] }),
    getDeviceMetadata: vi.fn().mockReturnValue({ clientName: 'Test' }),
    isYggdrasilAddress: vi.fn((addr: string) => typeof addr === 'string' && addr.includes(':')),
}));

import * as identity from '../../../src/main_process/security/identity.js';
import * as contactsOps from '../../../src/main_process/storage/contacts/operations.js';
import * as netUtils from '../../../src/main_process/network/utils.js';
import * as logger from '../../../src/main_process/security/secure-logger.js';

describe('LAN Discovery', () => {
    let lan: LanDiscovery;
    let mockSocket: any;

    beforeEach(() => {
        vi.clearAllMocks();
        mockSocket = {
            on: vi.fn(),
            bind: vi.fn((_port, _addr, cb) => cb && cb()),
            addMembership: vi.fn(),
            dropMembership: vi.fn(),
            close: vi.fn(),
            send: vi.fn((_buf, _off, _len, _port, _addr, cb) => cb && cb()),
        };
        (dgram.createSocket as any).mockReturnValue(mockSocket);

        // Identity mocks
        (identity.getMyUPeerId as any).mockReturnValue('my-upeer-id');
        (identity.getMyPublicKey as any).mockReturnValue(Buffer.alloc(32));
        (identity.getMyEphemeralPublicKey as any).mockReturnValue(Buffer.alloc(32));
        (identity.getMyPublicKeyHex as any).mockReturnValue('00'.repeat(32));
        (identity.getMyEphemeralPublicKeyHex as any).mockReturnValue('11'.repeat(32));
        (identity.getMyDhtSeq as any).mockReturnValue(1);
        (identity.sign as any).mockReturnValue(Buffer.from('sig'));
        (identity.verify as any).mockReturnValue(true);
        (identity.getUPeerIdFromPublicKey as any).mockReturnValue('peer1');

        (contactsOps.isContactBlocked as any).mockReturnValue(false);

        lan = new LanDiscovery();
    });

    afterEach(() => {
        lan.stop();
    });

    it('should start and bind correctly', async () => {
        await lan.start();
        expect(dgram.createSocket).toHaveBeenCalledWith({ type: 'udp6', reuseAddr: true });
        expect(mockSocket.bind).toHaveBeenCalledWith(50006, '::', expect.any(Function));
        expect(mockSocket.addMembership).toHaveBeenCalledWith('ff02::1');
    });

    it('should handle start failures gracefully', async () => {
        mockSocket.bind.mockImplementationOnce((_p: any, _a: any, cb: any) => { throw new Error('Bind failed'); });
        await lan.start();
        expect(logger.warn).toHaveBeenCalledWith('Failed to start LAN discovery', expect.any(Error), 'lan');
        expect(lan.isActive()).toBe(false);
    });

    it('should validate and process a valid LAN message', async () => {
        await lan.start();
        const messageHandler = mockSocket.on.mock.calls.find((c: any) => c[0] === 'message')[1];

        const validMsg = {
            type: 'LAN_DISCOVERY_ANNOUNCE',
            upeerId: 'peer1',
            publicKey: '00'.repeat(32),
            address: '200:0001:0001:0001:0001:0001:0001:0001',
            timestamp: Date.now(),
            signature: '00'.repeat(64)
        };

        const rinfo = { address: 'fe80::1' };
        messageHandler(Buffer.from(JSON.stringify(validMsg)), rinfo);

        await new Promise(resolve => setTimeout(resolve, 50));
        expect(contactsOps.addOrUpdateContact).toHaveBeenCalled();
        // Should respond to announcement
        expect(mockSocket.send).toHaveBeenCalled();
    });

    it('should reject messages with invalid Yggdrasil addresses', async () => {
        await lan.start();
        const messageHandler = mockSocket.on.mock.calls.find((c: any) => c[0] === 'message')[1];

        const invalidAddrMsg = {
            type: 'LAN_DISCOVERY_ANNOUNCE',
            upeerId: 'peer1',
            publicKey: '00'.repeat(32),
            address: '127.0.0.1',
            timestamp: Date.now(),
            signature: '00'.repeat(64)
        };

        messageHandler(Buffer.from(JSON.stringify(invalidAddrMsg)), { address: 'fe80::1' });
        expect(contactsOps.addOrUpdateContact).not.toHaveBeenCalled();
    });

    it('should reject spoofed upeerId', async () => {
        await lan.start();
        const messageHandler = mockSocket.on.mock.calls.find((c: any) => c[0] === 'message')[1];

        const spoofedMsg = {
            type: 'LAN_DISCOVERY_ANNOUNCE',
            upeerId: 'attacker-id',
            publicKey: '00'.repeat(32),
            address: '200:0001:0001:0001:0001:0001:0001:0001',
            timestamp: Date.now(),
            signature: '00'.repeat(64)
        };

        messageHandler(Buffer.from(JSON.stringify(spoofedMsg)), { address: 'fe80::1' });
        expect(contactsOps.addOrUpdateContact).not.toHaveBeenCalled();
    });

    it('should ignore messages from blocked contacts', async () => {
        (contactsOps.isContactBlocked as any).mockReturnValue(true);
        await lan.start();
        const messageHandler = mockSocket.on.mock.calls.find((c: any) => c[0] === 'message')[1];

        const validMsg = {
            type: 'LAN_DISCOVERY_ANNOUNCE',
            upeerId: 'peer1',
            publicKey: '00'.repeat(32),
            address: '200:0001:0001:0001:0001:0001:0001:0001',
            timestamp: Date.now(),
            signature: '00'.repeat(64)
        };

        messageHandler(Buffer.from(JSON.stringify(validMsg)), { address: 'fe80::1' });
        await new Promise(resolve => setTimeout(resolve, 50));
        expect(contactsOps.addOrUpdateContact).not.toHaveBeenCalled();
    });

    it('should rate limit LAN messages', async () => {
        await lan.start();
        const messageHandler = mockSocket.on.mock.calls.find((c: any) => c[0] === 'message')[1];
        const rinfo = { address: 'fe80::1' };
        const validMsg = {
            type: 'LAN_DISCOVERY_ANNOUNCE', upeerId: 'peer1', publicKey: '00'.repeat(32),
            address: '201::1:1:1:1:1:1:1', timestamp: Date.now(), signature: '00'.repeat(64)
        };

        // Flood with 15 messages (limit is 10)
        for (let i = 0; i < 15; i++) {
            messageHandler(Buffer.from(JSON.stringify(validMsg)), rinfo);
        }

        expect(logger.warn).toHaveBeenCalledWith('LAN discovery rate limit exceeded', expect.any(Object), 'lan');
    });

    it('should validate publicKey format and length', async () => {
        await lan.start();
        const messageHandler = mockSocket.on.mock.calls.find((c: any) => c[0] === 'message')[1];

        const invalidKeyMsg = {
            type: 'LAN_DISCOVERY_ANNOUNCE', upeerId: 'peer1',
            publicKey: 'too-short', // Not 64 hex
            address: '201::1:1:1:1:1:1:1', timestamp: Date.now(), signature: 'sig'
        };

        messageHandler(Buffer.from(JSON.stringify(invalidKeyMsg)), { address: 'fe80::1' });
        expect(logger.warn).toHaveBeenCalledWith('LAN message: invalid publicKey format', expect.anything(), 'lan');
    });

    it('should validate ephemeralPublicKey if present', async () => {
        await lan.start();
        const messageHandler = mockSocket.on.mock.calls.find((c: any) => c[0] === 'message')[1];

        const invalidEphMsg = {
            type: 'LAN_DISCOVERY_ANNOUNCE', upeerId: 'peer1', publicKey: '00'.repeat(32),
            ephemeralPublicKey: 'invalid',
            address: '201::1:1:1:1:1:1:1', timestamp: Date.now(), signature: 'sig'
        };

        messageHandler(Buffer.from(JSON.stringify(invalidEphMsg)), { address: 'fe80::1' });
        expect(logger.warn).toHaveBeenCalledWith('LAN message: invalid ephemeralPublicKey format', expect.anything(), 'lan');
    });

    it('should reject outdated or future timestamps', async () => {
        await lan.start();
        const messageHandler = mockSocket.on.mock.calls.find((c: any) => c[0] === 'message')[1];

        const oldMsg = {
            type: 'LAN_DISCOVERY_ANNOUNCE', upeerId: 'peer1', publicKey: '00'.repeat(32),
            address: '201::1:1:1:1:1:1:1',
            timestamp: Date.now() - 10 * 60 * 1000, // 10 mins ago
            signature: 'sig'
        };

        messageHandler(Buffer.from(JSON.stringify(oldMsg)), { address: 'fe80::1' });
        expect(contactsOps.addOrUpdateContact).not.toHaveBeenCalled();
    });

    it('should periodic announce presence', async () => {
        vi.useFakeTimers();
        await lan.start();

        // Fast forward 30 seconds
        vi.advanceTimersByTime(31000);

        expect(mockSocket.send).toHaveBeenCalled();
        expect(logger.network).toHaveBeenCalledWith('LAN announcement sent (multi-channel)', undefined, expect.any(Object), 'lan');

        vi.useRealTimers();
    });

    it('should handle announcement failures', async () => {
        await lan.start();
        mockSocket.send.mockImplementationOnce((_b: any, _o: any, _l: any, _p: any, _a: any, cb: any) => cb(new Error('Send failed')));

        // Trigger announce manually via private if possible or just wait for timer
        // @ts-ignore
        lan.announcePresence();

        expect(logger.warn).toHaveBeenCalledWith('Failed to send LAN announcement', expect.any(Error), 'lan');
    });

    it('should return discovered peers list', async () => {
        await lan.start();
        const messageHandler = mockSocket.on.mock.calls.find((c: any) => c[0] === 'message')[1];

        const msg = {
            type: 'LAN_DISCOVERY_ANNOUNCE', upeerId: 'peer1', publicKey: '00'.repeat(32),
            address: '200:0001:0001:0001:0001:0001:0001:0001', timestamp: Date.now(), signature: '00'.repeat(64)
        };

        messageHandler(Buffer.from(JSON.stringify(msg)), { address: 'fe80::1' });

        const peers = lan.getDiscoveredPeers();
        expect(peers).toHaveLength(1);
        expect(peers[0].upeerId).toBe('peer1');
    });

    it('should exercise singleton and exported functions', async () => {
        // Mock socket for startLanDiscovery
        (dgram.createSocket as any).mockReturnValue(mockSocket);

        await startLanDiscovery();
        expect(getLanDiscovery()).toBeDefined();

        stopLanDiscovery();
    });

    it('should cleanup old peers', async () => {
        vi.useFakeTimers();
        await lan.start();
        const messageHandler = mockSocket.on.mock.calls.find((c: any) => c[0] === 'message')[1];

        const msg = {
            type: 'LAN_DISCOVERY_ANNOUNCE', upeerId: 'peer1', publicKey: '00'.repeat(32),
            address: '200:0001:0001:0001:0001:0001:0001:0001', timestamp: Date.now(), signature: '00'.repeat(64)
        };
        messageHandler(Buffer.from(JSON.stringify(msg)), { address: 'fe80::1' });

        expect(lan.getDiscoveredPeers()).toHaveLength(1);

        // Advance 61 seconds (timeout is 60s)
        vi.advanceTimersByTime(61000);

        // Trigger cleanup (it's private, through interval or manual if needed, but here we check getDiscoveredPeers logic if it was inlined or wait for interval)
        // Cleanup happens in discoveryInterval
        vi.advanceTimersByTime(30000);

        expect(lan.getDiscoveredPeers()).toHaveLength(0);
        vi.useRealTimers();
    });
});
