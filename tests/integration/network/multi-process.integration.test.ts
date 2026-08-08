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
    rxCount = 0;
    rxTypes: string[] = [];

    constructor(id: string) {
        this.id = id;
    }

    async start(opts: { routing: Record<string, number>; mnemonic?: string; selfAddresses?: string[]; sourceDir?: string }): Promise<PeerInfo> {
        const env: NodeJS.ProcessEnv = {
            ...process.env,
            PEER_ID: this.id,
            PEER_PORT: String(opts.routing[this.id]),
            PEER_ROUTING: JSON.stringify(opts.routing),
        };
        if (opts.mnemonic) env.PEER_MNEMONIC = opts.mnemonic;
        if (opts.selfAddresses) env.PEER_SELF_ADDRESSES = JSON.stringify(opts.selfAddresses);
        if (opts.sourceDir) env.PEER_SOURCE_DIR = opts.sourceDir;

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

describe('e2e multiproceso: un proceso por peer (aislamiento real)', () => {
    const peers: PeerProcess[] = [];

    afterEach(() => {
        for (const peer of peers) peer.close();
        peers.length = 0;
    });

    it('online->online: A envía a B con procesos separados y B persiste el mensaje', async () => {
        const routing = {
            '200::a': await freePort(),
            '200::b': await freePort(),
        };
        const nodeA = new PeerProcess('200::a');
        const nodeB = new PeerProcess('200::b');
        peers.push(nodeA, nodeB);

        const aInfo = await nodeA.start({ routing });
        const bInfo = await nodeB.start({ routing });

        await nodeA.addPeer(nodeB, '200::b');
        await nodeB.addPeer(nodeA, '200::a');

        await nodeA.request('sendMessage', { to: bInfo.upeerId, content: 'hola proceso' });
        await sleep(600);

        const bMessages = await nodeB.request('getMessages', { contactId: aInfo.upeerId });
        expect((bMessages.messages as Array<{ message: string }>).some((m) => m.message === 'hola proceso')).toBe(true);
    });

    it('multi-dispositivo: mismo usuario en 2 procesos y self-sync real entre dispositivos', async () => {
        const routing = {
            '200::a': await freePort(),
            '200::a2': await freePort(),
            '200::b': await freePort(),
        };
        const nodeA = new PeerProcess('200::a');
        const nodeB = new PeerProcess('200::b');
        peers.push(nodeA, nodeB);

        // A (dispositivo 1) conoce su otro dispositivo A2 como self-address
        const aInfo = await nodeA.start({ routing, selfAddresses: ['200::a2'] });
        const mnemonic = (await nodeA.request('getMnemonic')).mnemonic as string;

        // A2 (dispositivo 2) comparte la misma identidad (misma mnemonic) en un proceso distinto.
        // Hereda también el SPK de A (spk.enc): los dispositivos del mismo usuario comparten el
        // estado de firma para poder descifrar el self-sync que A cifra con su SPK.
        const nodeA2 = new PeerProcess('200::a2');
        peers.push(nodeA2);
        const a2Info = await nodeA2.start({ routing, mnemonic, sourceDir: aInfo.dir });
        expect(a2Info.upeerId).toBe(aInfo.upeerId);
        expect(a2Info.pubKey).toBe(aInfo.pubKey);

        const bInfo = await nodeB.start({ routing });
        await nodeA.addPeer(nodeB, '200::b');
        await nodeB.addPeer(nodeA, '200::a');
        await nodeA2.request('addPeer', {
            upeerId: bInfo.upeerId,
            address: '200::b',
            publicKey: bInfo.pubKey,
        });
        // A2 (dispositivo 2) se conoce a sí mismo (A = su otro dispositivo) para aceptar el self-sync
        await nodeA2.request('addPeer', {
            upeerId: aInfo.upeerId,
            address: '200::a',
            publicKey: aInfo.pubKey,
        });
        await nodeA2.request('setSpk', {
            upeerId: aInfo.upeerId,
            spkPub: aInfo.spk.spkPub,
            spkSig: aInfo.spk.spkSig,
            spkId: aInfo.spk.spkId,
        });

        // A envía a B; el self-sync se dispara (A descubre su otro dispositivo) y se propaga por red
        await nodeA.request('sendMessage', { to: bInfo.upeerId, content: 'self-sync real' });
        await sleep(900);

        // A2 (dispositivo 2, proceso distinto) recibe el self-sync por red y lo persiste:
        // el handler de chatMessage descifra con su propio SPK (heredado de A) y guarda la copia.
        const a2Messages = await nodeA2.request('getMessages', { contactId: aInfo.upeerId });
        const a2ConversationWithB = await nodeA2.request('getMessages', { contactId: bInfo.upeerId });
        const synced =
            (a2Messages.messages as Array<{ message: string }>).some((m) => m.message === 'self-sync real') ||
            (a2ConversationWithB.messages as Array<{ message: string }>).some((m) => m.message === 'self-sync real');
        expect(synced).toBe(true);
    });

    it('3 peers online con procesos separados: entrega a todos los contactos', async () => {
        const routing = {
            '200::a': await freePort(),
            '200::b': await freePort(),
            '200::c': await freePort(),
        };
        const nodeA = new PeerProcess('200::a');
        const nodeB = new PeerProcess('200::b');
        const nodeC = new PeerProcess('200::c');
        peers.push(nodeA, nodeB, nodeC);

        const aInfo = await nodeA.start({ routing });
        const bInfo = await nodeB.start({ routing });
        const cInfo = await nodeC.start({ routing });

        await nodeA.addPeer(nodeB, '200::b');
        await nodeA.addPeer(nodeC, '200::c');
        await nodeB.addPeer(nodeA, '200::a');
        await nodeB.addPeer(nodeC, '200::c');
        await nodeC.addPeer(nodeA, '200::a');
        await nodeC.addPeer(nodeB, '200::b');

        await nodeA.request('sendMessage', { to: bInfo.upeerId, content: 'para bob' });
        await nodeA.request('sendMessage', { to: cInfo.upeerId, content: 'para carol' });
        await sleep(800);

        const bMessages = await nodeB.request('getMessages', { contactId: aInfo.upeerId });
        const cMessages = await nodeC.request('getMessages', { contactId: aInfo.upeerId });
        expect((bMessages.messages as Array<{ message: string }>).some((m) => m.message === 'para bob')).toBe(true);
        expect((cMessages.messages as Array<{ message: string }>).some((m) => m.message === 'para carol')).toBe(true);
    });

    it('online->offline con procesos separados: el mensaje no se pierde (persistencia local)', async () => {
        const routing = {
            '200::a': await freePort(),
            '200::b': await freePort(),
        };
        const nodeA = new PeerProcess('200::a');
        const nodeB = new PeerProcess('200::b');
        peers.push(nodeA, nodeB);

        await nodeA.start({ routing });
        const bInfo = await nodeB.start({ routing });
        await nodeA.addPeer(nodeB, '200::b');
        await nodeB.addPeer(nodeA, '200::a');

        // B pasa a desconectado; A envía igualmente: el mensaje se persiste en el historial local de A
        await nodeA.request('setContactStatus', { upeerId: bInfo.upeerId, status: 'disconnected' });
        await nodeA.request('sendMessage', { to: bInfo.upeerId, content: 'mensaje mientras offline' });
        await sleep(300);

        const aMessages = await nodeA.request('getMessages', { contactId: bInfo.upeerId });
        expect((aMessages.messages as Array<{ message: string }>).some((m) => m.message === 'mensaje mientras offline')).toBe(true);
    });

    it('eventos con procesos separados: indicador de escritura y recibo de lectura', async () => {
        const routing = {
            '200::a': await freePort(),
            '200::b': await freePort(),
        };
        const nodeA = new PeerProcess('200::a');
        const nodeB = new PeerProcess('200::b');
        peers.push(nodeA, nodeB);

        const aInfo = await nodeA.start({ routing });
        const bInfo = await nodeB.start({ routing });
        await nodeA.addPeer(nodeB, '200::b');
        await nodeB.addPeer(nodeA, '200::a');

        // Evento de escritura: A indica que está escribiendo a B (viaja sellado; se verifica que B recibe tráfico)
        const before = nodeB.rxCount;
        await nodeA.request('sendTyping', { upeerId: bInfo.upeerId });
        await sleep(400);
        expect(nodeB.rxCount).toBeGreaterThan(before);

        // Mensaje + recibo de lectura: A envía a B, B lo marca como leído y A lo refleja como 'read'
        const send = await nodeA.request('sendMessage', { to: bInfo.upeerId, content: 'mensaje leído' });
        const msgId = (send.result as { id: string }).id;
        await sleep(500);
        await nodeB.request('sendReadReceipt', { upeerId: aInfo.upeerId, id: msgId });
        await sleep(400);

        const status = await nodeA.request('getMessageStatus', { id: msgId });
        expect(status.status).toBe('read');
    });

    it('grupos con procesos separados: creación, invitación y fan-out del mensaje a todos los miembros', async () => {
        const routing = {
            '200::a': await freePort(),
            '200::b': await freePort(),
            '200::c': await freePort(),
        };
        const nodeA = new PeerProcess('200::a');
        const nodeB = new PeerProcess('200::b');
        const nodeC = new PeerProcess('200::c');
        peers.push(nodeA, nodeB, nodeC);

        await nodeA.start({ routing });
        const bInfo = await nodeB.start({ routing });
        const cInfo = await nodeC.start({ routing });

        await nodeA.addPeer(nodeB, '200::b');
        await nodeA.addPeer(nodeC, '200::c');
        await nodeB.addPeer(nodeA, '200::a');
        await nodeC.addPeer(nodeA, '200::a');

        const created = await nodeA.request('createGroup', { name: 'equipo', members: [bInfo.upeerId, cInfo.upeerId] });
        const groupId = created.groupId as string;
        expect(groupId).toBeDefined();

        await nodeA.request('inviteToGroup', { groupId, upeerId: bInfo.upeerId });
        await nodeA.request('inviteToGroup', { groupId, upeerId: cInfo.upeerId });
        await sleep(500);

        await nodeA.request('sendGroupMessage', { groupId, message: 'hola al equipo' });
        await sleep(1000);

        // El mensaje de grupo llega y se persiste en todos los miembros (fan-out)
        const bMessages = await nodeB.request('getMessages', { contactId: groupId });
        const cMessages = await nodeC.request('getMessages', { contactId: groupId });
        expect((bMessages.messages as Array<{ message: string }>).some((m) => m.message === 'hola al equipo')).toBe(true);
        expect((cMessages.messages as Array<{ message: string }>).some((m) => m.message === 'hola al equipo')).toBe(true);
    });

    it('adjuntos con procesos separados: transferencia de archivo completada en el receptor', async () => {
        const routing = {
            '200::a': await freePort(),
            '200::b': await freePort(),
        };
        const nodeA = new PeerProcess('200::a');
        const nodeB = new PeerProcess('200::b');
        peers.push(nodeA, nodeB);

        await nodeA.start({ routing });
        const bInfo = await nodeB.start({ routing });
        await nodeA.addPeer(nodeB, '200::b');
        await nodeB.addPeer(nodeA, '200::a');

        const filePath = path.join(os.tmpdir(), `upeer-att-${Date.now()}.txt`);
        fs.writeFileSync(filePath, 'contenido adjunto de prueba');

        await nodeA.request('sendFile', { upeerId: bInfo.upeerId, address: '200::b', filePath });
        await sleep(1800);

        const transfers = await nodeB.request('getTransfers', { direction: 'receiving' });
        const received = transfers.transfers as Array<{ state: string; fileName?: string }>;
        expect(received.some((t) => t.state === 'completed')).toBe(true);
    });

    it('offline->online con procesos separados: recovery del vault tras reconexión', async () => {
        const routing = {
            '200::a': await freePort(),
            '200::b': await freePort(),
        };
        const nodeA = new PeerProcess('200::a');
        const nodeB = new PeerProcess('200::b');
        peers.push(nodeA, nodeB);

        const aStart = await nodeA.start({ routing });
        const bInfo = await nodeB.start({ routing });
        const aId = aStart.upeerId;
        await nodeA.addPeer(nodeB, '200::b');
        await nodeB.addPeer(nodeA, '200::a');

        // Fase offline: A envía a B estando B desconectado -> el mensaje se vaultea (no se pierde)
        await nodeA.request('setContactStatus', { upeerId: bInfo.upeerId, status: 'disconnected' });
        await nodeA.request('sendMessage', { to: bInfo.upeerId, content: 'recupera desde el vault' });
        await sleep(500);
        const aMessages = await nodeA.request('getMessages', { contactId: bInfo.upeerId });
        expect((aMessages.messages as Array<{ message: string }>).some((m) => m.message === 'recupera desde el vault')).toBe(true);

        // Fase reconexión: B vuelve online y consulta su vault; A (custodio) le entrega el mensaje
        await nodeA.request('setContactStatus', { upeerId: bInfo.upeerId, status: 'connected' });
        await nodeB.request('setContactStatus', { upeerId: aId, status: 'connected' });
        await sleep(300);
        await nodeB.request('queryOwnVaults');
        await sleep(1500);

        const bMessages = await nodeB.request('getMessages', { contactId: aId });
        expect((bMessages.messages as Array<{ message: string }>).some((m) => m.message === 'recupera desde el vault')).toBe(true);
    });
});

