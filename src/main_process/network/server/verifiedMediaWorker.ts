import type { MessagePortMain, ParentPort } from 'electron';
import { decodeBinaryCallMedia } from '../binaryCallMedia.js';
import { canonicalStringify } from '../cryptoUtils.js';
import { verify } from '../../security/identityCrypto.js';
import { isYggdrasilAddress } from '../utils.js';
import { sameIPv6Address } from './socks5Udp.js';
import { CALL_MEDIA_UDP_MAX_BYTES } from './constants.js';

type PacketRequest = { type: 'packet'; packet: Uint8Array; listenPort: number; sourceAddress: string };
type ContactRequest = { type: 'contacts'; contacts: Array<{ upeerId: string; publicKey: string }> };
type WorkerRequest = PacketRequest | ContactRequest;
type ParentConnectRequest = { data: { type: 'connect' }; ports: MessagePortMain[] };

let mediaPort: MessagePortMain | null = null;
const contactKeys = new Map<string, string>();
let contactsReady = false;

const parentPort = (process as NodeJS.Process & { parentPort?: ParentPort }).parentPort;

parentPort?.on('message', (event: ParentConnectRequest) => {
    if (event.data.type !== 'connect') return;
    mediaPort = event.ports[0] ?? null;
    mediaPort?.on('message', ({ data }: { data: WorkerRequest }) => {
        if (data.type === 'contacts') {
            contactKeys.clear();
            data.contacts.forEach(({ upeerId, publicKey }) => contactKeys.set(upeerId, publicKey));
            contactsReady = true;
            return;
        }
        verifyPacket(data);
    });
    mediaPort?.start();
});

function verifyPacket(request: PacketRequest): void {
    const port = mediaPort;
    if (!port || request.packet.byteLength > CALL_MEDIA_UDP_MAX_BYTES) return;
    let packet: Record<string, unknown> | null;
    try {
        packet = decodeBinaryCallMedia(Buffer.from(request.packet));
    } catch {
        return;
    }
    if (!packet || packet.type !== 'CALL_MEDIA') return;
    const senderUpeerId = typeof packet.senderUpeerId === 'string' ? packet.senderUpeerId : '';
    const senderYggAddress = typeof packet.senderYggAddress === 'string' ? packet.senderYggAddress : '';
    const signature = typeof packet.signature === 'string' ? packet.signature : '';
    const callId = typeof packet.callId === 'string' ? packet.callId : '';
    if (!senderUpeerId || !callId || !isYggdrasilAddress(senderYggAddress) || (request.sourceAddress && !sameIPv6Address(senderYggAddress, request.sourceAddress)) || !/^[0-9a-f]{128}$/i.test(signature)) return;
    const publicKey = contactKeys.get(senderUpeerId);
    if (!publicKey || !contactsReady) return;
    const signedPacket: Record<string, unknown> = { ...packet, senderUpeerId, senderYggAddress };
    delete signedPacket.signature;
    delete signedPacket.data;
    const verified = verify(Buffer.from(canonicalStringify(signedPacket)), Buffer.from(signature, 'hex'), Buffer.from(publicKey, 'hex'));
    if (!verified) return;
    const media = Uint8Array.from(packet.data as Uint8Array);
    port.postMessage({
        type: 'verified-media',
        senderUpeerId,
        senderYggAddress,
        callId,
        media: Uint8Array.from(media),
        timestamp: packet.timestamp,
    });
}