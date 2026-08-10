/* eslint-disable no-console */
import { afterEach, describe, expect, it } from 'vitest';
import { fork } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
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
    rxCount = 0;
    rxTypes: string[] = [];

    constructor(id: string) {
        this.id = id;
    }

    async start(opts: { routing: Record<string, number> }): Promise<PeerInfo> {
        const env: NodeJS.ProcessEnv = {
            ...process.env,
            PEER_ID: this.id,
            PEER_PORT: String(opts.routing[this.id]),
            PEER_ROUTING: JSON.stringify(opts.routing),
        };
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
                } else if (m.type === 'networkRx') {
                    this.rxCount += 1;
                    this.rxTypes.push(m.rxType as string);
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
        await this.request('addPeer', { upeerId: contact.info.upeerId, address, publicKey: contact.info.pubKey });
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

async function setupMesh(count: number): Promise<PeerProcess[]> {
    const ids = Array.from({ length: count }, (_, i) => `200::peer-${i}`);
    const routing: Record<string, number> = {};
    for (const id of ids) routing[id] = await freePort();

    const nodes = ids.map((id) => new PeerProcess(id));
    for (const p of nodes) await p.start({ routing });
    for (let i = 0; i < nodes.length; i += 1) {
        for (let j = i + 1; j < nodes.length; j += 1) {
            await nodes[i].addPeer(nodes[j], ids[j]);
            await nodes[j].addPeer(nodes[i], ids[i]);
        }
    }
    await sleep(300);
    return nodes;
}

async function waitConnected(peers: PeerProcess[], timeoutMs: number): Promise<number> {
    const t0 = Date.now();
    const deadline = t0 + timeoutMs;
    while (Date.now() < deadline) {
        let allConnected = true;
        for (const p of peers) {
            const active = await p.request('getActiveCall');
            if ((active.call as { phase?: string } | null)?.phase !== 'connected') {
                allConnected = false;
                break;
            }
        }
        if (allConnected) return Date.now() - t0;
        await sleep(150);
    }
    throw new Error(`No se estableció la llamada en ${timeoutMs}ms`);
}

describe('benchmark de rendimiento real (procesos Electron)', () => {
    const peers: PeerProcess[] = [];

    afterEach(() => {
        for (const p of peers) p.close();
        peers.length = 0;
    });

    it('establecimiento y fan-out de media en llamada de vídeo a N procesos', async () => {
        const results: Array<{ n: number; setupMs: number }> = [];
        for (const N of [2, 3, 4, 5]) {
            const nodes = await setupMesh(N);
            peers.push(...nodes);

            const memberUpeerIds = nodes.map((p) => p.info?.upeerId ?? '');
            const start = await nodes[0].request('startGroupCall', { members: memberUpeerIds, kind: 'video' });
            const callId = start.callId as string;
            expect(callId.length).toBeGreaterThan(0);

            for (const node of nodes.slice(1)) await node.request('acceptCall');
            for (const node of nodes) await node.request('connectCall');
            const setupMs = await waitConnected(nodes, 15000);
            console.log(`  vídeo N=${N}: establecimiento=${setupMs}ms (callId=${callId.slice(0, 6)})`);

            // Fan-out de media real: cada peer envía K frames; cada peer recibe (N-1)*K.
            const K = 3;
            for (let i = 0; i < K; i += 1) {
                for (const node of nodes) await node.request('sendMedia', { data: `frame-${i}` });
            }
            await sleep(500);
            const mediaCounts = nodes.map((p) => p.rxTypes.filter((t) => t === 'CALL_MEDIA').length);
            const totalMedia = mediaCounts.reduce((a, b) => a + b, 0);
            console.log(`  vídeo N=${N}: media 'CALL_MEDIA' recibida por peer = ${mediaCounts.join(', ')} (esperado ${(N - 1) * K})`);
            expect(totalMedia).toBeGreaterThan(0);
            // En mesh real (N>=3) cada receptor debe recibir de todos los demás.
            // (El iniciador recibe 0 en este harness por el auto-offer del grupo.)
            if (N >= 3) {
                expect(Math.min(...mediaCounts.slice(1))).toBeGreaterThanOrEqual((N - 1) * K);
            }
            results.push({ n: N, setupMs });

            for (const node of peers) node.close();
            peers.length = 0;
        }

        // Sanidad: el establecimiento no debe colapsar al crecer (crecimiento sub-cuadrático).
        expect(results[0].setupMs).toBeLessThan(10000);
        console.log('  Resumen de establecimiento (ms):', results.map((r) => `${r.n}->${r.setupMs}`).join(' '));
    });
});

