import net from 'node:net';
import crypto from 'node:crypto';
import { BrowserWindow } from 'electron';
import {
    saveMessage,
    updateMessageStatus,
    getContactByUpeerId,
    updateContactPublicKey,
    getContacts,
    saveReaction,
    deleteReaction,
    updateMessageContent,
    deleteMessageLocally,
    getGroupById,
    saveGroup,
    updateGroupMembers,
    updateGroupInfo,
} from '../storage/db.js';
import {
    getMyPublicKeyHex,
    getMyUPeerId,
    getMyAlias,
    getMyAvatar,
    sign,
    encrypt,
    getMyEphemeralPublicKeyHex,
    incrementEphemeralMessageCounter,
    isSessionLocked,
    getMySignedPreKeyBundle,
    getMyIdentitySkBuffer,
    getMyIdentityPkBuffer,
} from '../security/identity.js';
import { AdaptivePow } from '../security/pow.js';
import { network, warn, error } from '../security/secure-logger.js';
import {
    canonicalStringify,
    getNetworkAddress
} from './utils.js';
import { getYggstackAddress, onYggstackAddress, onYggstackStatus } from '../sidecars/yggstack.js';
import { handlePacket } from './handlers.js';
import { sealPacket, SEALED_TYPES } from './sealed.js';
import { broadcastDhtUpdate as coreBroadcastDhtUpdate, sendDhtExchange, startDhtSearch } from './dht/core.js';
import { app } from 'electron';
import { KademliaDHT } from './dht/kademlia/index.js';
import { setKademliaInstance, performDhtMaintenance } from './dht/handlers.js';
import { fileTransferManager } from './file-transfer/index.js';



const YGG_PORT = 50005;
const SOCKS5_HOST = '127.0.0.1';
const SOCKS5_PORT = 9050;

// ─────────────────────────────────────────────────────────────────────────────
// CAPA DE TRANSPORTE TCP + SOCKS5
//
// Con yggstack en modo user-space (sin TUN/TAP) el tráfico P2P usa TCP:
//
//  ENTRANTE:  [peer-ygg]:50005 → yggstack (-remote-tcp 50005) → localhost:50005
//             → tcpServer (net.Server) → handlePacket
//
//  SALIENTE:  sendSecureUDPMessage(ip, data)
//             → socks5Connect(ip, 50005)   (a través del proxy yggstack)
//             → escribe paquete JSON con framing 4B-length
//             → nodo destino recibe en su tcpServer local
//
// El nombre "sendSecureUDPMessage" se conserva para no cambiar la API pública.
// ─────────────────────────────────────────────────────────────────────────────

let tcpServer: net.Server | null = null;
let mainWindow: BrowserWindow | null = null;
let kademliaDHT: KademliaDHT | null = null;
let dhtMaintenanceTimer: ReturnType<typeof setInterval> | null = null;

// ── Circuit breaker por IP ────────────────────────────────────────────────────
// Evita intentar enviar mensajes a IPs inalcanzables de forma repetitiva.
// Cada fallo incrementa un contador y el backoff se duplica hasta un tope.
// Cuando la IP vuelve a responder (conexión exitosa), el estado se limpia.

const BACKOFF_STEPS_MS = [
    30_000,      // 30 s  (1º fallo)
    2 * 60_000,  // 2 min
    10 * 60_000, // 10 min
    30 * 60_000, // 30 min (tope)
];

interface IPFailState {
    failures: number;
    blockedUntil: number; // timestamp ms
}

const ipFailMap = new Map<string, IPFailState>();

function isIPBlocked(ip: string): boolean {
    const s = ipFailMap.get(ip);
    if (!s) return false;
    return Date.now() < s.blockedUntil;
}

function recordIPFailure(ip: string): void {
    const s = ipFailMap.get(ip) ?? { failures: 0, blockedUntil: 0 };
    s.failures++;
    const backoffMs = BACKOFF_STEPS_MS[Math.min(s.failures - 1, BACKOFF_STEPS_MS.length - 1)];
    s.blockedUntil = Date.now() + backoffMs;
    ipFailMap.set(ip, s);
    // Solo logear en el primer fallo de cada ventana para no saturar los logs
    if (s.failures === 1) {
        error(`TCP send error to ${ip} (contacto inalcanzable, backoff ${backoffMs / 1000}s)`, undefined, 'network');
    }
}

function recordIPSuccess(ip: string): void {
    ipFailMap.delete(ip);
}

/** True si el IP está fallando pero ya conociómos el problema (silenciar heartbeat) */
export function isIPUnreachable(ip: string): boolean {
    return ipFailMap.has(ip) && isIPBlocked(ip);
}

// ── Ready gate ───────────────────────────────────────────────────────────────
// yggstack necesita tiempo para conectar a sus peers antes de poder enrutar
// tráfico. Hasta que la red esté lista (detectamos la IPv6), los mensajes
// salientes se encolan (máx. MAX_QUEUE_SIZE) para no perderlos ni saturar
// la consola con errores de "SOCKS5 timeout".
const MAX_QUEUE_SIZE = 60;
let networkReady = false;
const sendQueue: Array<{ ip: string; framedBuf: Buffer }> = [];

function drainSendQueue(): void {
    if (sendQueue.length === 0) return;
    network('Red lista — enviando mensajes en cola', undefined, { queued: sendQueue.length }, 'network');
    const toSend = sendQueue.splice(0);
    for (const { ip, framedBuf } of toSend) {
        socks5Connect(ip, YGG_PORT)
            .then((sock) => {
                sock.write(framedBuf);
                sock.end(() => sock.destroy());
            })
            .catch((err: Error) => {
                error(`TCP send error (drain) to ${ip}`, err, 'network');
            });
    }
}

// Escuchar caídas / reconexiones de yggstack para gestionar el ready-gate
onYggstackStatus((status) => {
    if (status === 'down' || status === 'reconnecting') {
        networkReady = false;
        sendQueue.length = 0; // descartar mensajes en cola (stale)
        network('Red Yggdrasil no disponible — mensajes salientes pausados', undefined, { status }, 'network');
    }
    // 'up' lo maneja onYggstackAddress → drainSendQueue()
});

// ── Framing ──────────────────────────────────────────────────────────────────
// Cada mensaje TCP = 4 bytes big-endian (longitud del payload) + payload JSON.

function encodeFrame(data: Buffer): Buffer {
    const len = Buffer.allocUnsafe(4);
    len.writeUInt32BE(data.length, 0);
    return Buffer.concat([len, data]);
}

// ── SOCKS5 CONNECT (implementación inline, sin dependencias extra) ─────────────
// Soporta direcciones IPv6 Yggdrasil (200::/7) y hostname.

function parseIPv6ToBuffer(addr: string): Buffer {
    // Quitar corchetes si los hay
    addr = addr.replace(/^\[|\]$/g, '');
    // Expandir "::"
    const halves = addr.split('::');
    let groups: string[];
    if (halves.length === 2) {
        const left = halves[0] ? halves[0].split(':') : [];
        const right = halves[1] ? halves[1].split(':') : [];
        const fill = Array(8 - left.length - right.length).fill('0');
        groups = [...left, ...fill, ...right];
    } else {
        groups = addr.split(':');
    }
    const buf = Buffer.allocUnsafe(16);
    for (let i = 0; i < 8; i++) buf.writeUInt16BE(parseInt(groups[i] ?? '0', 16), i * 2);
    return buf;
}

function socks5Connect(host: string, port: number): Promise<net.Socket> {
    return new Promise((resolve, reject) => {
        const socket = net.createConnection({ host: SOCKS5_HOST, port: SOCKS5_PORT });
        let state: 'greeting' | 'connect' = 'greeting';
        let buf = Buffer.alloc(0);

        socket.setTimeout(8000);
        socket.on('timeout', () => { socket.destroy(); reject(new Error('SOCKS5 timeout')); });
        socket.on('error', reject);

        socket.once('connect', () => {
            // Saludo SOCKS5: versión 5, 1 método, sin autenticación
            socket.write(Buffer.from([0x05, 0x01, 0x00]));
        });

        socket.on('data', (chunk: Buffer) => {
            buf = Buffer.concat([buf, chunk]);

            if (state === 'greeting') {
                if (buf.length < 2) return;
                if (buf[0] !== 0x05 || buf[1] !== 0x00) {
                    socket.destroy();
                    reject(new Error(`SOCKS5 auth rechazado: ${buf[1]}`));
                    return;
                }
                buf = buf.subarray(2);
                state = 'connect';

                // Construir petición CONNECT IPv6
                try {
                    const addrBuf = parseIPv6ToBuffer(host);
                    const portBuf = Buffer.allocUnsafe(2);
                    portBuf.writeUInt16BE(port, 0);
                    // VER=5, CMD=CONNECT, RSV=0, ATYP=4 (IPv6)
                    socket.write(Buffer.concat([Buffer.from([0x05, 0x01, 0x00, 0x04]), addrBuf, portBuf]));
                } catch (e) { socket.destroy(); reject(e); }
                return;
            }

            if (state === 'connect') {
                // Respuesta mínima: VER REP RSV ATYP + addr + port (≥10 bytes)
                if (buf.length < 10) return;
                socket.removeAllListeners('data');
                socket.setTimeout(0);
                if (buf[1] !== 0x00) {
                    socket.destroy();
                    reject(new Error(`SOCKS5 CONNECT fallido: código ${buf[1]}`));
                    return;
                }
                resolve(socket);
            }
        });
    });
}

export function startUDPServer(win: BrowserWindow) {
    mainWindow = win;
    if (tcpServer) {
        // Ya arrancado (e.g. identidad restaurada en arranque, ahora se llama de nuevo)
        return;
    }

    // ── Servidor TCP de entrada ──────────────────────────────────────────────
    // Escucha en localhost:50005. El tráfico Yggdrasil entrante llega aquí
    // gracias a que yggstack lo reenvía con "-remote-tcp 50005".
    tcpServer = net.createServer((socket) => {
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
            const MAX_FRAME_BYTES = 10 * 1024 * 1024;
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
                await handlePacket(
                    msg,
                    rinfo,
                    mainWindow,
                    sendSecureUDPMessage,
                    (rid) => startDhtSearch(rid, sendSecureUDPMessage)
                );
            }
        });

        socket.on('error', () => { /* conexiones cerradas abruptamente son normales en P2P */ });
    });

    tcpServer.on('error', (err) => {
        error('TCP Server Error', err, 'network');
    });

    // Initialize file transfer manager
    fileTransferManager.initialize(sendSecureUDPMessage, win);

    // Initialize Kademlia DHT
    const userDataPath = app.getPath('userData');
    kademliaDHT = new KademliaDHT(getMyUPeerId(), sendSecureUDPMessage, getContacts, userDataPath);
    setKademliaInstance(kademliaDHT);

    // Start DHT maintenance interval (every hour)
    dhtMaintenanceTimer = setInterval(() => {
        if (kademliaDHT) {
            kademliaDHT.performMaintenance();
        }
        performDhtMaintenance().catch(err => {
            error('DHT maintenance error', err, 'dht');
        });

        import('../storage/vault/index.js').then(({ cleanupExpiredVaultEntries }) => {
            cleanupExpiredVaultEntries().catch(err => {
                error('Vault cleanup error', err, 'vault');
            });
        });

        // BUG AP fix: rateLimiter.cleanup() nunca se llamaba → los Maps buckets e
        // identityBuckets crecían indefinidamente con cada IP/identidad única que
        // contactaba el nodo. Bajo DDoS con IPs spoofadas, esto agota la RAM del proceso.
        // El cleanup() elimina entradas sin actividad en la última hora.
        import('./handlers.js').then(({ cleanupRateLimiter }) => {
            cleanupRateLimiter();
        }).catch(() => { });
    }, 3600000);

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
                networkReady = true;
                drainSendQueue();

                // Consultar mensajes offline almacenados en vaults de amigos
                import('./vault/manager.js').then(({ VaultManager }) => {
                    VaultManager.queryOwnVaults();
                }).catch(err => error('Failed to query vaults on start', err, 'vault'));

                // Arrancar worker de reparación de vault (lazy mode)
                import('./vault/repair-worker.js').then(({ RepairWorker }) => {
                    RepairWorker.start();
                }).catch(err => error('Failed to start repair worker', err, 'vault'));
            });
        });
    } catch (e) {
        error('Failed to start TCP server', e, 'network');
    }
}


/**
 * Decide si usar cifrado efímero para un contacto.
 *
 * La clave efímera rota cada 5 minutos. Si un peer estuvo offline durante un
 * período prolongado, su copia de nuestra eph public key estará caducada y
 * no podrá descifrar mensajes cifrados con ella. En ese caso usamos la clave
 * estática (Ed25519→Curve25519) que nunca rota y garantiza la entrega.
 *
 * Umbral: si no hemos visto al peer en las últimas 2 horas, forzamos static.
 * Esto cubre la rotación de claves (cada 5 min × ring-buffer de 6 = 30 min)
 * con margen amplio, y preserva el forward secrecy para conversaciones activas.
 */
// Ventana de frescura de la clave efímera: si el peer no ha enviado una nueva
// eph key en más de 2 horas, caemos al key estático Ed25519 que nunca rota.
// De esta forma, peers que llevan semanas/meses offline siguen recibiendo mensajes.
const EPH_FRESHNESS_MS = 2 * 60 * 60 * 1000; // 2 horas
function shouldUseEphemeral(contact: any): boolean {
    if (!contact?.ephemeralPublicKey) return false;
    // Usar ephemeralPublicKeyUpdatedAt (timestamp preciso de cuándo se recibió la
    // clave efímera) en lugar de lastSeen (que se actualiza con cualquier PING/PONG
    // y por tanto siempre es reciente, haciendo la comprobación inútil).
    const updatedAt = contact.ephemeralPublicKeyUpdatedAt
        ? new Date(contact.ephemeralPublicKeyUpdatedAt).getTime()
        : 0;
    return updatedAt > 0 && (Date.now() - updatedAt) < EPH_FRESHNESS_MS;
}

export function sendSecureUDPMessage(ip: string, data: any, recipientPubKeyHex?: string) {
    if (!tcpServer) return;

    const myId = getMyUPeerId();
    const fieldsToExclude = ['contactCache', 'renewalToken'];
    const dataForSignature = { ...data };
    fieldsToExclude.forEach(field => {
        if (field in dataForSignature) delete dataForSignature[field];
    });
    // senderYggAddress se incluye en la firma para que nadie pueda falsificarla
    // y redirigir respuestas a una IP víctima (address spoofing).
    const senderYggAddress = getYggstackAddress() ?? getNetworkAddress() ?? '';
    const payloadToSign = { ...dataForSignature, senderUpeerId: myId, senderYggAddress };
    const signature = sign(Buffer.from(canonicalStringify(payloadToSign)));
    const signedInner = {
        ...data,
        senderUpeerId: myId,
        senderYggAddress,
        signature: signature.toString('hex')
    };

    // ── Sealed Sender ──────────────────────────────────────────────────────
    // Si tenemos la clave pública del destinatario y el tipo de mensaje lo requiere,
    // envolvemos el paquete firmado en un sobre SEALED.
    // Esto oculta senderUpeerId del tráfico en red (solo el destinatario puede leerlo).
    let packetToSend: any;
    if (recipientPubKeyHex && SEALED_TYPES.has(data.type)) {
        packetToSend = sealPacket(signedInner, recipientPubKeyHex);
    } else {
        packetToSend = signedInner;
    }

    const rawBuf = Buffer.from(JSON.stringify(packetToSend));
    const framedBuf = encodeFrame(rawBuf);

    // Si la red aún no está lista (yggstack conectando), encolar y salir.
    // Los chunks de transferencia de ficheros se descartan para no saturar la cola
    // (la transferencia se retransmite automáticamente por su propio mecanismo).
    if (!networkReady) {
        const isFileChunk = data.type === 'FILE_CHUNK' || data.type === 'FILE_START' || data.type === 'FILE_ACK';
        if (!isFileChunk && sendQueue.length < MAX_QUEUE_SIZE) {
            sendQueue.push({ ip, framedBuf });
        }
        return;
    }

    // Envío asíncrono fire-and-forget mediante conexión TCP a través del proxy SOCKS5
    if (isIPBlocked(ip)) return; // circuit breaker activo para esta IP

    socks5Connect(ip, YGG_PORT)
        .then((sock) => {
            recordIPSuccess(ip);
            sock.write(framedBuf);
            // Dar tiempo a que el buffer TCP se vacíe antes de cerrar
            sock.end(() => sock.destroy());
        })
        .catch((err: Error) => {
            recordIPFailure(ip);
        });
}

export async function sendContactRequest(targetIp: string) {
    // Generate PoW proof for Sybil resistance (light proof for mobile compatibility)
    const powProof = AdaptivePow.generateLightProof(getMyUPeerId());

    const data = {
        type: 'HANDSHAKE_REQ',
        publicKey: getMyPublicKeyHex(),
        ephemeralPublicKey: getMyEphemeralPublicKeyHex(),
        signedPreKey: getMySignedPreKeyBundle(), // ← X3DH / Double Ratchet
        alias: getMyAlias() || undefined,
        avatar: getMyAvatar() || undefined,
        powProof
    };
    sendSecureUDPMessage(targetIp, data);
}

export async function acceptContactRequest(upeerId: string, publicKey: string) {
    const contact = await getContactByUpeerId(upeerId);
    if (!contact) return;

    updateContactPublicKey(upeerId, publicKey);

    const data = {
        type: 'HANDSHAKE_ACCEPT',
        publicKey: getMyPublicKeyHex(),
        ephemeralPublicKey: getMyEphemeralPublicKeyHex(),
        signedPreKey: getMySignedPreKeyBundle(), // ← X3DH / Double Ratchet
        alias: getMyAlias() || undefined,
        avatar: getMyAvatar() || undefined
    };
    sendSecureUDPMessage(contact.address, data);
}

export async function sendUDPMessage(upeerId: string, message: string | { [key: string]: any }, replyTo?: string): Promise<string | undefined> {
    const myId = getMyUPeerId();
    const msgId = crypto.randomUUID();
    const content = typeof message === 'string' ? message : (message as any).content;

    const contact = await getContactByUpeerId(upeerId);
    if (!contact || contact.status !== 'connected' || !contact.publicKey) {
        // Fix 3 — Resiliencia para contactos sin clave pública aún (nunca han conectado):
        // En vez de descartar el mensaje, lo guardamos cifrado por SQLCipher en la outbox local.
        // Se vaultea automáticamente cuando Bob conecte y enviemos su primer HANDSHAKE.
        if (contact && !contact.publicKey) {
            // Persistir localmente para que el usuario vea el mensaje en el historial.
            // No hay firma aún (se firmará al vaultear durante el flush del outbox).
            saveMessage(msgId, upeerId, true, content, replyTo, '', 'sent');
            const { savePendingOutboxMessage } = await import('../storage/pending-outbox.js');
            await savePendingOutboxMessage(upeerId, msgId, content, replyTo);
            warn('No pubkey for contact, message queued in pending outbox', { upeerId }, 'vault');
            return msgId;
        }
        return undefined;
    }

    // ── Cifrado: Double Ratchet (preferido) o crypto_box (fallback) ──────────
    let ratchetHeader: Record<string, unknown> | undefined;
    let x3dhInit: Record<string, unknown> | undefined;
    let contentHex: string;
    let nonceHex: string;
    let ephPubKey: string | undefined;
    let useEphemeralFlag: boolean | undefined;

    try {
        const { getRatchetSession, saveRatchetSession } = await import('../storage/ratchet/index.js');
        const { x3dhInitiator, ratchetInitAlice, ratchetEncrypt } = await import('../security/ratchet.js');

        let session = getRatchetSession(upeerId);

        if (!session && contact.signedPreKey) {
            // No hay sesión pero el contacto tiene SPK → X3DH + iniciar como Alice
            const myIkSk = getMyIdentitySkBuffer();
            const myIkPk = getMyIdentityPkBuffer();
            const bobIkPk = Buffer.from(contact.publicKey, 'hex');
            const bobSpkPk = Buffer.from(contact.signedPreKey as string, 'hex');

            const { sharedSecret, ekPub } = x3dhInitiator(myIkSk, myIkPk, bobIkPk, bobSpkPk);
            session = ratchetInitAlice(sharedSecret, bobSpkPk);
            sharedSecret.fill(0);

            x3dhInit = {
                ekPub: ekPub.toString('hex'),
                spkId: contact.signedPreKeyId,
                ikPub: myIkPk.toString('hex'),
            };
            saveRatchetSession(upeerId, session, contact.signedPreKeyId as number | undefined);
        }

        if (session) {
            const { header, ciphertext, nonce } = ratchetEncrypt(session, Buffer.from(content, 'utf-8'));
            saveRatchetSession(upeerId, session);
            ratchetHeader = header as unknown as Record<string, unknown>;
            contentHex = ciphertext;
            nonceHex = nonce;
        } else {
            throw new Error('no-session'); // caer en crypto_box
        }
    } catch {
        // Fallback: cifrado legacy crypto_box (peers sin soporte DR)
        const useEphemeral = shouldUseEphemeral(contact);
        const targetKeyHex = useEphemeral ? contact.ephemeralPublicKey : contact.publicKey;
        ephPubKey = getMyEphemeralPublicKeyHex();
        const { ciphertext, nonce } = encrypt(
            Buffer.from(content, 'utf-8'),
            Buffer.from(targetKeyHex, 'hex'),
            useEphemeral
        );
        if (useEphemeral) incrementEphemeralMessageCounter();
        useEphemeralFlag = useEphemeral;
        contentHex = ciphertext.toString('hex');
        nonceHex = nonce.toString('hex');
    }

    const data = {
        type: 'CHAT',
        id: msgId,
        content: contentHex,
        nonce: nonceHex,
        // Double Ratchet (si disponible)
        ...(ratchetHeader ? { ratchetHeader } : {}),
        ...(x3dhInit ? { x3dhInit } : {}),
        // Legacy crypto_box (si DR no disponible)
        ...(ephPubKey ? { ephemeralPublicKey: ephPubKey } : {}),
        ...(useEphemeralFlag !== undefined ? { useRecipientEphemeral: useEphemeralFlag } : {}),
        replyTo: replyTo
    };

    // Contact cache removed for privacy reasons - use DHT and renewal tokens instead
    // Previously: attached top contacts for extreme resilience
    // Now: relying on DHT persistence (30 days) and renewal tokens for resilience

    const signature = sign(Buffer.from(canonicalStringify(data)));
    const isToSelf = upeerId === getMyUPeerId();
    saveMessage(msgId, upeerId, true, content, replyTo, signature.toString('hex'), isToSelf ? 'read' : 'sent');

    // Multi-device: send to every known address (same mnemonic → same ID, different Yggdrasil IPs).
    // Se pasa contact.publicKey para activar Sealed Sender en todos los envíos de CHAT.
    const chatAddresses: string[] = [];
    if (contact.address) chatAddresses.push(contact.address);
    try {
        const known: string[] = JSON.parse((contact as any).knownAddresses ?? '[]');
        for (const addr of known) {
            if (!chatAddresses.includes(addr)) chatAddresses.push(addr);
        }
    } catch { /* malformed JSON – ignore */ }
    for (const addr of chatAddresses) {
        sendSecureUDPMessage(addr, data, contact.publicKey); // ← Sealed Sender
    }

    // BUG FM fix: el callback async de setTimeout carecía de try/catch.
    // Cualquier excepción interna (crypto, import dinámico, DB) se convertía en
    // una unhandled promise rejection silenciosa que no reintentaba el vault.
    setTimeout(async () => {
        try {
            const { getMessageStatus } = await import('../storage/db.js');
            const status = await getMessageStatus(msgId);
            if (status === 'sent') {
                warn('Message not delivered, starting vault replication', { msgId, upeerId }, 'vault');

                // ── Vault copy: re-cifrar con crypto_box estático ─────────────────
                // El paquete `data` puede contener ratchetHeader (DR). El vault NO debe
                // almacenar el paquete DR porque:
                //   a) El estado DR del receptor puede desincronizarse (reset de app, migración).
                //   b) El vault custodio no necesita conocer el esquema de cifrado interno.
                // En su lugar, re-ciframos con la clave estática del contacto (siempre disponible).
                // Si el receptor no ha rotado su clave de identidad (TOFU), esto es siempre descifrable.
                const freshContact = await getContactByUpeerId(upeerId);
                if (!freshContact?.publicKey) return;

                const { encrypt: encStatic } = await import('../security/identity.js');
                const vaultEncrypted = encStatic(
                    Buffer.from(content, 'utf-8'),
                    Buffer.from(freshContact.publicKey, 'hex'),
                    false  // static key, no ephemeral — vault delivery siempre usa clave estática
                );

                const vaultData = {
                    type: 'CHAT',
                    id: msgId,
                    content: vaultEncrypted.ciphertext.toString('hex'),
                    nonce: vaultEncrypted.nonce.toString('hex'),
                    // No ratchetHeader: el receptor descifra con crypto_box al recibir del vault
                    replyTo: replyTo
                };

                // Prepare a fully signed packet for the vault (inner packet).
                // IMPORTANTE: la firma debe ser sobre vaultData (cifrado estático),
                // NO sobre `data` que contiene el ciphertext DR/ephemeral diferente.
                // La verificación en handleVaultDelivery hace:
                //   verify(canonicalStringify(innerData), innerSig)  donde innerData == vaultData
                const vaultSig = sign(Buffer.from(canonicalStringify(vaultData)));
                const innerPacket = {
                    ...vaultData,
                    senderUpeerId: myId,
                    signature: vaultSig.toString('hex')
                };

                // Try to backup the message in friends' vaults
                const { VaultManager } = await import('./vault/manager.js');
                const nodes = await VaultManager.replicateToVaults(upeerId, innerPacket);

                if (nodes > 0) {
                    const { updateMessageStatus } = await import('../storage/db.js');
                    updateMessageStatus(msgId, 'vaulted' as any);
                    const { BrowserWindow } = await import('electron');
                    BrowserWindow.getAllWindows()[0]?.webContents.send('message-status-updated', { id: msgId, status: 'vaulted' });
                }

                // Also start a DHT search in case the peer moved
                startDhtSearch(upeerId, sendSecureUDPMessage);
            }
        } catch (err) {
            error('Vault fallback setTimeout failed', err, 'vault');
        }
    }, 5000);

    return msgId;
}


export function checkHeartbeat(contacts: any[]) {
    for (const contact of contacts) {
        if (contact.status === 'connected') {
            // Si la IP está en backoff (falla repetida), omitir este ciclo
            if (isIPBlocked(contact.address)) continue;

            sendSecureUDPMessage(contact.address, {
                type: 'PING',
                alias: getMyAlias() || undefined,
                avatar: getMyAvatar() || undefined,
            });
            sendDhtExchange(contact.upeerId, sendSecureUDPMessage);

            // Enhanced distributed heartbeat with contact cache exchange
            distributedHeartbeat(contact, sendSecureUDPMessage).catch(err => {
                warn('Distributed heartbeat failed', err, 'heartbeat');
            });
        }
    }
}

// ========================
// Distributed Heartbeat Protocol for Extreme Resilience
// ========================

async function distributedHeartbeat(contact: any, sendSecureUDPMessage: (ip: string, data: any) => void) {
    const myId = getMyUPeerId();

    // 1. Exchange location blocks
    await exchangeLocationBlocks(contact, sendSecureUDPMessage);

    // 2. Exchange lists of alive contacts
    const aliveContacts = getContactsSeenLast24h();
    await sendContactList(contact, aliveContacts, sendSecureUDPMessage);

    // 3. Synchronize DHT (send blocks that need renewal)
    const blocksToShare = getLocationBlocksForRenewal();
    await shareBlocks(contact, blocksToShare, sendSecureUDPMessage);

    // 4. Gossip de reputación (G-Set CRDT anti-entropía)
    await exchangeReputationGossip(contact, sendSecureUDPMessage);

    network('Distributed heartbeat completed', undefined, { contact: contact.upeerId }, 'heartbeat');
}

async function exchangeReputationGossip(
    contact: any,
    send: (ip: string, data: any) => void,
): Promise<void> {
    try {
        const { getGossipIds } = await import('../security/reputation/vouches.js');
        const ids = getGossipIds();
        if (ids.length === 0) return;
        send(contact.address, { type: 'REPUTATION_GOSSIP', ids });
    } catch {
        // No bloquear el heartbeat si el módulo falla
    }
}

async function exchangeLocationBlocks(contact: any, sendSecureUDPMessage: (ip: string, data: any) => void) {
    // Send our current location block
    const currentIp = getNetworkAddress();
    if (!currentIp) return;

    // BUG AV fix: usar getMyDhtSeq() (lectura) en lugar de incrementMyDhtSeq() (escritura).
    // exchangeLocationBlocks se llama una vez por contacto conectado en cada heartbeat;
    // con N contactos, incrementMyDhtSeq() se ejecutaba N veces por ciclo, haciendo
    // que distintos contactos recibieran seqs dispares (N, N+1, …, N+M-1) y que el seq
    // se agotara M veces más rápido de lo necesario. broadcastDhtUpdate() ya incrementa
    // el seq cuando detecta un cambio de IP — esa es la fuente autorizada de incremento.
    const { getMyDhtSeq } = await import('../security/identity.js');
    const currentSeq = getMyDhtSeq();

    // generateSignedLocationBlock genera internamente el renewalToken con nuestro propio ID
    // como targetId si no se le pasa ninguno — que es lo correcto para nuestro propio bloque.
    const { generateSignedLocationBlock } = await import('./utils.js');
    const locBlock = generateSignedLocationBlock(currentIp, currentSeq);

    sendSecureUDPMessage(contact.address, {
        type: 'DHT_UPDATE',
        locationBlock: locBlock
    });
}

function getContactsSeenLast24h(): Array<{
    upeerId: string;
    lastSeen: number;
    address: string;
}> {
    const allContacts = getContacts() as any[];
    const cutoff = Date.now() - (24 * 60 * 60 * 1000);

    return allContacts
        .filter(c => c.lastSeen && c.lastSeen > cutoff && c.address)
        .map(c => ({
            upeerId: c.upeerId,
            lastSeen: c.lastSeen,
            address: c.address
        }));
}

async function sendContactList(contact: any, aliveContacts: any[], sendSecureUDPMessage: (ip: string, data: any) => void) {
    if (aliveContacts.length === 0) return;

    sendSecureUDPMessage(contact.address, {
        type: 'DHT_EXCHANGE',
        peers: aliveContacts
            // BUG AY fix: publicKey es obligatoria en validateDhtExchange; sin ella
            // todos los paquetes DHT_EXCHANGE de heartbeat eran rechazados silenciosamente.
            // Además filtrar peers sin publicKey para no enviar entradas incompletas.
            .filter(c => c.publicKey && c.upeerId)
            .map(c => ({
                upeerId: c.upeerId,
                publicKey: c.publicKey,
                address: c.address,
                lastSeen: c.lastSeen
            }))
    });
}

function getLocationBlocksForRenewal(): Array<{
    upeerId: string;
    locationBlock: any;
}> {
    const allContacts = getContacts() as any[];
    const now = Date.now();
    const renewalThreshold = 3 * 24 * 60 * 60 * 1000; // 3 days

    return allContacts
        .filter(c => c.dhtSignature && c.dhtExpiresAt && c.publicKey && c.upeerId)
        .filter(c => {
            // BUG BP fix: campo Drizzle es dhtExpiresAt (columna dht_expires_at), no expiresAt.
            const timeToExpire = c.dhtExpiresAt - now;
            return timeToExpire < renewalThreshold && timeToExpire > 0;
        })
        .map(c => ({
            upeerId: c.upeerId,
            // BUG AY fix: publicKey es obligatoria en validateDhtExchange — sin ella
            // el receptor rechaza el paquete y shareBlocks no servía de nada.
            publicKey: c.publicKey,
            locationBlock: {
                address: c.address,
                dhtSeq: c.dhtSeq,
                signature: c.dhtSignature,
                expiresAt: c.dhtExpiresAt,
                // BUG CI fix: incluir renewalToken para que el receptor pueda auto-renovar
                // el bloque cuando expira. Sin el token, la propagación era inefectiva.
                renewalToken: c.renewalToken
                    ? (() => { try { return JSON.parse(c.renewalToken); } catch { return undefined; } })()
                    : undefined
            }
        }));
}

async function shareBlocks(contact: any, blocksToShare: any[], sendSecureUDPMessage: (ip: string, data: any) => void) {
    if (blocksToShare.length === 0) return;

    // Share blocks that need renewal
    sendSecureUDPMessage(contact.address, {
        type: 'DHT_EXCHANGE',
        peers: blocksToShare
    });
}

export function wrappedBroadcastDhtUpdate() {
    if (isSessionLocked()) return;
    coreBroadcastDhtUpdate(sendSecureUDPMessage);
}

export function sendTypingIndicator(upeerId: string) {
    const contact = getContactByUpeerId(upeerId);
    if (contact && contact.status === 'connected') sendSecureUDPMessage(contact.address, { type: 'TYPING' });
}

export function sendReadReceipt(upeerId: string, id: string) {
    updateMessageStatus(id, 'read');
    const contact = getContactByUpeerId(upeerId);
    if (contact && contact.status === 'connected') sendSecureUDPMessage(contact.address, { type: 'READ', id });
}

export function sendContactCard(targetUpeerId: string, contact: any) {
    const targetContact = getContactByUpeerId(targetUpeerId);
    if (!targetContact || targetContact.status !== 'connected') return undefined;

    const msgId = crypto.randomUUID();
    const data = {
        type: 'CHAT_CONTACT',
        id: msgId,
        contactName: contact.name,
        contactAddress: contact.address,
        upeerId: contact.upeerId,
        contactPublicKey: contact.publicKey
    };

    const signature = sign(Buffer.from(canonicalStringify(data)));
    saveMessage(msgId, targetUpeerId, true, `CONTACT_CARD|${contact.name}`, undefined, signature.toString('hex'));

    sendSecureUDPMessage(targetContact.address, data);
    return msgId;
}

export async function sendChatReaction(upeerId: string, msgId: string, emoji: string, remove: boolean) {
    const contact = await getContactByUpeerId(upeerId);
    if (!contact || contact.status !== 'connected') return;

    if (remove) deleteReaction(msgId, getMyUPeerId(), emoji);
    else saveReaction(msgId, getMyUPeerId(), emoji);

    const data = { type: 'CHAT_REACTION', msgId, emoji, remove };
    sendSecureUDPMessage(contact.address, data);
}

export async function sendChatUpdate(upeerId: string, msgId: string, newContent: string) {
    const contact = await getContactByUpeerId(upeerId);
    if (!contact || contact.status !== 'connected' || !contact.publicKey) return;

    const useEphemeral = shouldUseEphemeral(contact);
    const targetKeyHex = useEphemeral ? contact.ephemeralPublicKey : contact.publicKey;

    const ephPubKey = getMyEphemeralPublicKeyHex(); // capture before possible rotation
    const { ciphertext, nonce } = encrypt(
        Buffer.from(newContent, 'utf-8'),
        Buffer.from(targetKeyHex, 'hex'),
        useEphemeral
    );

    if (useEphemeral) {
        incrementEphemeralMessageCounter();
    }

    const data = {
        type: 'CHAT_UPDATE',
        msgId,
        content: ciphertext.toString('hex'),
        nonce: nonce.toString('hex'),
        ephemeralPublicKey: ephPubKey,
        useRecipientEphemeral: useEphemeral
    };

    const signature = sign(Buffer.from(canonicalStringify(data)));
    updateMessageContent(msgId, newContent, signature.toString('hex'));
    sendSecureUDPMessage(contact.address, data);
}

export async function sendChatDelete(upeerId: string, msgId: string) {
    const contact = await getContactByUpeerId(upeerId);
    if (!contact || contact.status !== 'connected') return;

    deleteMessageLocally(msgId);

    const data = {
        type: 'CHAT_DELETE',
        msgId,
        timestamp: Date.now()
    };

    // BUG BZ fix: NO pre-firmar antes de sendSecureUDPMessage.
    // sendSecureUDPMessage firma el paquete incluyendo el campo `signature` si ya existe,
    // pero el receptor extrae ese campo del nivel externo, dejando `data` sin firma.
    // handleIncomingDelete busca `signature` en `data` → undefined → descarta el mensaje.
    // La firma del paquete externo es suficiente para autenticación de entrega directa.
    // 1. Entrega directa (la firma exterior de sendSecureUDPMessage lo autentica)
    sendSecureUDPMessage(contact.address, data);

    // 2. Vault path: paquete interior separado con firma + senderUpeerId
    //    (el custodio no firma; la integridad extremo-a-extremo requiere firma propia).
    const myId = getMyUPeerId();
    const innerSignature = sign(Buffer.from(canonicalStringify(data)));
    const innerPacket = {
        ...data,
        senderUpeerId: myId,
        signature: innerSignature.toString('hex')
    };
    import('./vault/manager.js').then(({ VaultManager }) => {
        VaultManager.replicateToVaults(upeerId, innerPacket);
    }).catch(err => error('Failed to propagate delete to vaults', err, 'vault'));
}

export async function sendFile(upeerId: string, filePath: string, thumbnail?: string): Promise<string | undefined> {
    const contact = await getContactByUpeerId(upeerId);
    if (!contact || contact.status !== 'connected') return undefined;

    try {
        const fileId = await fileTransferManager.startSend(
            upeerId,
            contact.address,
            filePath,
            thumbnail
        );
        return fileId;
    } catch (error) {
        warn('File transfer failed to start', { upeerId, filePath, error }, 'file-transfer');
        return undefined;
    }
}

export function closeUDPServer() {
    if (dhtMaintenanceTimer) {
        clearInterval(dhtMaintenanceTimer);
        dhtMaintenanceTimer = null;
    }
    if (tcpServer) {
        tcpServer.close();
        tcpServer = null;
    }
}

// ========================
// Group Chat Functions
// ========================

/**
 * Send a text message to a group (fan-out to each member).
 * Returns the generated message ID.
 */
export async function sendGroupMessage(
    groupId: string,
    message: string,
    replyTo?: string
): Promise<string | undefined> {
    const group = getGroupById(groupId);
    if (!group || group.status !== 'active') return undefined;

    const msgId = crypto.randomUUID();
    const myId = getMyUPeerId();

    // Save locally first
    const signature = sign(Buffer.from(message));
    saveMessage(msgId, groupId, true, message, replyTo, signature.toString('hex'), 'sent');

    // Fan-out: send to every member that is not us
    for (const memberUpeerId of group.members) {
        if (memberUpeerId === myId) continue;
        const contact = await getContactByUpeerId(memberUpeerId);
        if (!contact || contact.status !== 'connected' || !contact.publicKey) continue;

        const useEphemeral = shouldUseEphemeral(contact);
        const targetKeyHex = useEphemeral ? contact.ephemeralPublicKey : contact.publicKey;

        const ephPubKey = getMyEphemeralPublicKeyHex(); // capture before possible rotation
        const { ciphertext, nonce } = encrypt(
            Buffer.from(message, 'utf-8'),
            Buffer.from(targetKeyHex, 'hex'),
            useEphemeral
        );

        if (useEphemeral) incrementEphemeralMessageCounter();

        const data = {
            type: 'GROUP_MSG',
            id: msgId,
            groupId,
            groupName: group.name,
            senderUpeerId: myId,
            content: ciphertext.toString('hex'),
            nonce: nonce.toString('hex'),
            ephemeralPublicKey: ephPubKey,
            useRecipientEphemeral: useEphemeral,
            replyTo
            // members omitted: receiver already has the group roster locally;
            // including it leaks the full membership list to vault custodians
        };

        sendSecureUDPMessage(contact.address, data, contact.publicKey); // ← Sealed Sender

        // ── Resilience: vault fallback if the member appears offline later ──
        // We preemptively vault for members with low lastSeen recency or uncertain status
        // by not sending and instead vaulting when status is not 'connected'
    }

    // Vault for offline members (we have their pubkey from previous handshake)
    for (const memberUpeerId of group.members) {
        if (memberUpeerId === myId) continue;
        const contact = await getContactByUpeerId(memberUpeerId);
        // Skip if we just sent to them (connected) or if we have no key at all
        if (!contact || contact.status === 'connected' || !contact.publicKey) continue;

        // Offline members: always use static key — their stored eph key for us is certainly stale.
        const useEphemeral = false;
        const targetKeyHex = contact.publicKey;
        const ephPubKey = getMyEphemeralPublicKeyHex();
        const { ciphertext, nonce } = encrypt(
            Buffer.from(message, 'utf-8'),
            Buffer.from(targetKeyHex, 'hex'),
            useEphemeral
        );
        const offlinePacket = {
            type: 'GROUP_MSG',
            id: msgId,
            groupId,
            // groupName omitido: el receptor lo tiene en su BD desde GROUP_INVITE.
            // senderUpeerId omitido: el custodio lo conoce del protocolo VAULT_STORE
            // (entry.senderSid) — no hace falta exponerlo dentro del payload cifrado.
            content: ciphertext.toString('hex'),
            nonce: nonce.toString('hex'),
            useRecipientEphemeral: useEphemeral,
            replyTo
        };
        const signedPacket = {
            ...offlinePacket,
            signature: sign(Buffer.from(canonicalStringify(offlinePacket))).toString('hex')
        };
        const { VaultManager } = await import('./vault/manager.js');
        // CID determinista: group:msgId:memberUpeerId
        // → si varios miembros online intentan vaultear el mismo mensaje para el mismo offline,
        //   saveVaultEntry usa onConflictDoUpdate → un solo slot por (mensaje, miembro).
        const payloadHashOverride = crypto.createHash('sha256')
            .update(`group:${msgId}:${memberUpeerId}`)
            .digest('hex');
        await VaultManager.replicateToVaults(memberUpeerId, signedPacket, undefined, payloadHashOverride);
    }

    return msgId;
}

/**
 * Create a group, save it locally, and send GROUP_INVITE to each member.
 */
export async function createGroup(
    name: string,
    memberUpeerIds: string[],
    avatar?: string
): Promise<string> {
    const myId = getMyUPeerId();
    const groupId = `grp-${crypto.randomUUID()}`;
    const allMembers = Array.from(new Set([myId, ...memberUpeerIds]));

    saveGroup(groupId, name, myId, allMembers, 'active', avatar);

    // Send invitations
    for (const memberUpeerId of memberUpeerIds) {
        if (memberUpeerId === myId) continue;
        await _sendGroupInvite(groupId, name, allMembers, memberUpeerId, avatar);
    }

    return groupId;
}

/**
 * Invite an existing contact to a group.
 */
export async function inviteToGroup(
    groupId: string,
    upeerId: string
): Promise<void> {
    const group = getGroupById(groupId);
    if (!group) return;

    const newMembers = Array.from(new Set([...group.members, upeerId]));
    updateGroupMembers(groupId, newMembers);
    await _sendGroupInvite(groupId, group.name, newMembers, upeerId);
}

/**
 * Admin updates group name and/or avatar and broadcasts to all members.
 */
export async function updateGroup(
    groupId: string,
    fields: { name?: string; avatar?: string | null }
): Promise<void> {
    const group = getGroupById(groupId);
    if (!group) return;

    // Persist locally
    updateGroupInfo(groupId, fields);

    const myId = getMyUPeerId();
    const sensitivePayload = JSON.stringify({
        ...(fields.name !== undefined ? { groupName: fields.name } : {}),
        ...(fields.avatar !== undefined ? { avatar: fields.avatar } : {}),
    });

    // Fan-out to all members except self (online → send, offline → vault)
    for (const memberUpeerId of group.members) {
        if (memberUpeerId === myId) continue;
        const contact = await getContactByUpeerId(memberUpeerId);
        if (!contact || !contact.publicKey) continue;

        // BUG Y fix: para miembros offline de un grupo, !!contact.ephemeralPublicKey
        // siempre era true si la clave existía, sin importar si tenía semanas de
        // antigüedad. shouldUseEphemeral comprueba también ephemeralPublicKeyUpdatedAt < 2h,
        // usando la clave estática para peers offline (que es correcta para vault).
        const useEphemeral = shouldUseEphemeral(contact);
        const targetKeyHex = useEphemeral ? contact.ephemeralPublicKey : contact.publicKey;
        const ephPubKey = getMyEphemeralPublicKeyHex(); // capture before possible rotation
        const { ciphertext, nonce } = encrypt(
            Buffer.from(sensitivePayload, 'utf-8'),
            Buffer.from(targetKeyHex, 'hex'),
            useEphemeral
        );
        if (useEphemeral) incrementEphemeralMessageCounter();

        const packet = {
            type: 'GROUP_UPDATE',
            groupId,
            adminUpeerId: myId,
            payload: ciphertext.toString('hex'),
            nonce: nonce.toString('hex'),
            ephemeralPublicKey: ephPubKey,
            useRecipientEphemeral: useEphemeral,
        };

        if (contact.status === 'connected') {
            sendSecureUDPMessage(contact.address, packet);
        } else {
            const signedPacket = {
                ...packet,
                senderUpeerId: myId,
                signature: sign(Buffer.from(canonicalStringify(packet))).toString('hex')
            };
            const { VaultManager } = await import('./vault/manager.js');
            await VaultManager.replicateToVaults(memberUpeerId, signedPacket);
            warn('GROUP_UPDATE vaulted for offline member', { memberUpeerId, groupId }, 'vault');
        }
    }
}

async function _sendGroupInvite(
    groupId: string,
    groupName: string,
    members: string[],
    targetUpeerId: string,
    avatar?: string
): Promise<void> {
    const contact = await getContactByUpeerId(targetUpeerId);
    // We need at least a public key to encrypt the invite
    if (!contact || !contact.publicKey) return;

    const myId = getMyUPeerId();
    // GROUP_INVITE puede llegar a peers offline (vaulted) — usar clave estática
    // garantiza que puedan descifrarla sin importar cuánto tiempo hayan estado fuera.
    const useEphemeral = contact.status === 'connected' ? shouldUseEphemeral(contact) : false;
    const targetKeyHex = useEphemeral ? contact.ephemeralPublicKey : contact.publicKey;

    // Encrypt the sensitive payload (name, members list, avatar)
    const sensitivePayload = JSON.stringify({ groupName, members, ...(avatar ? { avatar } : {}) });
    const ephPubKey = getMyEphemeralPublicKeyHex(); // capture before possible rotation
    const { ciphertext, nonce } = encrypt(
        Buffer.from(sensitivePayload, 'utf-8'),
        Buffer.from(targetKeyHex, 'hex'),
        useEphemeral
    );
    if (useEphemeral) incrementEphemeralMessageCounter();

    const packet = {
        type: 'GROUP_INVITE',
        groupId,
        adminUpeerId: myId,
        payload: ciphertext.toString('hex'),
        nonce: nonce.toString('hex'),
        ephemeralPublicKey: ephPubKey,
        useRecipientEphemeral: useEphemeral,
    };

    if (contact.status === 'connected') {
        sendSecureUDPMessage(contact.address, packet);
    } else {
        // Vault the encrypted invite for when the member comes back online
        const signedPacket = {
            ...packet,
            senderUpeerId: myId,
            signature: sign(Buffer.from(canonicalStringify(packet))).toString('hex')
        };
        const { VaultManager } = await import('./vault/manager.js');
        await VaultManager.replicateToVaults(targetUpeerId, signedPacket);
        warn('GROUP_INVITE vaulted for offline member', { targetUpeerId, groupId }, 'vault');
    }
}

// Re-export specifically as needed
export { wrappedBroadcastDhtUpdate as broadcastDhtUpdate };

/**
 * Leave (and delete) a group locally, and notify all members via GROUP_LEAVE.
 * Deletes the group row and all its messages from the local DB.
 */
export async function leaveGroup(groupId: string): Promise<void> {
    const group = getGroupById(groupId);
    if (!group) return;

    const myId = getMyUPeerId();
    const packet = {
        type: 'GROUP_LEAVE',
        groupId,
        senderUpeerId: myId,
        timestamp: Date.now(),
    };
    // BUG BZ fix: NO pre-firmar antes de sendSecureUDPMessage.
    // Ver sendChatDelete para la explicación detallada del bug.
    // sendSecureUDPMessage firma el paquete completo; no se necesita firma interior
    // para la entrega directa a miembros online.
    // Notify all online members
    for (const memberUpeerId of group.members) {
        if (memberUpeerId === myId) continue;
        const contact = await getContactByUpeerId(memberUpeerId);
        if (contact?.status === 'connected' && contact.address) {
            sendSecureUDPMessage(contact.address, packet);
        }
    }

    // Delete locally
    const { deleteGroup, deleteMessagesByChatId } = await import('../storage/db.js');
    deleteMessagesByChatId(groupId);
    deleteGroup(groupId);
}
