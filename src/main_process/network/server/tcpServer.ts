import net from 'node:net';
import { app } from 'electron';
import { BrowserWindow } from 'electron';
import { network, error } from '../../security/secure-logger.js';
import { getMyUPeerId } from '../../security/identity.js';
import { getContacts } from '../../storage/contacts/operations.js';
import { onYggstackAddress } from '../../sidecars/yggstack.js';
import { handlePacket } from '../handlers.js';
import { startDhtSearch } from '../dht/core.js';
import { KademliaDHT } from '../dht/kademlia/main.js';
import { setKademliaInstance, performDhtMaintenance } from '../dht/handlers.js';
import { fileTransferManager } from '../file-transfer/transfer-manager.js';
import { getNetworkAddress } from '../utils.js';

import { YGG_PORT, MAX_FRAME_BYTES } from './constants.js';
import {
    setMainWindow,
    getTcpServer,
    setTcpServer,
    setKademliaDHT,
    setDhtMaintenanceTimer,
    getDhtMaintenanceTimer,
    getMainWindow,
} from './state.js';
import { sendSecureUDPMessage } from './transport.js';
import { drainSendQueue } from './transport.js';

export function startUDPServer(win: BrowserWindow) {
    setMainWindow(win);
    if (getTcpServer()) {
        // Ya arrancado (e.g. identidad restaurada en arranque, ahora se llama de nuevo)
        return;
    }

    // ── Servidor TCP de entrada ──────────────────────────────────────────────
    // Escucha en localhost:50005. El tráfico Yggdrasil entrante llega aquí
    // gracias a que yggstack lo reenvía con \"-remote-tcp 50005\".
    const tcpServer = net.createServer((socket) => {
        // El remoteAddress puede ser 127.0.0.1 (yggstack forward).
        // La dirección real del peer viene firmada dentro del paquete (senderYggAddress).
        const peerHint = socket.remoteAddress || '127.0.0.1';
        let frameBuf = Buffer.alloc(0);

        socket.on('data', async (chunk: Buffer) => {
            frameBuf = Buffer.concat([frameBuf, chunk]);
            // BUG V fix: sin este límite un peer malicioso puede enviar
            // un msgLen de 0xFFFFFFFF y seguir mandando bytes indefinidamente
            // hasta agotar la RAM del proceso (OOM DoS).
            // 10MB es más que suficiente para cualquier frame legítimo.
            if (frameBuf.length > MAX_FRAME_BYTES + 4) {
                socket.destroy();
                error('TCP: frameBuf demasiado grande, conexión cerrada (DoS?)', {
                    size: frameBuf.length,
                    peer: peerHint
                }, 'network');
                return;
            }
            // Desencuadrar todos los mensajes disponibles (framing 4B-length)
            while (frameBuf.length >= 4) {
                const msgLen = frameBuf.readUInt32BE(0);
                // Rechazar frames individuales exageradamente grandes antes de esperar
                // acumular esos bytes (protección adicional en el caso de un header falso).
                if (msgLen > MAX_FRAME_BYTES) {
                    socket.destroy();
                    error('TCP: frame individual demasiado grande, conexión cerrada', {
                        msgLen,
                        peer: peerHint
                    }, 'network');
                    return;
                }
                if (frameBuf.length < 4 + msgLen) break;
                const msg = frameBuf.subarray(4, 4 + msgLen);
                frameBuf = frameBuf.subarray(4 + msgLen);
                const rinfo = { address: peerHint, port: socket.remotePort || 0 };
                try {
                    await handlePacket(
                        msg,
                        rinfo,
                        getMainWindow(),
                        sendSecureUDPMessage,
                        (rid) => startDhtSearch(rid, sendSecureUDPMessage)
                    );
                } catch (err) {
                    error('TCP: handlePacket fallo', { peer: peerHint, error: err instanceof Error ? err.message : String(err) }, 'network');
                }
            }
        });

        socket.on('error', (err) => {
            error('TCP: socket de entrada cerrado con error', { peer: peerHint, error: err.message }, 'network');
        });
    });

    tcpServer.on('error', (err) => {
        error('TCP Server Error', err, 'network');
    });

    // Initialize file transfer manager
    fileTransferManager.initialize(sendSecureUDPMessage, win);

    // Initialize Kademlia DHT
    const userDataPath = app.getPath('userData');
    const kademliaContacts = () => getContacts()
        .filter(c => !!c.address && !!c.publicKey)
        .map(c => ({
            nodeId: Buffer.from(c.upeerId, 'hex').subarray(0, 20),
            upeerId: c.upeerId,
            address: c.address || '',
            publicKey: c.publicKey || '',
            lastSeen: Date.now(),
        }));
    const kademliaDHT = new KademliaDHT(getMyUPeerId(), sendSecureUDPMessage, kademliaContacts, userDataPath);
    setKademliaDHT(kademliaDHT);
    setKademliaInstance(kademliaDHT);

    // Start DHT maintenance interval (every hour)
    const dhtMaintenanceTimer = setInterval(() => {
        if (kademliaDHT) {
            kademliaDHT.performMaintenance();
        }
        performDhtMaintenance().catch(err => {
            error('DHT maintenance error', err, 'dht');
        });

        import('../../storage/vault/operations.js').then(({ cleanupExpiredVaultEntries }) => {
            cleanupExpiredVaultEntries().catch(err => {
                error('Vault cleanup error', err, 'vault');
            });
        });

        // BUG AP fix: rateLimiter.cleanup() nunca se llamaba → los Maps buckets e
        // identityBuckets crecían indefinidamente con cada IP/identidad única que
        // contactaba el nodo. Bajo DDoS con IPs spoofadas, esto agota la RAM del proceso.
        // El cleanup() elimina entradas sin actividad en la última hora.
        import('../handlers.js').then(({ cleanupRateLimiter }) => {
            cleanupRateLimiter();
        }).catch((err) => {
            error('Rate limiter cleanup error', err, 'network');
        });
    }, 3600000);
    setDhtMaintenanceTimer(dhtMaintenanceTimer);

    try {
        tcpServer.listen(YGG_PORT, '::1', () => {
            const networkAddr = getNetworkAddress();
            network('TCP P2P server listening', undefined, {
                port: YGG_PORT,
                yggAddress: networkAddr ?? 'pendiente'
            }, 'network');

            // Disparar operaciones de red cuando yggstack confirme su dirección IPv6
            // (= tiene al menos un peer conectado y puede enrutar tráfico).
            onYggstackAddress(() => {
                // networkReady is set by transport module
                drainSendQueue();

                // Consultar mensajes offline almacenados en vaults de amigos
                import('../vault/manager.js').then(({ VaultManager }) => {
                    VaultManager.queryOwnVaults('startup');
                }).catch(err => error('Failed to query vaults on start', err, 'vault'));

                // Arrancar worker de reparación de vault (lazy mode)
                import('../vault/repair-worker.js').then(({ RepairWorker }) => {
                    RepairWorker.start();
                }).catch(err => error('Failed to start repair worker', err, 'vault'));
            });
        });
        setTcpServer(tcpServer);
    } catch (e) {
        error('Failed to start TCP server', e, 'network');
    }
}

export function closeUDPServer() {
    const timer = getDhtMaintenanceTimer();
    if (timer) {
        clearInterval(timer);
        setDhtMaintenanceTimer(null);
    }
    const tcpServer = getTcpServer();
    if (tcpServer) {
        tcpServer.close();
        setTcpServer(null);
    }
}