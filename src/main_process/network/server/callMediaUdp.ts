import { createSocket } from 'node:dgram';
import type { BrowserWindow } from 'electron';
import { error, warn } from '../../security/secure-logger.js';
import { isBinaryCallMedia } from '../binaryCallMedia.js';
import { isYggdrasilAddress } from '../utils.js';
import { createMediaVerificationWorker } from './mediaWorker.js';
import { getContacts } from '../../storage/contacts/operations.js';
import { callManager } from '../call/callManager.js';
import { sendCallMediaTo } from '../call/callSignaling.js';
import { getMyUPeerId } from '../../security/identity.js';
import { updateContactStatus, updateLastSeen } from '../../storage/contacts/status.js';
import { queryOwnVaultsOnReconnect } from '../handlers.js';
import type { Contact } from '../../../types/chat.js';
import { CALL_MEDIA_UDP_MAX_BYTES, CALL_MEDIA_UDP_PORT } from './constants.js';
import { createSocks5UdpAssociation } from './socks5Udp.js';
import { getCallMediaUdpPort, getCallMediaUdpServer, getMainWindow, getSocks5UdpAssociation, setCallMediaUdpPort, setCallMediaUdpServer, setSocks5UdpAssociation } from './state.js';

let associationStartup: Promise<void> | null = null;
let associationRetryTimer: ReturnType<typeof setTimeout> | null = null;
let worker: ReturnType<typeof createMediaVerificationWorker>['worker'] | null = null;
let workerPort: ReturnType<typeof createMediaVerificationWorker>['port'] | null = null;
let contactRefreshTimer: ReturnType<typeof setInterval> | null = null;
let presenceFlushTimer: ReturnType<typeof setInterval> | null = null;
const verifiedPeers = new Set<string>();
const pendingPresencePeers = new Set<string>();

export function startCallMediaUdpServer(win: BrowserWindow, listenPort = CALL_MEDIA_UDP_PORT): void {
    setCallMediaUdpPort(listenPort);
    startMediaWorker(win);
    if (getCallMediaUdpServer()) {
        startSocksAssociation();
        return;
    }
    const server = createSocket('udp4');
    server.on('message', (packet) => {
        if (packet.length > CALL_MEDIA_UDP_MAX_BYTES || !isBinaryCallMedia(packet)) return;
        if (!workerPort) return;
        try {
            workerPort.postMessage({ type: 'packet', packet: Uint8Array.from(packet), listenPort, sourceAddress: '' });
        } catch (cause) {
            warn('Unable to forward CALL_MEDIA datagram to verifier worker', cause, 'call');
        }
    });
    server.on('error', (cause) => {
        error('CALL_MEDIA UDP listener failed; media remains available over TCP', cause, 'call');
        server.close();
        if (getCallMediaUdpServer() === server) setCallMediaUdpServer(null);
    });
    setCallMediaUdpServer(server);
    server.bind(listenPort, '127.0.0.1', () => startSocksAssociation());
}

export function closeCallMediaUdpServer(): void {
    if (associationRetryTimer) {
        clearTimeout(associationRetryTimer);
        associationRetryTimer = null;
    }
    const server = getCallMediaUdpServer();
    if (server) {
        server.close();
        setCallMediaUdpServer(null);
    }
    const association = getSocks5UdpAssociation();
    if (association) {
        association.close();
        setSocks5UdpAssociation(null);
    }
    workerPort?.close();
    workerPort = null;
    if (contactRefreshTimer) clearInterval(contactRefreshTimer);
    contactRefreshTimer = null;
    if (presenceFlushTimer) clearInterval(presenceFlushTimer);
    presenceFlushTimer = null;
    worker?.kill();
    worker = null;
    verifiedPeers.clear();
    pendingPresencePeers.clear();
}

export function sendCallMediaDatagram(address: string, packet: Buffer, onError?: () => void): boolean {
    let association = getSocks5UdpAssociation();
    if (!getCallMediaUdpServer() || !association || packet.length > CALL_MEDIA_UDP_MAX_BYTES) return false;
    if (!association.isOpen()) {
        association.close();
        setSocks5UdpAssociation(null);
        association = null;
        if (!associationStartup) startSocksAssociation();
        return false;
    }
    return association.send(address, getCallMediaUdpPort(), packet, (cause) => {
        warn('CALL_MEDIA UDP send failed; packet dropped because TCP fallback is disabled', cause, 'call');
        association.close();
        if (getSocks5UdpAssociation() === association) setSocks5UdpAssociation(null);
        onError?.();
    });
}

function startMediaWorker(win: BrowserWindow): void {
    if (worker) return;
    const mediaWorker = createMediaVerificationWorker();
    worker = mediaWorker.worker;
    workerPort = mediaWorker.port;
    workerPort.on('message', ({ data }: { data: { type: string; senderUpeerId: string; senderYggAddress?: string; callId?: string; media?: ArrayBuffer; timestamp?: number } }) => {
        if (data.type !== 'verified-media' || !data.callId || !data.media) return;
        const media = new Uint8Array(data.media);
        if (!verifiedPeers.has(data.senderUpeerId)) {
            verifiedPeers.add(data.senderUpeerId);
            pendingPresencePeers.add(data.senderUpeerId);
        }
        try {
            (getMainWindow() ?? win).webContents.send('call-media', {
                callId: data.callId,
                peerUpeerId: data.senderUpeerId,
                senderUpeerId: data.senderUpeerId,
                timestamp: data.timestamp,
                data: media,
            });
        } catch (cause) {
            warn('Unable to deliver verified CALL_MEDIA to renderer', cause, 'call');
            return;
        }
        const session = callManager.get(data.callId);
        const ownId = getMyUPeerId();
        if (session?.isGroup && session.relayUpeerId === ownId) {
            for (const member of session.groupMembers) {
                if (member !== data.senderUpeerId && member !== ownId) sendCallMediaTo(member, data.callId as string, media, data.senderUpeerId);
            }
        }
    });
    workerPort.start();
    const refreshContacts = () => {
        if (!workerPort) return;
        try {
            workerPort.postMessage({
                type: 'contacts',
                contacts: getContacts().map(({ upeerId, publicKey }) => ({ upeerId, publicKey })),
            });
        } catch (cause) {
            warn('Unable to refresh media verification contacts', cause, 'call');
        }
    };
    refreshContacts();
    contactRefreshTimer = setInterval(refreshContacts, 30_000);
    contactRefreshTimer.unref();
    presenceFlushTimer = setInterval(persistVerifiedPeerPresence, 60_000);
    presenceFlushTimer.unref();
}

function persistVerifiedPeerPresence(): void {
    for (const upeerId of pendingPresencePeers) {
        const contact = getContacts().find((entry) => entry.upeerId === upeerId);
        if (!contact) continue;
        updateLastSeen(upeerId);
        if (isOfflineContact(contact.status)) {
            updateContactStatus(upeerId, 'connected');
            queryOwnVaultsOnReconnect(upeerId);
        }
        pendingPresencePeers.delete(upeerId);
    }
}

function isOfflineContact(status: Contact['status']): boolean {
    return (status as string) === 'offline' || (status as string) === 'disconnected';
}

function startSocksAssociation(): void {
    if (associationStartup || getSocks5UdpAssociation() || !getCallMediaUdpServer()) return;
    associationStartup = createSocks5UdpAssociation(handleAssociatedDatagram).then((association) => {
        if (!getCallMediaUdpServer()) {
            association.close();
            return;
        }
        setSocks5UdpAssociation(association);
    }).catch((cause: unknown) => {
        error('CALL_MEDIA SOCKS5 UDP unavailable; retrying while TCP remains active', cause, 'call');
        if (associationRetryTimer) clearTimeout(associationRetryTimer);
        associationRetryTimer = setTimeout(() => {
            associationRetryTimer = null;
            startSocksAssociation();
        }, 5000);
    }).finally(() => {
        associationStartup = null;
    });
}

function handleAssociatedDatagram(packet: Buffer, address: string): void {
    if (!isBinaryCallMedia(packet)) return;
    if (!isYggdrasilAddress(address) || !workerPort) return;
    try {
        workerPort.postMessage({ type: 'packet', packet: Uint8Array.from(packet), listenPort: getCallMediaUdpPort(), sourceAddress: address });
    } catch (cause) {
        warn('Unable to forward associated CALL_MEDIA datagram to verifier worker', cause, 'call');
    }
}