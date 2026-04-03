import { beforeEach, describe, expect, it, vi } from 'vitest';

let onAddressCallback: (() => void) | undefined;
let onStatusCallback: ((status: 'down' | 'reconnecting' | 'ready') => void) | undefined;
let ready = false;
let queue: Array<{ ip: string; framedBuf: Buffer }> = [];

vi.mock('../../../src/main_process/security/identity.js', () => ({
    getMyUPeerId: vi.fn(() => 'self-id'),
    sign: vi.fn(() => Buffer.from('sig')),
}));

vi.mock('../../../src/main_process/security/secure-logger.js', () => ({
    error: vi.fn(),
}));

vi.mock('../../../src/main_process/sidecars/yggstack.js', () => ({
    getYggstackAddress: vi.fn(() => '200::self'),
    onYggstackAddress: vi.fn((callback: () => void) => {
        onAddressCallback = callback;
    }),
    onYggstackStatus: vi.fn((callback: (status: 'down' | 'reconnecting' | 'ready') => void) => {
        onStatusCallback = callback;
    }),
}));

vi.mock('../../../src/main_process/network/sealed.js', () => ({
    SEALED_TYPES: new Set(['CHAT']),
    sealPacket: vi.fn((packet) => ({ ...packet, sealed: true })),
}));

vi.mock('../../../src/main_process/network/utils.js', () => ({
    canonicalStringify: vi.fn((obj) => JSON.stringify(obj)),
    getNetworkAddress: vi.fn(() => '200::fallback'),
    isYggdrasilAddress: vi.fn((ip: string) => ip.startsWith('200:')),
}));

vi.mock('../../../src/main_process/network/server/circuitBreaker.js', () => ({
    isIPBlocked: vi.fn(() => false),
    isIPUnreachable: vi.fn(() => false),
    recordIPFailure: vi.fn(),
    recordIPSuccess: vi.fn(),
}));

vi.mock('../../../src/main_process/network/server/socks5.js', () => ({
    encodeFrame: vi.fn((buffer: Buffer) => buffer),
    socks5Connect: vi.fn(),
}));

vi.mock('../../../src/main_process/network/server/state.js', () => ({
    getTcpServer: vi.fn(() => ({ listening: true })),
    getNetworkReady: vi.fn(() => ready),
    setNetworkReady: vi.fn((value: boolean) => {
        ready = value;
    }),
    getSendQueue: vi.fn(() => queue),
    addToSendQueue: vi.fn((item: { ip: string; framedBuf: Buffer }) => {
        queue.push(item);
    }),
    clearSendQueue: vi.fn(() => {
        queue = [];
    }),
}));

vi.mock('../../../src/main_process/network/server/constants.js', () => ({
    MAX_QUEUE_SIZE: 60,
    YGG_PORT: 50005,
}));

describe('transport ready queue edge cases', () => {
    const createMockSocket = () => ({
        destroyed: false,
        write: vi.fn((_buf?: Buffer, cb?: (err?: Error | null) => void) => {
            if (cb) cb(null);
            return true;
        }),
        destroy: vi.fn(),
        on: vi.fn(),
        once: vi.fn(),
        off: vi.fn(),
    });

    beforeEach(async () => {
        vi.clearAllMocks();
        vi.resetModules();
        onAddressCallback = undefined;
        onStatusCallback = undefined;
        ready = false;
        queue = [];
        const transport = await import('../../../src/main_process/network/server/transport.js');
        transport.resetTransportConnectionsForTests();
    });

    it('satura la cola offline en MAX_QUEUE_SIZE y descarta el exceso', async () => {
        const { sendSecureUDPMessage } = await import('../../../src/main_process/network/server/transport.js');

        for (let index = 0; index < 65; index += 1) {
            sendSecureUDPMessage('200::peer', { type: 'CHAT', index });
        }

        expect(queue).toHaveLength(60);
        expect(queue[0]?.ip).toBe('200::peer');
        expect(queue[59]?.ip).toBe('200::peer');
    });

    it('drena la cola cuando Ygg vuelve a estar lista y limpia todo si cae durante reconexión', async () => {
        const socks5 = await import('../../../src/main_process/network/server/socks5.js');
        const state = await import('../../../src/main_process/network/server/state.js');
        const { sendSecureUDPMessage } = await import('../../../src/main_process/network/server/transport.js');

        const mockSocket = createMockSocket();
        vi.mocked(socks5.socks5Connect).mockResolvedValue(mockSocket as never);

        sendSecureUDPMessage('200::peer', { type: 'CHAT', content: 'queued' });
        expect(queue).toHaveLength(1);

        onAddressCallback?.();
        await new Promise((resolve) => setTimeout(resolve, 20));

        expect(state.setNetworkReady).toHaveBeenCalledWith(true);
        expect(queue).toHaveLength(0);
        expect(socks5.socks5Connect).toHaveBeenCalledWith('200::peer', 50005);
        expect(mockSocket.write).toHaveBeenCalledTimes(1);

        sendSecureUDPMessage('200::peer', { type: 'CHAT', content: 'second' });
        await new Promise((resolve) => setTimeout(resolve, 20));
        expect(mockSocket.write).toHaveBeenCalledTimes(2);

        onStatusCallback?.('reconnecting');
        expect(state.setNetworkReady).toHaveBeenCalledWith(false);
        expect(state.clearSendQueue).toHaveBeenCalled();
    });
});
