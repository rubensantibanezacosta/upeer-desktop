import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

const registry = vi.hoisted(() => {
    const nodes = new Map<string, number>();
    const publicKeys = new Map<string, string>();
    const onDeliveries = new Map<string, (senderId: string, data: Record<string, unknown>) => void>();
    const servers = new Set<import('node:net').Server>();
    return {
        nodes,
        publicKeys,
        onDeliveries,
        servers,
        register(id: string, port: number, pubKey: string, onDelivery: (senderId: string, data: Record<string, unknown>) => void, server: import('node:net').Server): void {
            nodes.set(id, port);
            publicKeys.set(id, pubKey);
            onDeliveries.set(id, onDelivery);
            servers.add(server);
        },
        portOf(id: string): number | undefined {
            return nodes.get(id);
        },
        reset(): void {
            nodes.clear();
            publicKeys.clear();
            onDeliveries.clear();
            for (const server of servers) {
                try {
                    server.close();
                } catch {
                    // already closed
                }
            }
            servers.clear();
        },
    };
});

vi.mock('../../../src/main_process/network/server/socks5.js', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../../src/main_process/network/server/socks5.js')>();
    return {
        ...actual,
        socks5Connect: (ip: string, _port: number): Promise<net.Socket> =>
            new Promise((resolve, reject) => {
                const port = registry.portOf(ip);
                if (!port) {
                    reject(new Error(`No hay nodo registrado para ${ip}`));
                    return;
                }
                const socket = net.connect(port, '127.0.0.1');
                socket.on('connect', () => resolve(socket));
                socket.on('error', reject);
            }),
    };
});

vi.mock('electron', () => ({
    BrowserWindow: {
        getAllWindows: vi.fn(() => [{ webContents: { send: vi.fn() } }]),
    },
    app: {
        isPackaged: false,
        getPath: () => '/tmp',
    },
}));

type DeliverFn = (senderId: string, data: Record<string, unknown>) => void;

type E2ENode = {
    id: string;
    port: number;
    transport: typeof import('../../../src/main_process/network/server/transport.js');
    identity: typeof import('../../../src/main_process/security/identity.js');
};

async function createNode(id: string): Promise<E2ENode> {
    vi.resetModules();
    vi.doMock('../../../src/main_process/storage/contacts/operations.js', () => ({
        getContactByUpeerId: vi.fn(() => null),
        getContacts: vi.fn(() => []),
    }));
    vi.doMock('../../../src/main_process/storage/messages/operations.js', () => ({
        saveMessage: vi.fn(() => Promise.resolve({ changes: 1 })),
        updateMessageStatus: vi.fn(() => Promise.resolve(true)),
        updateMessageContent: vi.fn(),
        deleteMessageLocally: vi.fn(),
        getMessageById: vi.fn(() => Promise.resolve(null)),
    }));
    vi.doMock('../../../src/main_process/storage/messages/status.js', () => ({
        getMessageStatus: vi.fn(() => 'sent'),
    }));

    const identity = await import('../../../src/main_process/security/identity.js');
    const transport = await import('../../../src/main_process/network/server/transport.js');
    const state = await import('../../../src/main_process/network/server/state.js');

    const identityDir = fs.mkdtempSync(path.join(os.tmpdir(), `upeer-${id.replace(/[^a-z0-9]/gi, '')}-`));
    identity.initIdentity(identityDir);
    identity.createMnemonicIdentity();
    const pubKeyHex = identity.getMyPublicKeyHex();

    state.setTcpServer({ listening: true } as never);
    state.setNetworkReady(true);

    const deliver: DeliverFn = (senderId, data) => {
        const onDelivery = registry.onDeliveries.get(id);
        if (onDelivery) onDelivery(senderId, data);
    };

    let frameBuf = Buffer.alloc(0);
    const server = net.createServer((socket) => {
        socket.on('data', (chunk: Buffer) => {
            frameBuf = Buffer.concat([frameBuf, chunk]);
            while (frameBuf.length >= 4) {
                const msgLen = frameBuf.readUInt32BE(0);
                if (frameBuf.length < 4 + msgLen) break;
                const msg = frameBuf.subarray(4, 4 + msgLen);
                frameBuf = frameBuf.subarray(4 + msgLen);
                deliver(id, JSON.parse(msg.toString()) as Record<string, unknown>);
            }
        });
    });

    await new Promise<void>((res) => server.listen(0, '127.0.0.1', () => res()));
    const addr = server.address() as net.AddressInfo;
    registry.register(id, addr.port, pubKeyHex, deliver, server);

    return { id, port: addr.port, transport, identity };
}

describe('e2e red real por sockets localhost', () => {
    beforeEach(() => {
        registry.reset();
    });

    afterEach(async () => {
        registry.reset();
        const { closeDB } = await import('../../../src/main_process/storage/init.js').catch(() => ({ closeDB: undefined }));
        closeDB?.();
    });

    it('A envía un paquete firmado por socket TCP real y B lo recibe intacto', async () => {
        const nodeA = await createNode('200::a');
        await createNode('200::b');

        const received: Record<string, unknown>[] = [];
        const { onDeliveries } = registry;
        onDeliveries.set('200::b', (senderId, data) => received.push({ senderId, ...data }));

        nodeA.transport.resetTransportConnectionsForTests();

        nodeA.transport.sendSecureUDPMessage('200::b', { type: 'CHAT', content: 'hola e2e', senderUpeerId: '200::a' });

        await new Promise((resolve) => setTimeout(resolve, 300));

        expect(received.length).toBeGreaterThan(0);
        const msg = received[0];
        expect(msg.content).toBe('hola e2e');
        expect(msg.senderUpeerId).toBe(nodeA.identity.getMyUPeerId());
        expect(msg.signature).toBeDefined();
    });

    it('A sella un mensaje para B (sealing real) y B lo descifra', async () => {
        const nodeA = await createNode('200::a');
        const nodeB = await createNode('200::b');

        let receivedData: Record<string, unknown> | undefined;
        const { onDeliveries } = registry;
        onDeliveries.set('200::b', (_senderId, data) => { receivedData = data; });

        const bPub = registry.publicKeys.get('200::b') as string;
        nodeA.transport.resetTransportConnectionsForTests();
        nodeA.transport.sendSecureUDPMessage('200::b', { type: 'CHAT', content: 'mensaje sellado' }, bPub);

        await new Promise((resolve) => setTimeout(resolve, 300));

        expect(receivedData).toBeDefined();
        expect(receivedData?.type).toBe('SEALED');
        const inner = nodeB.identity.decryptSealed(Buffer.from(receivedData?.ciphertext as string, 'hex'));
        if (!inner) throw new Error('No se pudo descifrar el mensaje sellado');
        const parsed = JSON.parse(inner.toString()) as Record<string, unknown>;
        expect(parsed.content).toBe('mensaje sellado');
    });

    it('no pierde mensajes en el transporte real: A envía 5 mensajes y B los recibe todos', async () => {
        const nodeA = await createNode('200::a');
        await createNode('200::b');

        const contents: string[] = [];
        const { onDeliveries } = registry;
        onDeliveries.set('200::b', (_senderId, data) => {
            if (data.type === 'CHAT' && typeof data.content === 'string') {
                contents.push(data.content);
            }
        });

        nodeA.transport.resetTransportConnectionsForTests();
        for (let i = 0; i < 5; i += 1) {
            nodeA.transport.sendSecureUDPMessage('200::b', { type: 'CHAT', content: `msg-${i}` });
        }

        await new Promise((resolve) => setTimeout(resolve, 400));

        expect(contents).toEqual(['msg-0', 'msg-1', 'msg-2', 'msg-3', 'msg-4']);
    });
});

