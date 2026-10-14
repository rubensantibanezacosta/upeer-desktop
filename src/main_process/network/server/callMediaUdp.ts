import { createSocket } from 'node:dgram';
import type { BrowserWindow } from 'electron';
import { error, warn } from '../../security/secure-logger.js';
import { getMyUPeerId } from '../../security/identity.js';
import { handlePacket } from '../handlers.js';
import { decodeBinaryCallMedia, isBinaryCallMedia } from '../binaryCallMedia.js';
import { isYggdrasilAddress } from '../utils.js';
import { CALL_MEDIA_UDP_MAX_BYTES, CALL_MEDIA_UDP_PORT } from './constants.js';
import { createSocks5UdpAssociation, sameIPv6Address } from './socks5Udp.js';
import { getCallMediaUdpPort, getCallMediaUdpServer, getMainWindow, getSocks5UdpAssociation, setCallMediaUdpPort, setCallMediaUdpServer, setSocks5UdpAssociation } from './state.js';

let associationStartup: Promise<void> | null = null;
let associationRetryTimer: ReturnType<typeof setTimeout> | null = null;

export function startCallMediaUdpServer(win: BrowserWindow, listenPort = CALL_MEDIA_UDP_PORT): void {
    setCallMediaUdpPort(listenPort);
    if (getCallMediaUdpServer()) {
        startSocksAssociation();
        return;
    }
    const server = createSocket('udp4');
    server.on('message', (packet) => {
        if (packet.length > CALL_MEDIA_UDP_MAX_BYTES || !isBinaryCallMedia(packet)) return;
        const decoded = decodeBinaryCallMedia(packet);
        const senderAddress = typeof decoded?.senderYggAddress === 'string' ? decoded.senderYggAddress : '';
        const senderId = typeof decoded?.senderUpeerId === 'string' ? decoded.senderUpeerId : '';
        if (!isYggdrasilAddress(senderAddress) || !senderId || senderId === getMyUPeerId()) return;
        void handlePacket(
            packet,
            { address: senderAddress, port: listenPort },
            getMainWindow() ?? win,
            () => undefined,
            () => undefined,
        );
    });
    server.on('error', (cause) => {
        error('CALL_MEDIA UDP listener failed; media remains available over TCP', cause, 'call');
        server.close();
        if (getCallMediaUdpServer() === server) setCallMediaUdpServer(null);
    });
    setCallMediaUdpServer(server);
    server.bind(listenPort, '127.0.0.1', () => {
        startSocksAssociation();
    });
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
}

export function sendCallMediaDatagram(address: string, packet: Buffer, onError?: () => void): boolean {
    let association = getSocks5UdpAssociation();
    if (!getCallMediaUdpServer() || !association || packet.length > CALL_MEDIA_UDP_MAX_BYTES) return false;
    if (!association.isOpen()) {
        association.close();
        setSocks5UdpAssociation(null);
        association = null;
        if (!associationStartup) {
            startSocksAssociation();
        }
        return false;
    }
    return association.send(address, getCallMediaUdpPort(), packet, (cause) => {
        warn('CALL_MEDIA UDP send failed; packet dropped because TCP fallback is disabled', cause, 'call');
        association.close();
        if (getSocks5UdpAssociation() === association) setSocks5UdpAssociation(null);
        onError?.();
    });
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
    const decoded = decodeBinaryCallMedia(packet);
    if (typeof decoded?.senderYggAddress !== 'string' || !sameIPv6Address(decoded.senderYggAddress, address)) return;
    getCallMediaUdpServer()?.emit('message', packet);
}