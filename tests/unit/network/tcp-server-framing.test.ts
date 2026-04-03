import { beforeEach, describe, expect, it, vi } from 'vitest';

type SocketHandler = (chunk?: Buffer) => void | Promise<void>;

type MockSocket = {
    remoteAddress: string;
    remotePort: number;
    on: ReturnType<typeof vi.fn>;
    destroy: ReturnType<typeof vi.fn>;
    emitData: (chunk: Buffer) => Promise<void>;
};

let connectionHandler: ((socket: MockSocket) => void) | undefined;
let _yggAddressCallback: (() => void) | undefined;
let storedTimer: ReturnType<typeof setInterval> | null = null;
let storedServer: { on: ReturnType<typeof vi.fn>; listen: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn> } | null = null;
let storedMainWindow: object | null = null;

vi.mock('node:net', () => ({
    default: {
        createServer: vi.fn((handler: (socket: MockSocket) => void) => {
            connectionHandler = handler;
            storedServer = {
                on: vi.fn(),
                listen: vi.fn((_port: number, _host: string, callback?: () => void) => {
                    callback?.();
                }),
                close: vi.fn(),
            };
            return storedServer;
        }),
    },
}));

vi.mock('electron', () => ({
    app: {
        getPath: vi.fn(() => '/tmp/chat-p2p-tests'),
    },
    BrowserWindow: vi.fn(),
}));

vi.mock('../../../src/main_process/security/secure-logger.js', () => ({
    network: vi.fn(),
    error: vi.fn(),
}));

vi.mock('../../../src/main_process/security/identity.js', () => ({
    getMyUPeerId: vi.fn(() => 'self-id'),
}));

vi.mock('../../../src/main_process/storage/contacts/operations.js', () => ({
    getContacts: vi.fn(() => []),
}));

vi.mock('../../../src/main_process/sidecars/yggstack.js', () => ({
    onYggstackAddress: vi.fn((callback: () => void) => {
        _yggAddressCallback = callback;
    }),
}));

vi.mock('../../../src/main_process/network/handlers.js', () => ({
    handlePacket: vi.fn(async () => undefined),
    cleanupRateLimiter: vi.fn(),
}));

vi.mock('../../../src/main_process/network/dht/core.js', () => ({
    startDhtSearch: vi.fn(),
}));

vi.mock('../../../src/main_process/network/dht/kademlia/main.js', () => ({
    KademliaDHT: class {
        performMaintenance = vi.fn();
    },
}));

vi.mock('../../../src/main_process/network/dht/handlers.js', () => ({
    setKademliaInstance: vi.fn(),
    performDhtMaintenance: vi.fn(async () => undefined),
}));

vi.mock('../../../src/main_process/network/file-transfer/transfer-manager.js', () => ({
    fileTransferManager: {
        initialize: vi.fn(),
    },
}));

vi.mock('../../../src/main_process/network/utils.js', () => ({
    getNetworkAddress: vi.fn(() => '200::self'),
}));

vi.mock('../../../src/main_process/network/server/constants.js', () => ({
    YGG_PORT: 50005,
    MAX_FRAME_BYTES: 256,
}));

vi.mock('../../../src/main_process/network/server/state.js', () => ({
    setMainWindow: vi.fn((win: object | null) => {
        storedMainWindow = win;
    }),
    getMainWindow: vi.fn(() => storedMainWindow),
    getTcpServer: vi.fn(() => storedServer),
    setTcpServer: vi.fn((server: typeof storedServer) => {
        storedServer = server;
    }),
    setKademliaDHT: vi.fn(),
    setDhtMaintenanceTimer: vi.fn((timer: ReturnType<typeof setInterval> | null) => {
        storedTimer = timer;
    }),
    getDhtMaintenanceTimer: vi.fn(() => storedTimer),
}));

vi.mock('../../../src/main_process/network/server/transport.js', () => ({
    sendSecureUDPMessage: vi.fn(),
    drainSendQueue: vi.fn(),
}));

function encodeFrame(payload: object): Buffer {
    const raw = Buffer.from(JSON.stringify(payload));
    const frame = Buffer.alloc(4 + raw.length);
    frame.writeUInt32BE(raw.length, 0);
    raw.copy(frame, 4);
    return frame;
}

function createMockSocket(): MockSocket {
    const handlers = new Map<string, SocketHandler>();
    return {
        remoteAddress: '127.0.0.1',
        remotePort: 4040,
        on: vi.fn((event: string, handler: SocketHandler) => {
            handlers.set(event, handler);
        }),
        destroy: vi.fn(),
        emitData: async (chunk: Buffer) => {
            const handler = handlers.get('data');
            if (handler) await handler(chunk);
        },
    };
}

describe('tcpServer framing edges', () => {
    beforeEach(async () => {
        vi.clearAllMocks();
        vi.useFakeTimers();
        vi.resetModules();
        connectionHandler = undefined;
        _yggAddressCallback = undefined;
        storedTimer = null;
        storedServer = null;
        storedMainWindow = null;
    });

    it('reensambla frames fragmentados antes de delegar a handlePacket', async () => {
        const handlers = await import('../../../src/main_process/network/handlers.js');
        const { startUDPServer } = await import('../../../src/main_process/network/server/tcpServer.js');
        const win = { webContents: { send: vi.fn() } };
        startUDPServer(win as never);

        const socket = createMockSocket();
        connectionHandler?.(socket);

        const frame = encodeFrame({ type: 'PING', senderUpeerId: 'peer-a', signature: 'sig' });
        await socket.emitData(frame.subarray(0, 3));
        expect(handlers.handlePacket).not.toHaveBeenCalled();

        await socket.emitData(frame.subarray(3));
        expect(handlers.handlePacket).toHaveBeenCalledTimes(1);
        expect(handlers.handlePacket).toHaveBeenCalledWith(
            Buffer.from(JSON.stringify({ type: 'PING', senderUpeerId: 'peer-a', signature: 'sig' })),
            { address: '127.0.0.1', port: 4040 },
            win,
            expect.any(Function),
            expect.any(Function)
        );
    });

    it('procesa múltiples frames concatenados en un mismo chunk', async () => {
        const handlers = await import('../../../src/main_process/network/handlers.js');
        const { startUDPServer } = await import('../../../src/main_process/network/server/tcpServer.js');
        startUDPServer({ webContents: { send: vi.fn() } } as never);

        const socket = createMockSocket();
        connectionHandler?.(socket);

        const firstFrame = encodeFrame({ type: 'PING', senderUpeerId: 'peer-1', signature: 'sig-1' });
        const secondFrame = encodeFrame({ type: 'PONG', senderUpeerId: 'peer-2', signature: 'sig-2' });
        await socket.emitData(Buffer.concat([firstFrame, secondFrame]));

        expect(handlers.handlePacket).toHaveBeenCalledTimes(2);
    });

    it('cierra la conexión si el header anuncia un frame individual demasiado grande', async () => {
        const logger = await import('../../../src/main_process/security/secure-logger.js');
        const { startUDPServer } = await import('../../../src/main_process/network/server/tcpServer.js');
        startUDPServer({ webContents: { send: vi.fn() } } as never);

        const socket = createMockSocket();
        connectionHandler?.(socket);

        const oversizedHeader = Buffer.alloc(4);
        oversizedHeader.writeUInt32BE(257, 0);
        await socket.emitData(oversizedHeader);

        expect(socket.destroy).toHaveBeenCalledTimes(1);
        expect(logger.error).toHaveBeenCalledWith(
            'TCP: frame individual demasiado grande, conexión cerrada',
            expect.objectContaining({ msgLen: 257, peer: '127.0.0.1' }),
            'network'
        );
    });
});
