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

export function drainSendQueue(): void {
    const queue = getSendQueue();
    if (queue.length === 0) return;
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

onYggstackStatus((status) => {
    if (status === 'down' || status === 'reconnecting') {
        setNetworkReady(false);
        clearSendQueue();
    }
});

onYggstackAddress(() => {
    setNetworkReady(true);
    drainSendQueue();
});

export function sendSecureUDPMessage(ip: string, data: any, recipientPubKeyHex?: string, isInternalSync = false) {
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

    let packetToSend: any;
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

    socks5Connect(ip, YGG_PORT)
        .then((sock) => {
            if (!isFileTransfer) recordIPSuccess(ip);
            sock.write(framedBuf);
            sock.end(() => sock.destroy());
        })
        .catch((_err: Error) => {
            error(`TCP send error to ${ip}: ${_err.message}`, undefined, 'network');
            if (!isFileTransfer) recordIPFailure(ip);
        });
}
