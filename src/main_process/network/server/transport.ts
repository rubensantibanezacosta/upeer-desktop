import type net from 'node:net';
import {
    getMyUPeerId,
    sign
} from '../../security/identity.js';
import { error } from '../../security/secure-logger.js';
import { getYggstackAddress, onYggstackAddress, onYggstackStatus } from '../../sidecars/yggstack.js';
import { SEALED_TYPES, sealPacket } from '../sealed.js';
import {
    canonicalStringify,
    getNetworkAddress,
    isYggdrasilAddress
} from '../utils.js';
import {
    isIPBlocked,
    isIPUnreachable,
    recordIPFailure,
    recordIPSuccess,
} from './circuitBreaker.js';
import {
    MAX_QUEUE_SIZE,
    YGG_PORT,
} from './constants.js';
import { encodeFrame, socks5Connect } from './socks5.js';
import {
    addToSendQueue,
    clearSendQueue,
    getNetworkReady,
    getSendQueue,
    getTcpServer,
    setNetworkReady
} from './state.js';

export { isIPUnreachable };

const SOCKET_IDLE_MS = 1500;

type PendingFrame = {
    framedBuf: Buffer;
    isFileTransfer: boolean;
    isProbeTraffic: boolean;
};

type TransportPacket = {
    type?: string;
    signature?: string;
    contactCache?: unknown;
    renewalToken?: unknown;
    [key: string]: unknown;
};

type SignedTransportPacket = TransportPacket & {
    senderUpeerId: string;
    senderYggAddress: string;
    isInternalSync: boolean;
    signature: string;
};

type PooledConnection = {
    socket?: net.Socket;
    connectPromise?: Promise<net.Socket>;
    queue: PendingFrame[];
    flushing: boolean;
    idleTimer?: ReturnType<typeof setTimeout>;
};

const connectionPool = new Map<string, PooledConnection>();

export function resetTransportConnectionsForTests(): void {
    Array.from(connectionPool.keys()).forEach(destroyConnection);
}

function clearIdleTimer(entry: PooledConnection): void {
    if (entry.idleTimer) {
        clearTimeout(entry.idleTimer);
        entry.idleTimer = undefined;
    }
}

function destroyConnection(ip: string): void {
    const entry = connectionPool.get(ip);
    if (!entry) return;
    clearIdleTimer(entry);
    try {
        entry.socket?.destroy?.();
    } catch {
        error(`TCP pooled socket destroy error for ${ip}`, undefined, 'network');
    }
    connectionPool.delete(ip);
}

function scheduleIdleClose(ip: string, entry: PooledConnection): void {
    clearIdleTimer(entry);
    entry.idleTimer = setTimeout(() => {
        const current = connectionPool.get(ip);
        if (!current || current.queue.length > 0 || current.flushing) return;
        destroyConnection(ip);
    }, SOCKET_IDLE_MS);
}

async function getOrCreateSocket(ip: string, entry: PooledConnection): Promise<net.Socket> {
    if (entry.socket && !entry.socket.destroyed) return entry.socket;
    if (!entry.connectPromise) {
        entry.connectPromise = socks5Connect(ip, YGG_PORT)
            .then((sock) => {
                entry.socket = sock;
                entry.connectPromise = undefined;
                if (typeof sock.on === 'function') {
                    sock.on('error', () => destroyConnection(ip));
                    sock.on('close', () => destroyConnection(ip));
                }
                return sock;
            })
            .catch((err: Error) => {
                entry.connectPromise = undefined;
                destroyConnection(ip);
                throw err;
            });
    }
    return entry.connectPromise;
}

async function flushConnection(ip: string): Promise<void> {
    const entry = connectionPool.get(ip);
    if (!entry || entry.flushing) return;
    entry.flushing = true;
    clearIdleTimer(entry);

    try {
        while (entry.queue.length > 0) {
            const item = entry.queue[0];
            const sock = await getOrCreateSocket(ip, entry);
            await new Promise<void>((resolve, reject) => {
                const onError = (err: Error) => reject(err);
                if (typeof sock.once === 'function') sock.once('error', onError);
                const done = (err?: Error | null) => {
                    if (typeof sock.off === 'function') sock.off('error', onError);
                    if (err) reject(err);
                    else resolve();
                };
                const writeResult = sock.write(item.framedBuf, done);
                if (writeResult === false && typeof sock.once === 'function') {
                    sock.once('drain', () => resolve());
                }
            });

            entry.queue.shift();
            if (!item.isFileTransfer) recordIPSuccess(ip);
        }
    } catch (_err: unknown) {
        const failed = entry.queue.shift();
        destroyConnection(ip);
        error(`TCP send error to ${ip}: ${_err instanceof Error ? _err.message : String(_err)}`, undefined, 'network');
        if (failed && !failed.isFileTransfer) recordIPFailure(ip);
    } finally {
        const current = connectionPool.get(ip);
        if (current) {
            current.flushing = false;
            if (current.queue.length > 0) {
                queueMicrotask(() => {
                    void flushConnection(ip);
                });
            } else {
                scheduleIdleClose(ip, current);
            }
        }
    }
}

function enqueueForSend(ip: string, framedBuf: Buffer, isFileTransfer: boolean, isProbeTraffic: boolean): void {
    const entry = connectionPool.get(ip) || { queue: [], flushing: false };
    entry.queue.push({ framedBuf, isFileTransfer, isProbeTraffic });
    connectionPool.set(ip, entry);
    void flushConnection(ip);
}

export function drainSendQueue(): void {
    const queue = getSendQueue();
    if (queue.length === 0) return;
    const toSend = queue.splice(0);
    for (const { ip, framedBuf } of toSend) {
        enqueueForSend(ip, framedBuf, false, false);
    }
}

onYggstackStatus((status) => {
    if (status === 'down' || status === 'reconnecting') {
        setNetworkReady(false);
        clearSendQueue();
        Array.from(connectionPool.keys()).forEach(destroyConnection);
    }
});

onYggstackAddress(() => {
    setNetworkReady(true);
    drainSendQueue();
});

export function sendSecureUDPMessage(ip: string, data: TransportPacket, recipientPubKeyHex?: string, isInternalSync = false): void {
    if (!getTcpServer()) return;
    if (!isYggdrasilAddress(ip)) return;

    const myId = getMyUPeerId();
    const fieldsToExclude = ['contactCache', 'renewalToken', 'signature'];
    const dataForSignature = { ...data };
    fieldsToExclude.forEach(field => {
        if (field in dataForSignature) delete dataForSignature[field];
    });

    const senderYggAddress = getYggstackAddress() ?? getNetworkAddress() ?? '';
    const payloadToSign = {
        ...dataForSignature,
        senderUpeerId: myId,
        senderYggAddress,
        isInternalSync
    };
    const signature = sign(Buffer.from(canonicalStringify(payloadToSign)));
    const signedInner = {
        ...data,
        senderUpeerId: myId,
        senderYggAddress,
        isInternalSync,
        signature: signature.toString('hex')
    };

    let packetToSend: TransportPacket | SignedTransportPacket;
    if (recipientPubKeyHex && SEALED_TYPES.has(data.type)) {
        packetToSend = sealPacket(signedInner, recipientPubKeyHex);
    } else {
        packetToSend = signedInner;
    }

    const rawBuf = Buffer.from(JSON.stringify(packetToSend));
    const framedBuf = encodeFrame(rawBuf);

    if (!getNetworkReady()) {
        const isFileChunk = data.type === 'FILE_CHUNK' || data.type === 'FILE_START' || data.type === 'FILE_ACK';
        if (!isFileChunk && getSendQueue().length < MAX_QUEUE_SIZE) {
            addToSendQueue({ ip, framedBuf });
        }
        return;
    }

    const type = typeof data.type === 'string' ? data.type : '';
    const isFileTransfer = type.startsWith('FILE_');
    const isProbeTraffic = type.startsWith('DHT_') || type === 'PING' || type === 'PONG' || type === 'TYPING';

    if (isProbeTraffic && isIPBlocked(ip)) return;

    enqueueForSend(ip, framedBuf, isFileTransfer, isProbeTraffic);
}
