import { getMyPublicKey, getMyUPeerId } from '../../security/identity.js';
import { encryptChatPayload } from '../messaging/chatEncryption.js';
import { sendSecurePacket } from '../server/transport.js';
import { buildHelloPayload, getMySyncIdentity } from './auth.js';
import type { SyncDeviceBinding, SyncPlainEvent } from './types.js';
import type { SyncPeerRecord } from '../../storage/sync/peers.js';
import { listSyncPeers } from '../../storage/sync/peers.js';
import { getMyAccountRegistry } from '../accountRegistry.js';
import type { AccountRegistry } from '../accountRegistry.js';
import { parseCertificate } from '../../security/deviceCertificate.js';
import { getMaxSyncSequence } from '../../storage/sync/events.js';
import { getRatchetSession } from '../../storage/ratchet/operations.js';
import { listContactProfiles } from '../../storage/contacts/operations.js';
import { signSyncEventOrigin } from './origin.js';

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
        senderDeviceCertificate: identity.certificate,
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
    const contextId = `sync:${peer.deviceId}`;
    const session = getRatchetSession(getMyUPeerId(), contextId);
    if (!session && identity.deviceId > peer.deviceId) return false;
    const encrypted = await encryptChatPayload(
        getMyUPeerId(),
        JSON.stringify(payload),
        peerContact(peer),
        contextId,
        { allowDeviceIdentity: true },
    );
    const envelopeMetadata: Record<string, unknown> = {};
    if (type === 'SYNC_ENVELOPE') {
        if (typeof payload.eventId === 'string') envelopeMetadata.eventId = payload.eventId;
        if (typeof payload.kind === 'string') envelopeMetadata.kind = payload.kind;
        if (typeof payload.occurredAt === 'number') envelopeMetadata.occurredAt = payload.occurredAt;
        if (typeof payload.sequence === 'number') envelopeMetadata.sequence = payload.sequence;
        if (typeof payload.originDeviceId === 'string') envelopeMetadata.originDeviceId = payload.originDeviceId;
        envelopeMetadata.epoch = identity.certificate.epoch;
    }
    if ((type === 'SYNC_HISTORY_REQ' || type === 'SYNC_HISTORY_RES') && typeof payload.requestId === 'string') {
        envelopeMetadata.requestId = payload.requestId;
    }
    sendSecurePacket(peer.address, {
        type,
        ...envelopeMetadata,
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

export function sendSyncReset(peer: SyncPeerRecord): boolean {
    if (!peer.address) return false;
    const identity = getMySyncIdentity();
    if (!identity) return false;
    sendSecurePacket(peer.address, {
        type: 'SYNC_RESET',
        senderDeviceId: identity.deviceId,
        senderDeviceCertificate: identity.certificate,
    });
    return true;
}

export function sendSyncRegistry(peer: SyncPeerRecord, registry: AccountRegistry): boolean {
    if (!peer.address) return false;
    const identity = getMySyncIdentity();
    if (!identity) return false;
    sendSecurePacket(peer.address, {
        type: 'SYNC_REGISTRY',
        senderDeviceId: identity.deviceId,
        senderDeviceCertificate: identity.certificate,
        accountUpeerId: registry.accountUpeerId,
        registry,
    });
    return true;
}

export function broadcastSyncRegistry(): number {
    const myId = getMyUPeerId();
    const registry = getMyAccountRegistry();
    if (!myId || !registry) return 0;
    let sent = 0;
    for (const peer of listSyncPeers(myId)) {
        if (sendSyncRegistry(peer, registry)) sent += 1;
    }
    return sent;
}

export async function sendSyncProfiles(peer: SyncPeerRecord): Promise<number> {
    const identity = getMySyncIdentity();
    if (!identity || !peer.address) return 0;
    let sent = 0;
    for (const profile of listContactProfiles()) {
        const occurredAt = Date.now();
        const event = signSyncEventOrigin({
            eventId: `profile-${profile.upeerId}`,
            kind: 'CONTACT_PROFILE' as const,
            occurredAt,
            sequence: nextSyncSequence(),
            originDeviceId: identity.deviceId,
            payload: profile as unknown as Record<string, unknown>,
        });
        if (await sendSyncEnvelope(peer, event)) sent += 1;
    }
    return sent;
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
