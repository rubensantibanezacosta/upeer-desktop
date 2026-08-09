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

    it('llamada de voz P2P: señalización CALL_* entre procesos con aceptación y media', async () => {
        type CallState = { phase?: string; kind?: string; callId?: string };
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
        await sleep(200);

        const start = await nodeA.request('startCall', { upeerId: bInfo.upeerId, kind: 'audio' });
        expect(start.ok).toBe(true);
        const callId = start.callId as string;
        await sleep(500);

        const bCall = await nodeB.request('getActiveCall');
        expect((bCall.call as CallState | null)?.phase).toBe('incoming-ringing');
        expect((bCall.call as CallState | null)?.kind).toBe('audio');

        const aCall = await nodeA.request('getActiveCall');
        expect((aCall.call as CallState | null)?.phase).toBe('outgoing-ringing');
        expect((aCall.call as CallState | null)?.callId).toBe(callId);

        await nodeB.request('acceptCall');
        await sleep(500);
        const aAfter = await nodeA.request('getActiveCall');
        expect((aAfter.call as CallState | null)?.phase).toBe('negotiating');

        await nodeA.request('connectCall');
        await nodeB.request('connectCall');
        await sleep(200);
        const aConn = await nodeA.request('getActiveCall');
        expect((aConn.call as CallState | null)?.phase).toBe('connected');

        await nodeA.request('endCall');
        await sleep(500);
        const aAfterEnd = await nodeA.request('getActiveCall');
        expect(aAfterEnd.call).toBeNull();
        const bAfterEnd = await nodeB.request('getActiveCall');
        expect(bAfterEnd.call).toBeNull();
    });

    it('llamada de grupo mesh: multiparty con 3 procesos y fan-out de media', async () => {
        type CallState = { phase?: string; isGroup?: boolean; groupMembers?: string[] };
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
        await nodeB.addPeer(nodeA, '200::a');
        await nodeA.addPeer(nodeC, '200::c');
        await nodeC.addPeer(nodeA, '200::a');
        await nodeB.addPeer(nodeC, '200::c');
        await nodeC.addPeer(nodeB, '200::b');
        await sleep(300);

        const start = await nodeA.request('startGroupCall', { members: [bInfo.upeerId, cInfo.upeerId], kind: 'audio' });
        expect(start.ok).toBe(true);
        const callId = start.callId as string;
        await sleep(600);

        const aCall = await nodeA.request('getActiveCall');
        expect((aCall.call as CallState | null)?.phase).toBe('outgoing-ringing');
        expect((aCall.call as CallState | null)?.isGroup).toBe(true);

        const bCall = await nodeB.request('getActiveCall');
        expect((bCall.call as CallState | null)?.phase).toBe('incoming-ringing');
        expect((bCall.call as CallState | null)?.groupMembers).toContain(cInfo.upeerId);

        await nodeB.request('acceptCall');
        await nodeC.request('acceptCall');
        await sleep(600);

        await nodeA.request('connectCall');
        await nodeB.request('connectCall');
        await nodeC.request('connectCall');
        await sleep(200);

        await nodeA.request('sendMedia', { data: 'frame-1' });
        await sleep(400);

        const bEvents = await nodeB.request('getSentEvents');
        expect((bEvents.events as Array<{ channel: string }>).some((event) => event.channel === 'call-media')).toBe(true);
        const cEvents = await nodeC.request('getSentEvents');
        expect((cEvents.events as Array<{ channel: string }>).some((event) => event.channel === 'call-media')).toBe(true);

        const aConn = await nodeA.request('getActiveCall');
        expect((aConn.call as CallState | null)?.phase).toBe('connected');
        expect(callId.length).toBe(32);
    });

    it('compresión de mensajes: mensaje largo se comprime y llega descomprimido', async () => {
        const routing = {
            '200::a': await freePort(),
            '200::b': await freePort(),
        };
        const nodeA = new PeerProcess('200::a');
        const nodeB = new PeerProcess('200::b');
        peers.push(nodeA, nodeB);

        const aStart = await nodeA.start({ routing });
        const aInfo = aStart.upeerId;
        const bInfo = await nodeB.start({ routing });
        await nodeA.addPeer(nodeB, '200::b');
        await nodeB.addPeer(nodeA, '200::a');
        await sleep(200);

        const longText = 'Lorem ipsum dolor sit amet consectetur adipiscing elit '.repeat(30);
        expect(longText.length).toBeGreaterThan(512);
        await nodeA.request('sendMessage', { to: bInfo.upeerId, content: longText });
        await sleep(900);

        const bMessages = await nodeB.request('getMessages', { contactId: aInfo });
        const received = (bMessages.messages as Array<{ message: string }>).find((m) => m.message === longText);
        expect(received).toBeTruthy();
    });

    it('adjunto offline->online: recovery del multimedia vaulteado tras reconexión', { timeout: 30000 }, async () => {
        const routing = {
            '200::a': await freePort(),
            '200::b': await freePort(),
        };
        const nodeA = new PeerProcess('200::a');
        const nodeB = new PeerProcess('200::b');
        peers.push(nodeA, nodeB);

        await nodeA.start({ routing });
        const aId = nodeA.info?.upeerId || '';
        const bInfo = await nodeB.start({ routing });
        await nodeA.addPeer(nodeB, '200::b');
        await nodeB.addPeer(nodeA, '200::a');
        await sleep(200);

        const filePath = path.join(os.tmpdir(), `upeer-att-offline-${Date.now()}.txt`);
        fs.writeFileSync(filePath, 'contenido multimedia offline que debe recuperarse del vault');

        // Fase offline: B no responde a propuestas de archivo y A lo ve desconectado.
        // El envío de A debe fallar al vaulting (nunca se acepta directo).
        await nodeB.request('setVaultOffline', { value: true });
        await nodeA.request('setContactStatus', { upeerId: bInfo.upeerId, status: 'disconnected' });
        await sleep(200);
        await nodeA.request('sendFile', { upeerId: bInfo.upeerId, address: '200::b', filePath });
        await sleep(4000);

        const aSending = await nodeA.request('getTransfers', { direction: 'sending' });
        const sending = aSending.transfers as Array<{ state: string; phase?: string; isVaulting?: boolean }>;
        const vaulted = sending.find((t) => t.state === 'active' && (t.isVaulting || t.phase === 'replicating'));
        expect(vaulted).toBeTruthy();

        // Fase reconexión: B vuelve online y consulta su vault; A le entrega el archivo
        await nodeB.request('setVaultOffline', { value: false });
        await nodeA.request('setContactStatus', { upeerId: bInfo.upeerId, status: 'connected' });
        await nodeB.request('setContactStatus', { upeerId: aId, status: 'connected' });
        await sleep(300);
        await nodeB.request('queryOwnVaults');
        await sleep(5000);

        const bReceiving = await nodeB.request('getTransfers', { direction: 'receiving' });
        const received = bReceiving.transfers as Array<{ state: string; fileName?: string }>;
        expect(received.some((t) => t.state === 'completed')).toBe(true);
    });

    it('recovery offline->online: todos los tipos de adjunto (nota de voz, imagen, documento) vaulteados', { timeout: 40000 }, async () => {
        const routing = {
            '200::a': await freePort(),
            '200::b': await freePort(),
        };
        const nodeA = new PeerProcess('200::a');
        const nodeB = new PeerProcess('200::b');
        peers.push(nodeA, nodeB);

        await nodeA.start({ routing });
        const aId = nodeA.info?.upeerId || '';
        const bInfo = await nodeB.start({ routing });
        await nodeA.addPeer(nodeB, '200::b');
        await nodeB.addPeer(nodeA, '200::a');
        await sleep(200);

        const stamp = Date.now();
        const voicePath = path.join(os.tmpdir(), `upeer-voice-${stamp}.ogg`);
        const imagePath = path.join(os.tmpdir(), `upeer-img-${stamp}.png`);
        const docPath = path.join(os.tmpdir(), `upeer-doc-${stamp}.pdf`);
        fs.writeFileSync(voicePath, 'nota de voz codificada en ogg');
        fs.writeFileSync(imagePath, 'datos de imagen png');
        fs.writeFileSync(docPath, '%PDF-1.4 datos de documento');

        // Fase offline: B no acepta propuestas → A vaultea cada adjunto
        await nodeB.request('setVaultOffline', { value: true });
        await nodeA.request('setContactStatus', { upeerId: bInfo.upeerId, status: 'disconnected' });
        await sleep(200);
        await nodeA.request('sendFile', { upeerId: bInfo.upeerId, address: '200::b', filePath: voicePath, isVoiceNote: true });
        await nodeA.request('sendFile', { upeerId: bInfo.upeerId, address: '200::b', filePath: imagePath, caption: 'foto' });
        await nodeA.request('sendFile', { upeerId: bInfo.upeerId, address: '200::b', filePath: docPath });
        await sleep(5000);

        const aSending = await nodeA.request('getTransfers', { direction: 'sending' });
        const sending = aSending.transfers as Array<{ state: string; phase?: string; isVaulting?: boolean }>;
        const vaulted = sending.filter((t) => t.state === 'active' && (t.isVaulting || t.phase === 'replicating'));
        expect(vaulted.length).toBeGreaterThanOrEqual(1);

        // Fase reconexión
        await nodeB.request('setVaultOffline', { value: false });
        await nodeA.request('setContactStatus', { upeerId: bInfo.upeerId, status: 'connected' });
        await nodeB.request('setContactStatus', { upeerId: aId, status: 'connected' });
        await sleep(300);
        await nodeB.request('queryOwnVaults');
        await sleep(8000);

        const bReceiving = await nodeB.request('getTransfers', { direction: 'receiving' });
        const received = bReceiving.transfers as Array<{ state: string; fileName?: string; mimeType?: string; isVoiceNote?: boolean; caption?: string }>;
        const completed = received.filter((t) => t.state === 'completed');

        const voice = completed.find((t) => t.fileName?.endsWith('.ogg'));
        const image = completed.find((t) => t.fileName?.endsWith('.png'));
        const doc = completed.find((t) => t.fileName?.endsWith('.pdf'));

        expect(voice).toBeTruthy();
        expect(voice?.isVoiceNote).toBe(true);
        expect(voice?.mimeType).toContain('audio');
        expect(image).toBeTruthy();
        expect(image?.mimeType).toContain('image');
        expect(image?.caption).toBe('foto');
        expect(doc).toBeTruthy();
        expect(doc?.mimeType).toBe('application/pdf');
    });

    it('recovery offline->online: edición (CHAT_UPDATE) vaulteada se aplica al reconectar', { timeout: 30000 }, async () => {
        const routing = {
            '200::a': await freePort(),
            '200::b': await freePort(),
        };
        const nodeA = new PeerProcess('200::a');
        const nodeB = new PeerProcess('200::b');
        peers.push(nodeA, nodeB);

        await nodeA.start({ routing });
        const aId = nodeA.info?.upeerId || '';
        const bInfo = await nodeB.start({ routing });
        await nodeA.addPeer(nodeB, '200::b');
        await nodeB.addPeer(nodeA, '200::a');
        await sleep(200);

        // B offline: A envía un mensaje (vaulteado) y luego lo edita (también vaulteado)
        const send = await nodeA.request('sendMessage', { to: bInfo.upeerId, content: 'versión original' });
        const msgId = (send.result as { id: string }).id;
        await nodeB.request('setVaultOffline', { value: true });
        await nodeA.request('setContactStatus', { upeerId: bInfo.upeerId, status: 'disconnected' });
        await sleep(200);
        await nodeA.request('sendChatUpdate', { upeerId: bInfo.upeerId, msgId, newContent: 'versión editada' });
        await sleep(1500);

        // Reconexión: B consulta su vault y debe aplicar la edición
        await nodeB.request('setVaultOffline', { value: false });
        await nodeA.request('setContactStatus', { upeerId: bInfo.upeerId, status: 'connected' });
        await nodeB.request('setContactStatus', { upeerId: aId, status: 'connected' });
        await sleep(300);
        await nodeB.request('queryOwnVaults');
        await sleep(5000);

        const bMsg = await nodeB.request('getMessageById', { id: msgId });
        expect((bMsg.message as { message: string } | null)?.message).toBe('versión editada');
    });

    it('recovery offline->online: borrado (CHAT_DELETE) vaulteado se aplica al reconectar', { timeout: 30000 }, async () => {
        const routing = {
            '200::a': await freePort(),
            '200::b': await freePort(),
        };
        const nodeA = new PeerProcess('200::a');
        const nodeB = new PeerProcess('200::b');
        peers.push(nodeA, nodeB);

        await nodeA.start({ routing });
        const aId = nodeA.info?.upeerId || '';
        const bInfo = await nodeB.start({ routing });
        await nodeA.addPeer(nodeB, '200::b');
        await nodeB.addPeer(nodeA, '200::a');
        await sleep(200);

        const send = await nodeA.request('sendMessage', { to: bInfo.upeerId, content: 'a borrar' });
        const msgId = (send.result as { id: string }).id;
        await nodeB.request('setVaultOffline', { value: true });
        await nodeA.request('setContactStatus', { upeerId: bInfo.upeerId, status: 'disconnected' });
        await sleep(200);
        await nodeA.request('sendChatDelete', { upeerId: bInfo.upeerId, msgId });
        await sleep(1500);

        await nodeB.request('setVaultOffline', { value: false });
        await nodeA.request('setContactStatus', { upeerId: bInfo.upeerId, status: 'connected' });
        await nodeB.request('setContactStatus', { upeerId: aId, status: 'connected' });
        await sleep(300);
        await nodeB.request('queryOwnVaults');
        await sleep(5000);

        const bMsg = await nodeB.request('getMessageById', { id: msgId });
        const bMsgRecord = bMsg.message as { isDeleted?: boolean; message?: string } | null;
        expect(bMsgRecord?.isDeleted).toBe(true);
        expect(bMsgRecord?.message).toBe('Mensaje eliminado');
    });

    it('recovery offline->online: reacción (CHAT_REACTION) vaulteada se aplica al reconectar', { timeout: 30000 }, async () => {
        const routing = {
            '200::a': await freePort(),
            '200::b': await freePort(),
        };
        const nodeA = new PeerProcess('200::a');
        const nodeB = new PeerProcess('200::b');
        peers.push(nodeA, nodeB);

        await nodeA.start({ routing });
        const aId = nodeA.info?.upeerId || '';
        const bInfo = await nodeB.start({ routing });
        await nodeA.addPeer(nodeB, '200::b');
        await nodeB.addPeer(nodeA, '200::a');
        await sleep(200);

        const send = await nodeA.request('sendMessage', { to: bInfo.upeerId, content: 'con reacción' });
        const msgId = (send.result as { id: string }).id;
        await nodeB.request('setVaultOffline', { value: true });
        await nodeA.request('setContactStatus', { upeerId: bInfo.upeerId, status: 'disconnected' });
        await sleep(200);
        await nodeA.request('sendChatReaction', { upeerId: bInfo.upeerId, msgId, emoji: '👍', remove: false });
        await sleep(1500);

        await nodeB.request('setVaultOffline', { value: false });
        await nodeA.request('setContactStatus', { upeerId: bInfo.upeerId, status: 'connected' });
        await nodeB.request('setContactStatus', { upeerId: aId, status: 'connected' });
        await sleep(300);
        await nodeB.request('queryOwnVaults');
        await sleep(5000);

        const reactions = await nodeB.request('getReactions', { id: msgId });
        expect((reactions.reactions as Array<{ emoji: string }>).some((r) => r.emoji === '👍')).toBe(true);
    });

    it('recovery offline->online: recibo de lectura (READ) vaulteado se aplica al reconectar', { timeout: 30000 }, async () => {
        const routing = {
            '200::a': await freePort(),
            '200::b': await freePort(),
        };
        const nodeA = new PeerProcess('200::a');
        const nodeB = new PeerProcess('200::b');
        peers.push(nodeA, nodeB);

        await nodeA.start({ routing });
        const aId = nodeA.info?.upeerId || '';
        const bInfo = await nodeB.start({ routing });
        await nodeA.addPeer(nodeB, '200::b');
        await nodeB.addPeer(nodeA, '200::a');
        await sleep(200);

        // A envía a B (online) para que B tenga el mensaje y pueda enviar el READ
        const send = await nodeA.request('sendMessage', { to: bInfo.upeerId, content: 'mensaje con read' });
        const msgId = (send.result as { id: string }).id;
        await sleep(500);

        // A offline: B marca como leído → READ vaulteado para A
        await nodeA.request('setVaultOffline', { value: true });
        await nodeB.request('setContactStatus', { upeerId: aId, status: 'disconnected' });
        await sleep(200);
        await nodeB.request('sendReadReceipt', { upeerId: aId, id: msgId });
        await sleep(1500);

        // A reconecta y recupera el READ del vault
        await nodeA.request('setVaultOffline', { value: false });
        await nodeB.request('setContactStatus', { upeerId: aId, status: 'connected' });
        await nodeA.request('setContactStatus', { upeerId: bInfo.upeerId, status: 'connected' });
        await sleep(300);
        await nodeA.request('queryOwnVaults');
        await sleep(5000);

        const status = await nodeA.request('getMessageStatus', { id: msgId });
        expect(status.status).toBe('read');
    });

    it('recovery offline->online: grupo vaulteado (mensaje) se entrega al reconectar', { timeout: 30000 }, async () => {
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
        await sleep(300);

        const created = await nodeA.request('createGroup', { name: 'g-offline', members: [bInfo.upeerId, cInfo.upeerId] });
        const groupId = created.groupId as string;
        await sleep(1200);

        // Verifica que B tiene el grupo (recibió la invitación online)
        const bGroupsPre = await nodeB.request('getGroups');
        expect((bGroupsPre.groups as Array<{ groupId: string }>).some((g) => g.groupId === groupId)).toBe(true);

        // B offline: A envía mensaje de grupo → se vaultea para B
        await nodeB.request('setVaultOffline', { value: true });
        await nodeA.request('setContactStatus', { upeerId: bInfo.upeerId, status: 'disconnected' });
        await sleep(200);
        await nodeA.request('sendGroupMessage', { groupId, message: 'mensaje de grupo offline' });
        await sleep(2000);

        // B reconecta y recupera el mensaje de grupo del vault
        await nodeB.request('setVaultOffline', { value: false });
        await nodeA.request('setContactStatus', { upeerId: bInfo.upeerId, status: 'connected' });
        await nodeB.request('setContactStatus', { upeerId: cInfo.upeerId, status: 'connected' });
        await sleep(300);
        await nodeB.request('queryOwnVaults');
        await sleep(5000);

        const bMessages = await nodeB.request('getMessages', { contactId: groupId });
        expect((bMessages.messages as Array<{ message: string }>).some((m) => m.message === 'mensaje de grupo offline')).toBe(true);
    });
});

