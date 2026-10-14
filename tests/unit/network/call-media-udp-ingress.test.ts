import { EventEmitter } from 'node:events';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { encodeBinaryCallMedia, hashCallMedia } from '../../../src/main_process/network/binaryCallMedia.js';

const mocks = vi.hoisted(() => ({
    server: null as EventEmitter | null,
    associationReceiver: null as ((packet: Buffer, address: string, port: number) => void) | null,
    association: null as { isOpen: () => boolean; close: () => void; send: () => boolean } | null,
    handlePacket: vi.fn(),
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

vi.mock('../../../src/main_process/security/secure-logger.js', () => ({ error: vi.fn(), warn: vi.fn() }));
vi.mock('../../../src/main_process/security/identity.js', () => ({ getMyUPeerId: vi.fn(() => 'local-peer') }));
vi.mock('../../../src/main_process/network/handlers.js', () => ({ handlePacket: mocks.handlePacket }));
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
        mocks.handlePacket.mockReset();
        const state = await import('../../../src/main_process/network/server/state.js');
        vi.mocked(state.setCallMediaUdpServer).mockReset();
        vi.mocked(state.setCallMediaUdpPort).mockReset();
        vi.mocked(state.setSocks5UdpAssociation).mockReset();
        const socks = await import('../../../src/main_process/network/server/socks5Udp.js');
        vi.mocked(socks.createSocks5UdpAssociation).mockClear();
    });

    it('passes a datagram to the common security handler only when Ygg source matches signed sender', async () => {
        const { startCallMediaUdpServer } = await import('../../../src/main_process/network/server/callMediaUdp.js');
        startCallMediaUdpServer({ webContents: { send: vi.fn() } } as never);
        await new Promise((resolve) => setTimeout(resolve, 30));

        const payload = new Uint8Array([1, 2, 3]);
        const packet = encodeBinaryCallMedia({
            type: 'CALL_MEDIA',
            callId: 'call-1',
            mediaHash: hashCallMedia(payload),
            senderUpeerId: 'remote-peer',
            senderYggAddress: '200::1',
            signature: 'signed-metadata',
        }, payload);

        if (!mocks.server) throw new Error('UDP ingress did not initialize');
        const associations = await import('../../../src/main_process/network/server/socks5Udp.js');
        const createAssociation = vi.mocked(associations.createSocks5UdpAssociation);
        const receiver = createAssociation.mock.calls[0]?.[0];
        if (!receiver) throw new Error('SOCKS UDP receiver did not initialize');
        receiver(packet, '200::2', 50006);
        expect(mocks.handlePacket).not.toHaveBeenCalled();
        receiver(packet, '200::1', 50006);
        expect(mocks.handlePacket).toHaveBeenCalledWith(
            packet,
            { address: '200::1', port: 50006 },
            expect.anything(),
            expect.any(Function),
            expect.any(Function),
        );
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