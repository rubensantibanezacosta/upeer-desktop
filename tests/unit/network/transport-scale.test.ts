import { beforeEach, describe, expect, it, vi } from 'vitest';

let ready = false;
let queue: Array<{ ip: string; framedBuf: Buffer }> = [];

vi.mock('../../../src/main_process/security/identity.js', () => ({
    getMyUPeerId: vi.fn(() => 'self-id'),
    sign: vi.fn(() => Buffer.from('sig')),
}));

vi.mock('../../../src/main_process/security/secure-logger.js', () => ({
    error: vi.fn(),
    warn: vi.fn(),
}));

vi.mock('../../../src/main_process/sidecars/yggstack.js', () => ({
    getYggstackAddress: vi.fn(() => '200::self'),
    onYggstackAddress: vi.fn(),
    onYggstackStatus: vi.fn(),
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

const SCALES = [1, 2, 3, 10, 20, 50, 100];

describe('transporte por escala de peers', () => {
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
        ready = false;
        queue = [];
        const transport = await import('../../../src/main_process/network/server/transport.js');
        transport.resetTransportConnectionsForTests();
    });

    it.each(SCALES)('aplica backpressure global (límite 60) a la cola offline con %d peers', async (peerCount) => {
        const { sendSecureUDPMessage } = await import('../../../src/main_process/network/server/transport.js');

        for (let i = 0; i < peerCount; i += 1) {
            sendSecureUDPMessage(`200::peer-${i}`, { type: 'CHAT', index: i });
        }

        const expectedLength = Math.min(60, peerCount);
        expect(queue).toHaveLength(expectedLength);
        const uniqueIps = new Set(queue.map((item) => item.ip));
        expect(uniqueIps.size).toBe(expectedLength);
    });

    it.each(SCALES)('abre una conexión por cada peer y encola sin saturación con %d peers online', async (peerCount) => {
        const socks5 = await import('../../../src/main_process/network/server/socks5.js');
        const state = await import('../../../src/main_process/network/server/state.js');
        const { sendSecureUDPMessage } = await import('../../../src/main_process/network/server/transport.js');

        state.setNetworkReady(true);
        for (let i = 0; i < peerCount; i += 1) {
            vi.mocked(socks5.socks5Connect).mockResolvedValueOnce(createMockSocket() as never);
            sendSecureUDPMessage(`200::peer-${i}`, { type: 'CHAT', index: i });
        }

        await new Promise((resolve) => setTimeout(resolve, 30));

        expect(socks5.socks5Connect).toHaveBeenCalledTimes(peerCount);
        expect(socks5.socks5Connect).toHaveBeenNthCalledWith(1, '200::peer-0', 50005);
    });
});

