import { getMyPublicKey, getMyUPeerId } from '../../security/identity.js';
import { encryptChatPayload } from '../messaging/chatEncryption.js';
import { sendSecurePacket } from '../server/transport.js';
import { buildHelloPayload, getMySyncIdentity } from './auth.js';
import type { SyncDeviceBinding, SyncPlainEvent } from './types.js';
import type { SyncPeerRecord } from '../../storage/sync/peers.js';
import { parseCertificate } from '../../security/deviceCertificate.js';
import { getMaxSyncSequence } from '../../storage/sync/events.js';

let sequence = 0;

export function nextSyncSequence(): number {
    if (sequence === 0) sequence = getMaxSyncSequence();
    const candidate = Date.now() * 1000;
    sequence = Math.max(sequence + 1, candidate);
    return sequence;
}

export function sendSyncHello(address: string, ack: boolean): boolean {
    const identity = getMySyncIdentity();
    const hello = buildHelloPayload(ack);
    if (!identity || !hello) return false;
    sendSecurePacket(address, {
        type: 'SYNC_HELLO',
        ...hello,
        senderDeviceId: identity.deviceId,
    });
    return true;
}

export async function sendEncryptedSync(
    peer: SyncPeerRecord,
    type: 'SYNC_ENVELOPE' | 'SYNC_HISTORY_REQ' | 'SYNC_HISTORY_RES',
    payload: Record<string, unknown>,
): Promise<boolean> {
    if (!peer.address) return false;
    const identity = getMySyncIdentity();
    if (!identity) return false;
    const encrypted = await encryptChatPayload(
        getMyUPeerId(),
        JSON.stringify(payload),
        peerContact(peer),
        `sync:${peer.deviceId}`,
        { allowDeviceIdentity: true },
    );
    sendSecurePacket(peer.address, {
        type,
        ...encrypted,
        senderDeviceId: identity.deviceId,
        senderDeviceCertificate: identity.certificate,
        recipientDeviceId: peer.deviceId,
    });
    return true;
}

export async function sendSyncEnvelope(peer: SyncPeerRecord, event: SyncPlainEvent): Promise<boolean> {
    return sendEncryptedSync(peer, 'SYNC_ENVELOPE', event);
}

export function sendSyncAck(peer: SyncPeerRecord, eventId: string, eventSequence: number): boolean {
    if (!peer.address) return false;
    const identity = getMySyncIdentity();
    if (!identity) return false;
    sendSecurePacket(peer.address, {
        type: 'SYNC_ACK',
        eventId,
        sequence: eventSequence,
        senderDeviceId: identity.deviceId,
        senderDeviceCertificate: identity.certificate,
    });
    return true;
}

function peerContact(peer: SyncPeerRecord): {
    publicKey: string;
    devicePublicKey: string;
    deviceSignedPreKey: string;
    deviceSignedPreKeyId: number;
} {
    const certificate = peer.deviceCertificate ? parseCertificate(peer.deviceCertificate) : null;
    return {
        publicKey: certificate?.accountPublicKey ?? getMyPublicKey().toString('hex'),
        devicePublicKey: peer.devicePublicKey,
        deviceSignedPreKey: peer.deviceSignedPreKey,
        deviceSignedPreKeyId: peer.deviceSignedPreKeyId,
    };
}

export function bindingFromPeer(peer: SyncPeerRecord): SyncDeviceBinding | null {
    const certificate = peer.deviceCertificate ? parseCertificate(peer.deviceCertificate) : null;
    if (!certificate) return null;
    return {
        deviceId: peer.deviceId,
        devicePublicKey: peer.devicePublicKey,
        deviceCertificate: certificate,
        deviceSignedPreKey: {
            spkPub: peer.deviceSignedPreKey,
            spkSig: peer.deviceSignedPreKeySignature,
            spkId: peer.deviceSignedPreKeyId,
        },
    };
}
