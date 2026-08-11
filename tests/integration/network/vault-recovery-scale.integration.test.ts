import { describe, expect, it, afterEach } from 'vitest';
import { fork } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workerPath = path.join(__dirname, '../../multiprocess/peer-worker.js');

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function freePort(): Promise<number> {
    return new Promise((resolve, reject) => {
        const s = net.createServer();
        s.on('error', reject);
        s.listen(0, '127.0.0.1', () => {
            const port = (s.address() as net.AddressInfo).port;
            s.close(() => resolve(port));
        });
    });
}

type PeerInfo = {
    peerId: string;
    upeerId: string;
    pubKey: string;
    port: number;
    dir: string;
    spk: { spkPub: string; spkSig: string; spkId: number };
};

class PeerProcess {
    id: string;
    child: ReturnType<typeof fork> | null = null;
    nextId = 1;
    pending = new Map<number, (msg: Record<string, unknown>) => void>();
    info: PeerInfo | null = null;

    constructor(id: string) {
        this.id = id;
    }

    async start(opts: { routing: Record<string, number>; mnemonic?: string }): Promise<PeerInfo> {
        const env: NodeJS.ProcessEnv = {
            ...process.env,
            PEER_ID: this.id,
            PEER_PORT: String(opts.routing[this.id]),
            PEER_ROUTING: JSON.stringify(opts.routing),
        };
        if (opts.mnemonic) env.PEER_MNEMONIC = opts.mnemonic;

        const registerLoader = path.join(__dirname, '../../multiprocess/register-loader.js');
        this.child = fork(workerPath, [], { env, execArgv: ['--import', registerLoader, '--import', 'tsx'] });

        const info = await new Promise<PeerInfo>((resolve, reject) => {
            if (!this.child) return reject(new Error('child not created'));
            this.child.on('message', (m: Record<string, unknown>) => {
                if (m.type === 'ready') {
                    resolve(m as unknown as PeerInfo);
                } else if (m.type === 'reply') {
                    const pending = this.pending.get(m._id as number);
                    if (pending) {
                        this.pending.delete(m._id as number);
                        pending(m);
                    }
                }
            });
            this.child.on('error', reject);
            this.child.on('exit', (code) => {
                if (code !== 0) reject(new Error(`worker ${this.id} exited with code ${code}`));
            });
        });
        this.info = info;
        return info;
    }

    request(type: string, payload: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
        const _id = this.nextId++;
        return new Promise((resolve, reject) => {
            this.pending.set(_id, (msg) => {
                if (msg.ok) resolve(msg);
                else reject(new Error(String(msg.error || 'worker error')));
            });
            this.child?.send({ type, _id, ...payload });
        });
    }

    async addPeer(contact: PeerProcess, address: string): Promise<void> {
        if (!contact.info) throw new Error(`contact ${contact.id} not started`);
        await this.request('addPeer', {
            upeerId: contact.info.upeerId,
            address,
            publicKey: contact.info.pubKey,
        });
        await this.request('setSpk', {
            upeerId: contact.info.upeerId,
            spkPub: contact.info.spk.spkPub,
            spkSig: contact.info.spk.spkSig,
            spkId: contact.info.spk.spkId,
        });
    }

    close(): void {
        try {
            this.child?.send({ type: 'shutdown' });
        } catch {
            // already closed
        }
    }
}

const ADDRS = ['200::a', '200::b', '200::c', '200::d', '200::e', '200::f', '200::g', '200::h', '200::i', '200::j'];

describe('e2e multiproceso: matriz de escalas de vaulting + recovery de archivos', () => {
    const peers: PeerProcess[] = [];

    afterEach(() => {
        for (const peer of peers) peer.close();
        peers.length = 0;
    });

    const SCALES = [2, 3, 5, 10];

    for (const n of SCALES) {
        it(`vaulting + recovery offline->online con ${n} peers (archivo segmentado, custodian tercero)`, { timeout: 90000 }, async () => {
            const routing: Record<string, number> = {};
            for (let i = 0; i < n; i++) routing[ADDRS[i]] = await freePort();

            const nodes: PeerProcess[] = [];
            for (let i = 0; i < n; i++) {
                const node = new PeerProcess(ADDRS[i]);
                peers.push(node);
                nodes.push(node);
            }

            for (const node of nodes) await node.start({ routing });
            const aInfo = nodes[0].info as PeerInfo;
            const bInfo = nodes[1].info as PeerInfo;

            for (const node of nodes) {
                for (const other of nodes) {
                    if (node === other) continue;
                    await node.addPeer(other, other.id);
                }
            }
            await sleep(400);

            const filePath = path.join(os.tmpdir(), `upeer-scale-${n}-${Date.now()}.bin`);
            const data = Buffer.alloc(300 * 1024);
            for (let i = 0; i < data.length; i++) data[i] = (i * 7) % 251;
            fs.writeFileSync(filePath, data);

            await nodes[1].request('setVaultOffline', { value: true });
            await nodes[0].request('setContactStatus', { upeerId: bInfo.upeerId, status: 'disconnected' });
            await sleep(200);
            await nodes[0].request('sendFile', { upeerId: bInfo.upeerId, address: '200::b', filePath });
            await sleep(6000);

            const aSending = await nodes[0].request('getTransfers', { direction: 'sending' });
            const sending = aSending.transfers as Array<{ state: string; phase?: string; isVaulting?: boolean }>;
            const vaulted = sending.find((t) => t.state === 'active' && (t.isVaulting || t.phase === 'replicating'));
            expect(vaulted, `A debió vaultear el archivo para B offline (${n} peers)`).toBeTruthy();

            await nodes[1].request('setVaultOffline', { value: false });
            await nodes[0].request('setContactStatus', { upeerId: bInfo.upeerId, status: 'connected' });
            await nodes[1].request('setContactStatus', { upeerId: aInfo.upeerId, status: 'disconnected' });
            for (let i = 2; i < n; i++) {
                const cust = nodes[i].info as PeerInfo;
                await nodes[1].request('setContactStatus', { upeerId: cust.upeerId, status: 'connected' });
            }
            await sleep(400);
            await nodes[1].request('queryOwnVaults');
            await sleep(12000);

            const bReceiving = await nodes[1].request('getTransfers', { direction: 'receiving' });
            const received = bReceiving.transfers as Array<{ state: string; fileName?: string }>;
            const completed = received.find((t) => t.state === 'completed' && t.fileName?.endsWith('.bin'));
            expect(completed, `B debió recuperar el archivo completo del vault (${n} peers)`).toBeTruthy();
        });
    }

    it('1 peer conectado: A (solo) vaultea, B se conecta despues y recupera del vault', { timeout: 90000 }, async () => {
        const routing: Record<string, number> = {};
        for (let i = 0; i < 2; i++) routing[ADDRS[i]] = await freePort();

        // B arranca primero solo para obtener su identidad/SPK y registrarlo en A.
        // Luego se apaga: en el escenario real A ya conoce a B (handshake previo)
        // pero B NO está conectado ahora. Se fija una mnemonic para que B2 (al
        // reconectar) tenga la MISMA identidad/upeerId que B1.
        const bMnemonic = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
        const nodeB = new PeerProcess(ADDRS[1]);
        peers.push(nodeB);
        const bInfo = await nodeB.start({ routing, mnemonic: bMnemonic });
        await nodeB.close();

        const nodeA = new PeerProcess(ADDRS[0]);
        peers.push(nodeA);
        await nodeA.start({ routing });

        await nodeA.request('addPeer', {
            upeerId: bInfo.upeerId,
            address: '200::b',
            publicKey: bInfo.pubKey,
        });
        await nodeA.request('setSpk', {
            upeerId: bInfo.upeerId,
            spkPub: bInfo.spk.spkPub,
            spkSig: bInfo.spk.spkSig,
            spkId: bInfo.spk.spkId,
        });
        // B está offline: A lo ve como desconectado (solo A conectado).
        await nodeA.request('setContactStatus', { upeerId: bInfo.upeerId, status: 'disconnected' });
        await sleep(200);

        const filePath = path.join(os.tmpdir(), `upeer-single-${Date.now()}.bin`);
        const data = Buffer.alloc(300 * 1024);
        for (let i = 0; i < data.length; i++) data[i] = (i * 3) % 251;
        fs.writeFileSync(filePath, data);
        await nodeA.request('sendFile', { upeerId: bInfo.upeerId, address: '200::b', filePath });
        await sleep(8000);

        const aSending = await nodeA.request('getTransfers', { direction: 'sending' });
        const sending = aSending.transfers as Array<{ state: string; phase?: string; isVaulting?: boolean }>;
        const vaulted = sending.find((t) => t.state === 'active' && (t.isVaulting || t.phase === 'replicating'));
        expect(vaulted, 'A debió vaultear el archivo estando solo').toBeTruthy();

        // B se conecta ahora (misma identidad, mismo upeerId). A vuelve a verlo online.
        const nodeB2 = new PeerProcess(ADDRS[1]);
        peers.push(nodeB2);
        await nodeB2.start({ routing, mnemonic: bMnemonic });
        await nodeB2.addPeer(nodeA, '200::a');
        await nodeA.addPeer(nodeB2, '200::b');
        await nodeA.request('setContactStatus', { upeerId: bInfo.upeerId, status: 'connected' });
        await sleep(400);

        await nodeB2.request('queryOwnVaults');
        await sleep(12000);

        const bReceiving = await nodeB2.request('getTransfers', { direction: 'receiving' });
        const received = bReceiving.transfers as Array<{ state: string; fileName?: string }>;
        const completed = received.find((t) => t.state === 'completed' && t.fileName?.endsWith('.bin'));
        expect(completed, 'B debió recuperar el archivo del vault al conectarse').toBeTruthy();
    });
});
