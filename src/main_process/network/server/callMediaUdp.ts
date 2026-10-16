import { createSocket } from 'node:dgram';
import type { BrowserWindow } from 'electron';
import { error, info, warn } from '../../security/secure-logger.js';
import { isBinaryCallMedia } from '../binaryCallMedia.js';
import { isYggdrasilAddress } from '../utils.js';
import { createMediaVerificationWorker } from './mediaWorker.js';
import { getContacts } from '../../storage/contacts/operations.js';
import { callManager } from '../call/callManager.js';
import { sendCallMediaTo } from '../call/callSignaling.js';
import { callFanoutPolicy } from '../call/callFanoutPolicy.js';
import { getMyUPeerId } from '../../security/identity.js';
import { updateContactStatus, updateLastSeen } from '../../storage/contacts/status.js';
import { queryOwnVaultsOnReconnect } from '../handlers.js';
import type { Contact } from '../../../types/chat.js';
import { CALL_MEDIA_UDP_MAX_BYTES, CALL_MEDIA_UDP_PORT } from './constants.js';
import { createSocks5UdpAssociation } from './socks5Udp.js';
import { clearCallMediaAssemblies, fragmentCallMediaPacket, reassembleCallMediaDatagram } from './callMediaFragments.js';
import { getCallMediaUdpPort, getCallMediaUdpServer, getMainWindow, getSocks5UdpAssociation, setCallMediaUdpPort, setCallMediaUdpServer, setSocks5UdpAssociation } from './state.js';

let associationStartup: Promise<void> | null = null;
let associationRetryTimer: ReturnType<typeof setTimeout> | null = null;
let worker: ReturnType<typeof createMediaVerificationWorker>['worker'] | null = null;
let workerPort: ReturnType<typeof createMediaVerificationWorker>['port'] | null = null;
let contactRefreshTimer: ReturnType<typeof setInterval> | null = null;
let presenceFlushTimer: ReturnType<typeof setInterval> | null = null;
const verifiedPeers = new Set<string>();
const pendingPresencePeers = new Set<string>();
const mediaStageLogged = new Set<string>();
let firstMediaDatagramLogged = false;

export function startCallMediaUdpServer(win: BrowserWindow, listenPort = CALL_MEDIA_UDP_PORT): void {
    setCallMediaUdpPort(listenPort);
    startMediaWorker(win);
    if (getCallMediaUdpServer()) {
        startSocksAssociation();
        return;
    }
    const server = createSocket('udp4');
    server.on('message', (packet) => {
        const completePacket = reassembleCallMediaDatagram(packet);
        if (!completePacket) return;
        if (completePacket.length > 600_000 || !isBinaryCallMedia(completePacket)) {
            logMediaStageOnce('invalid-datagram', 'CALL_MEDIA UDP datagram rejected before verification', { datagramBytes: packet.length, packetBytes: completePacket.length, binaryMedia: isBinaryCallMedia(completePacket) });
            return;
        }
        if (!workerPort) {
            logMediaStageOnce('worker-unavailable', 'CALL_MEDIA UDP datagram received but verifier worker is unavailable', { packetBytes: completePacket.length });
            return;
        }
        if (!firstMediaDatagramLogged) {
            firstMediaDatagramLogged = true;
            info('CALL_MEDIA UDP datagram reassembled and forwarded to verifier', { packetBytes: completePacket.length }, 'call');
        }
        try {
            workerPort.postMessage({ type: 'packet', packet: Uint8Array.from(completePacket), listenPort, sourceAddress: '' });
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
    mediaStageLogged.clear();
    firstMediaDatagramLogged = false;
    clearCallMediaAssemblies();
}

export function sendCallMediaDatagram(address: string, packet: Buffer, onError?: () => void): boolean {
    let association = getSocks5UdpAssociation();
    if (!getCallMediaUdpServer() || !association) {
        logMediaStageOnce('outbound-unavailable', 'CALL_MEDIA UDP send blocked because listener or SOCKS5 UDP association is unavailable', { listenerReady: Boolean(getCallMediaUdpServer()), associationReady: Boolean(association), packetBytes: packet.length });
        return false;
    }
    if (!association.isOpen()) {
        association.close();
        setSocks5UdpAssociation(null);
        association = null;
        if (!associationStartup) startSocksAssociation();
        return false;
    }
    try {
        const fragments = fragmentCallMediaPacket(packet, CALL_MEDIA_UDP_MAX_BYTES);
        if (!mediaStageLogged.has('outbound-sent')) {
            mediaStageLogged.add('outbound-sent');
            info('CALL_MEDIA UDP fragments submitted to SOCKS5 relay', { packetBytes: packet.length, fragmentCount: fragments.length }, 'call');
        }
        let accepted = true;
        for (const fragment of fragments) {
            const sent = association.send(address, getCallMediaUdpPort(), fragment, (cause) => {
                warn('CALL_MEDIA UDP fragment send failed; packet dropped because TCP fallback is disabled', cause, 'call');
                association?.close();
                if (getSocks5UdpAssociation() === association) setSocks5UdpAssociation(null);
                onError?.();
            });
            if (!sent) {
                accepted = false;
                break;
            }
        }
        return accepted;
    } catch (cause) {
        warn('CALL_MEDIA UDP packet exceeds fragmentation limits', cause, 'call');
        return false;
    }
}

function startMediaWorker(win: BrowserWindow): void {
    if (worker) return;
    const mediaWorker = createMediaVerificationWorker();
    worker = mediaWorker.worker;
    workerPort = mediaWorker.port;
    worker.on?.('error', (cause) => {
        error('CALL_MEDIA verifier utility process error', cause, 'call');
    });
    worker.on?.('exit', (code) => {
        if (code === 0) {
            info('CALL_MEDIA verifier utility process stopped', { exitCode: code }, 'call');
            return;
        }
        error('CALL_MEDIA verifier utility process exited unexpectedly', { exitCode: code }, 'call');
    });
    workerPort.on('message', ({ data }: { data: { type: string; senderUpeerId: string; senderYggAddress?: string; callId?: string; media?: ArrayBuffer; timestamp?: number } }) => {
        if (data.type === 'diagnostic') {
            const { stage, reason, ...details } = data as unknown as { stage: string; reason: string; [key: string]: unknown };
            const senderUpeerId = typeof details.senderUpeerId === 'string' ? details.senderUpeerId : '';
            const callId = typeof details.callId === 'string' ? details.callId : '';
            logMediaStageOnce(`${stage}:${reason}:${senderUpeerId}:${callId}`, `CALL_MEDIA ${stage} diagnostic: ${reason}`, details);
            return;
        }
        if (data.type === 'worker-status') {
            const status = data as unknown as { status: string; contactCount?: number };
            logMediaStageOnce(`worker-status:${status.status}`, `CALL_MEDIA verifier worker status: ${status.status}`, { contactCount: status.contactCount });
            return;
        }
        if (data.type !== 'verified-media' || !data.callId || !data.media) return;
        const media = new Uint8Array(data.media);
        logMediaStageOnce(`ipc:${data.senderUpeerId}:${data.callId}`, 'CALL_MEDIA verified and delivered to renderer IPC', { senderUpeerId: data.senderUpeerId, callId: data.callId, mediaBytes: media.byteLength });
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
        if (session?.isGroup && session.relayUpeerId === ownId && callFanoutPolicy.shouldForwardVideo(data.callId, data.senderUpeerId, media)) {
            for (const member of session.groupMembers) {
                if (member !== data.senderUpeerId && member !== ownId) sendCallMediaTo(member, data.callId as string, media, data.senderUpeerId);
            }
        }
    });
    workerPort.start();
    const refreshContacts = () => {
        if (!workerPort) return;
        try {
            const contacts = getContacts().map(({ upeerId, publicKey }) => ({ upeerId, publicKey }));
            if (!mediaStageLogged.has('contacts-sent')) {
                mediaStageLogged.add('contacts-sent');
                info('CALL_MEDIA contact keys sent to verifier worker', { contactCount: contacts.length }, 'call');
            }
            workerPort.postMessage({
                type: 'contacts',
                contacts,
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

function logMediaStageOnce(key: string, message: string, details: Record<string, unknown>): void {
    if (mediaStageLogged.has(key)) return;
    mediaStageLogged.add(key);
    info(message, details, 'call');
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
        error('CALL_MEDIA SOCKS5 UDP association unavailable; retrying UDP association', cause, 'call');
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
    const completePacket = reassembleCallMediaDatagram(packet);
    if (!completePacket || !isBinaryCallMedia(completePacket)) return;
    if (!isYggdrasilAddress(address) || !workerPort) return;
    try {
        workerPort.postMessage({ type: 'packet', packet: Uint8Array.from(completePacket), listenPort: getCallMediaUdpPort(), sourceAddress: address });
    } catch (cause) {
        warn('Unable to forward associated CALL_MEDIA datagram to verifier worker', cause, 'call');
    }
}