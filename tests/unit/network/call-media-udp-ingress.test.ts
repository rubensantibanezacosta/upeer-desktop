import { EventEmitter } from 'node:events';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { encodeBinaryCallMedia, hashCallMedia } from '../../../src/main_process/network/binaryCallMedia.js';

type MockPort = EventEmitter & { start: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn>; postMessage: ReturnType<typeof vi.fn> };

const mocks = vi.hoisted(() => ({
    server: null as EventEmitter | null,
    associationReceiver: null as ((packet: Buffer, address: string, port: number) => void) | null,
    association: null as { isOpen: () => boolean; close: () => void; send: () => boolean } | null,
    port: null as MockPort | null,
    worker: null as { postMessage: ReturnType<typeof vi.fn>; kill: ReturnType<typeof vi.fn> } | null,
    datagramPort: 0,
}));

vi.mock('electron', () => ({
    MessageChannelMain: class {
        port1 = new EventEmitter() as MockPort;
        port2 = Object.assign(new EventEmitter(), { start: vi.fn(), close: vi.fn(), postMessage: vi.fn() }) as MockPort;
        constructor() {
            mocks.port = this.port2;
        }
    },
    utilityProcess: {
        fork: vi.fn(() => {
            mocks.worker = { postMessage: vi.fn(), kill: vi.fn() };
            return mocks.worker;
        }),
    },
}));

vi.mock('node:dgram', () => ({
    default: {
        createSocket: vi.fn(() => {
            mocks.server = new EventEmitter();
            Object.assign(mocks.server, {
                bind: vi.fn((_port: number, _host: string, callback: () => void) => setTimeout(callback, 20)),
                close: vi.fn(),
            });
            return mocks.server;
        }),
    },
}));

vi.mock('../../../src/main_process/security/secure-logger.js', () => ({ error: vi.fn(), info: vi.fn(), warn: vi.fn() }));
vi.mock('../../../src/main_process/security/identity.js', () => ({ getMyUPeerId: vi.fn(() => 'local-peer') }));
vi.mock('../../../src/main_process/network/handlers.js', () => ({ queryOwnVaultsOnReconnect: vi.fn() }));
vi.mock('../../../src/main_process/network/server/mediaWorker.js', () => ({
    createMediaVerificationWorker: vi.fn(() => {
        mocks.port = Object.assign(new EventEmitter(), { start: vi.fn(), close: vi.fn(), postMessage: vi.fn() });
        mocks.worker = { postMessage: vi.fn(), kill: vi.fn() };
        return { worker: mocks.worker, port: mocks.port };
    }),
}));
vi.mock('../../../src/main_process/storage/contacts/operations.js', () => ({ getContacts: vi.fn(() => []) }));
vi.mock('../../../src/main_process/storage/contacts/status.js', () => ({ updateContactStatus: vi.fn(), updateLastSeen: vi.fn() }));
vi.mock('../../../src/main_process/network/call/callManager.js', () => ({ callManager: { get: vi.fn(() => undefined) } }));
vi.mock('../../../src/main_process/network/call/callSignaling.js', () => ({ sendCallMediaTo: vi.fn() }));
vi.mock('../../../src/main_process/network/server/socks5Udp.js', () => ({
    sameIPv6Address: (left: string, right: string) => left.toLowerCase() === right.toLowerCase(),
    createSocks5UdpAssociation: vi.fn(async (receiver: typeof mocks.associationReceiver) => {
        mocks.associationReceiver = receiver;
        mocks.association = { close: vi.fn(), isOpen: vi.fn(() => true), send: vi.fn(() => true) };
        return mocks.association;
    }),
}));
vi.mock('../../../src/main_process/network/server/state.js', () => ({
    getCallMediaUdpServer: vi.fn(() => mocks.server),
    getCallMediaUdpPort: vi.fn(() => 50006),
    getMainWindow: vi.fn(() => null),
    getSocks5UdpAssociation: vi.fn(() => mocks.association),
    setCallMediaUdpServer: vi.fn(),
    setCallMediaUdpPort: vi.fn(),
    setSocks5UdpAssociation: vi.fn(),
}));

describe('CALL_MEDIA UDP ingress', () => {
    beforeEach(async () => {
        vi.resetModules();
        mocks.server = null;
        mocks.associationReceiver = null;
        mocks.association = null;
        mocks.port = null;
        mocks.worker = null;
        const state = await import('../../../src/main_process/network/server/state.js');
        vi.mocked(state.setCallMediaUdpServer).mockReset();
        vi.mocked(state.setCallMediaUdpPort).mockReset();
        vi.mocked(state.setSocks5UdpAssociation).mockReset();
        const socks = await import('../../../src/main_process/network/server/socks5Udp.js');
        vi.mocked(socks.createSocks5UdpAssociation).mockClear();
    });

    it('passes accepted UDP media datagrams to the verification worker', async () => {
        const { startCallMediaUdpServer } = await import('../../../src/main_process/network/server/callMediaUdp.js');
        startCallMediaUdpServer({ webContents: { send: vi.fn() } } as never);
        await new Promise((resolve) => setTimeout(resolve, 30));

        if (!mocks.server) throw new Error('UDP ingress did not initialize');
        const payload = new Uint8Array([1, 2, 3]);
        const packet = encodeBinaryCallMedia({ type: 'CALL_MEDIA', callId: 'call-1', mediaHash: hashCallMedia(payload), senderUpeerId: 'remote-peer', senderYggAddress: '200::1', signature: 'signed-metadata' }, payload);
        mocks.server.emit('message', packet);
        expect(mocks.port?.listenerCount('message')).toBe(1);
        expect(mocks.port?.postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'packet' }));
        expect(mocks.port?.start).toHaveBeenCalledOnce();
    });

    it('starts the SOCKS5 association only after the local UDP listener is bound', async () => {
        const { createSocks5UdpAssociation } = await import('../../../src/main_process/network/server/socks5Udp.js');
        const { startCallMediaUdpServer } = await import('../../../src/main_process/network/server/callMediaUdp.js');
        startCallMediaUdpServer({ webContents: { send: vi.fn() } } as never);

        expect(createSocks5UdpAssociation).not.toHaveBeenCalled();
        await new Promise((resolve) => setTimeout(resolve, 30));
        expect(createSocks5UdpAssociation).toHaveBeenCalledTimes(1);
    });

    it('keeps the UDP server registered while binding and clears it after a bind error', async () => {
        const { startCallMediaUdpServer } = await import('../../../src/main_process/network/server/callMediaUdp.js');
        startCallMediaUdpServer({ webContents: { send: vi.fn() } } as never);
        const state = await import('../../../src/main_process/network/server/state.js');
        const server = mocks.server;
        expect(state.setCallMediaUdpServer).toHaveBeenCalledWith(server);
        if (!server) throw new Error('UDP listener did not initialize');
        server.emit('error', new Error('bind-failed'));
        expect(state.setCallMediaUdpServer).toHaveBeenLastCalledWith(null);
    });
});