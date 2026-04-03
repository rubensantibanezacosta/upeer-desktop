import { beforeEach, describe, expect, it, vi } from 'vitest';

type MockServer = {
    on: ReturnType<typeof vi.fn>;
    listen: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
};

let storedServer: MockServer | null = null;
let storedTimer: ReturnType<typeof setInterval> | null = null;
let storedMainWindow: object | null = null;
let yggAddressCallback: (() => void) | undefined;
let serverErrorHandler: ((err: Error) => void) | undefined;

vi.mock('node:net', () => ({
    default: {
        createServer: vi.fn(() => {
            storedServer = {
                on: vi.fn((event: string, handler: (err: Error) => void) => {
                    if (event === 'error') serverErrorHandler = handler;
                }),
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
        yggAddressCallback = callback;
    }),
}));

vi.mock('../../../src/main_process/network/handlers.js', () => ({
    handlePacket: vi.fn(),
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
    MAX_FRAME_BYTES: 1024,
}));

vi.mock('../../../src/main_process/network/server/state.js', () => ({
    setMainWindow: vi.fn((win: object | null) => {
        storedMainWindow = win;
    }),
    getMainWindow: vi.fn(() => storedMainWindow),
    getTcpServer: vi.fn(() => storedServer),
    setTcpServer: vi.fn((server: MockServer | null) => {
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

vi.mock('../../../src/main_process/network/vault/manager.js', () => ({
    VaultManager: {
        queryOwnVaults: vi.fn(),
    },
}));

vi.mock('../../../src/main_process/network/vault/repair-worker.js', () => ({
    RepairWorker: {
        start: vi.fn(),
    },
}));

vi.mock('../../../src/main_process/storage/vault/operations.js', () => ({
    cleanupExpiredVaultEntries: vi.fn(async () => undefined),
}));

describe('tcpServer startup callbacks', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers();
        vi.resetModules();
        storedServer = null;
        storedTimer = null;
        storedMainWindow = null;
        yggAddressCallback = undefined;
        serverErrorHandler = undefined;
    });

    it('al recibir dirección Ygg drena cola, consulta vaults propios y arranca repair worker', async () => {
        const transport = await import('../../../src/main_process/network/server/transport.js');
        const { VaultManager } = await import('../../../src/main_process/network/vault/manager.js');
        const { RepairWorker } = await import('../../../src/main_process/network/vault/repair-worker.js');
        const { startUDPServer } = await import('../../../src/main_process/network/server/tcpServer.js');

        startUDPServer({ webContents: { send: vi.fn() } } as never);

        yggAddressCallback?.();
        await vi.advanceTimersByTimeAsync(0);
        await Promise.resolve();

        expect(transport.drainSendQueue).toHaveBeenCalledTimes(1);
        expect(VaultManager.queryOwnVaults).toHaveBeenCalledTimes(1);
        expect(RepairWorker.start).toHaveBeenCalledTimes(1);
    });

    it('el timer de mantenimiento ejecuta DHT, cleanup de vault y cleanupRateLimiter', async () => {
        const dhtHandlers = await import('../../../src/main_process/network/dht/handlers.js');
        const handlers = await import('../../../src/main_process/network/handlers.js');
        const vaultOps = await import('../../../src/main_process/storage/vault/operations.js');
        const { startUDPServer, closeUDPServer } = await import('../../../src/main_process/network/server/tcpServer.js');

        startUDPServer({ webContents: { send: vi.fn() } } as never);

        await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
        await Promise.resolve();
        await Promise.resolve();

        expect(dhtHandlers.performDhtMaintenance).toHaveBeenCalledTimes(1);
        expect(vaultOps.cleanupExpiredVaultEntries).toHaveBeenCalledTimes(1);
        expect(handlers.cleanupRateLimiter).toHaveBeenCalledTimes(1);

        const serverRef = storedServer;
        closeUDPServer();
        expect(serverRef?.close).toHaveBeenCalledTimes(1);
    });

    it('propaga errores del servidor al logger', async () => {
        const logger = await import('../../../src/main_process/security/secure-logger.js');
        const { startUDPServer } = await import('../../../src/main_process/network/server/tcpServer.js');

        startUDPServer({ webContents: { send: vi.fn() } } as never);
        serverErrorHandler?.(new Error('tcp-failure'));

        expect(logger.error).toHaveBeenCalledWith('TCP Server Error', expect.any(Error), 'network');
    });
});
