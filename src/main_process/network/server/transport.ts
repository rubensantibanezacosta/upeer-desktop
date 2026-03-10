import {
    getMyUPeerId,
    sign
} from '../../security/identity.js';
import { error, network } from '../../security/secure-logger.js';
import { getYggstackAddress, onYggstackAddress, onYggstackStatus } from '../../sidecars/yggstack.js';
import { SEALED_TYPES, sealPacket } from '../sealed.js';
import {
    canonicalStringify,
    getNetworkAddress
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

// Re-export circuit breaker functions
export { isIPUnreachable };

// ── Ready gate ───────────────────────────────────────────────────────────────
// yggstack necesita tiempo para conectar a sus peers antes de poder enrutar
// tráfico. Hasta que la red esté lista (detectamos la IPv6), los mensajes
// salientes se encolan (máx. MAX_QUEUE_SIZE) para no perderlos ni saturar
// la consola con errores de \"SOCKS5 timeout\".

export function drainSendQueue(): void {
    const queue = getSendQueue();
    if (queue.length === 0) return;
    network('Red lista — enviando mensajes en cola', undefined, { queued: queue.length }, 'network');
    const toSend = queue.splice(0);
    for (const { ip, framedBuf } of toSend) {
        socks5Connect(ip, YGG_PORT)
            .then((sock) => {
                sock.write(framedBuf);
                sock.end(() => sock.destroy());
            })
            .catch((_err: Error) => {
                error(`TCP send error (drain) to ${ip}`, _err, 'network');
            });
    }
}

// Escuchar caídas / reconexiones de yggstack para gestionar el ready-gate
onYggstackStatus((status) => {
    if (status === 'down' || status === 'reconnecting') {
        setNetworkReady(false);
        clearSendQueue(); // descartar mensajes en cola (stale)
        network('Red Yggdrasil no disponible — mensajes salientes pausados', undefined, { status }, 'network');
    }
    // 'up' lo maneja onYggstackAddress → drainSendQueue()
});

// Disparar operaciones de red cuando yggstack confirme su dirección IPv6
// (= tiene al menos un peer conectado y puede enrutar tráfico).
onYggstackAddress(() => {
    setNetworkReady(true);
    drainSendQueue();
});

export function sendSecureUDPMessage(ip: string, data: any, recipientPubKeyHex?: string) {
    if (!getTcpServer()) return;

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
    if (!getNetworkReady()) {
        const isFileChunk = data.type === 'FILE_CHUNK' || data.type === 'FILE_START' || data.type === 'FILE_ACK';
        if (!isFileChunk && getSendQueue().length < MAX_QUEUE_SIZE) {
            addToSendQueue({ ip, framedBuf });
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
        .catch((_err: Error) => {
            recordIPFailure(ip);
        });
}