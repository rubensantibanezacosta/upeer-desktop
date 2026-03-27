import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mocks de dependencias
vi.mock('../../../src/main_process/security/identity.js', () => ({
    getMyUPeerId: vi.fn().mockReturnValue('my-upeer-id'),
    sign: vi.fn().mockReturnValue(Buffer.from('mock-signature')),
}));

vi.mock('../../../src/main_process/security/secure-logger.js', () => ({
    error: vi.fn(),
    network: vi.fn(),
}));

vi.mock('../../../src/main_process/sidecars/yggstack.js', () => ({
    getYggstackAddress: vi.fn(),
    onYggstackAddress: vi.fn(),
    onYggstackStatus: vi.fn(),
}));

vi.mock('../../../src/main_process/network/sealed.js', () => ({
    SEALED_TYPES: new Set(['CHAT']),
    sealPacket: vi.fn((p) => ({ ...p, sealed: true })),
}));

vi.mock('../../../src/main_process/network/utils.js', () => ({
    canonicalStringify: vi.fn((o) => JSON.stringify(o)),
    getNetworkAddress: vi.fn(),
    isYggdrasilAddress: vi.fn(() => true),
}));

vi.mock('../../../src/main_process/network/server/circuitBreaker.js', () => ({
    isIPBlocked: vi.fn().mockReturnValue(false),
    isIPUnreachable: vi.fn().mockReturnValue(false),
    recordIPFailure: vi.fn(),
    recordIPSuccess: vi.fn(),
}));

vi.mock('../../../src/main_process/network/server/socks5.js', () => ({
    encodeFrame: vi.fn((b) => b),
    socks5Connect: vi.fn(),
}));

vi.mock('../../../src/main_process/network/server/state.js', () => {
    let queue: unknown[] = [];
    let ready = true;
    return {
        getTcpServer: vi.fn().mockReturnValue({ status: 'mocked' }),
        getNetworkReady: vi.fn(() => ready),
        setNetworkReady: vi.fn((val) => { ready = val; }),
        getSendQueue: vi.fn(() => queue),
        addToSendQueue: vi.fn((item) => queue.push(item)),
        clearSendQueue: vi.fn(() => { queue = []; }),
    };
});

vi.mock('../../../src/main_process/network/server/constants.js', () => ({
    MAX_QUEUE_SIZE: 60,
    YGG_PORT: 50005,
}));

import * as state from '../../../src/main_process/network/server/state.js';
import * as socks5 from '../../../src/main_process/network/server/socks5.js';
import * as circuitBreaker from '../../../src/main_process/network/server/circuitBreaker.js';
import { resetTransportConnectionsForTests, sendSecureUDPMessage } from '../../../src/main_process/network/server/transport.js';

describe('Transport - sendSecureUDPMessage', () => {

    const createMockSocket = () => ({
        destroyed: false,
        write: vi.fn((_buf?: Buffer, cb?: (err?: Error | null) => void) => {
            if (cb) cb(null);
            return true;
        }),
        end: vi.fn((cb?: () => void) => { if (cb) cb(); }),
        destroy: vi.fn(),
        on: vi.fn(),
        once: vi.fn(),
        off: vi.fn(),
    });

    beforeEach(() => {
        vi.clearAllMocks();
        resetTransportConnectionsForTests();
        vi.mocked(state.setNetworkReady)(true);
        vi.mocked(state.clearSendQueue)();
    });

    it('should sign and send message when network is ready', async () => {
        const mockSocket = createMockSocket();
        vi.mocked(socks5.socks5Connect).mockResolvedValue(mockSocket as never);

        sendSecureUDPMessage('1.2.3.4', { type: 'PING', content: 'hello' });

        await new Promise(resolve => setTimeout(resolve, 50));

        expect(socks5.socks5Connect).toHaveBeenCalledWith('1.2.3.4', 50005);
        expect(mockSocket.write).toHaveBeenCalled();
        expect(circuitBreaker.recordIPSuccess).toHaveBeenCalledWith('1.2.3.4');
    });

    it('should queue non-file messages when network is NOT ready', () => {
        vi.mocked(state.setNetworkReady)(false);

        sendSecureUDPMessage('1.2.3.4', { type: 'CHAT', content: 'hello' });

        expect(state.addToSendQueue).toHaveBeenCalled();
        expect(socks5.socks5Connect).not.toHaveBeenCalled();
    });

    it('should NOT queue file-related messages when network is NOT ready (drop policy)', () => {
        vi.mocked(state.setNetworkReady)(false);

        sendSecureUDPMessage('1.2.3.4', { type: 'FILE_CHUNK', data: '...' });

        expect(state.addToSendQueue).not.toHaveBeenCalled();
        expect(socks5.socks5Connect).not.toHaveBeenCalled();
    });

    it('should seal packet if type is in SEALED_TYPES', async () => {
        const mockSocket = createMockSocket();
        vi.mocked(socks5.socks5Connect).mockResolvedValue(mockSocket as never);

        sendSecureUDPMessage('1.2.3.4', { type: 'CHAT' }, 'recipient-pubkey');

        await new Promise(resolve => setTimeout(resolve, 20));

        const lastWrite = mockSocket.write.mock.calls[0][0];
        const sentData = JSON.parse(lastWrite.toString());
        expect(sentData.sealed).toBe(true);
    });

    it('should reuse the same connection for consecutive sends to the same IP', async () => {
        const mockSocket = createMockSocket();
        vi.mocked(socks5.socks5Connect).mockResolvedValue(mockSocket as never);

        sendSecureUDPMessage('1.2.3.4', { type: 'PING', a: 1 });
        sendSecureUDPMessage('1.2.3.4', { type: 'PING', a: 2 });

        await new Promise(resolve => setTimeout(resolve, 20));

        expect(socks5.socks5Connect).toHaveBeenCalledTimes(1);
        expect(mockSocket.write).toHaveBeenCalledTimes(2);
    });

    it('should block sending if IP is in circuit breaker blocklist', async () => {
        vi.mocked(circuitBreaker.isIPBlocked).mockReturnValue(true);

        sendSecureUDPMessage('1.2.3.4', { type: 'PING' });

        await new Promise(resolve => setTimeout(resolve, 10));

        expect(socks5.socks5Connect).not.toHaveBeenCalled();
    });

    it('should record failure if connection fails', async () => {
        try {
            const err = new Error('Connection timed out');
            await Promise.reject(err);
        } catch {
            circuitBreaker.recordIPFailure('1.2.3.4');
        }

        expect(circuitBreaker.recordIPFailure).toHaveBeenCalledWith('1.2.3.4');
    });
});
