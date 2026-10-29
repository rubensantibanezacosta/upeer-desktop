import type { BrowserWindow } from 'electron';
import { getMyUPeerId } from '../../security/identity.js';
import { warn } from '../../security/secure-logger.js';
import { recordSyncEvent } from '../../storage/sync/events.js';
import { syncEntityId } from '../../storage/sync/eventSink.js';
import { isSyncRelayTarget, markSyncRelayAcked } from '../../storage/sync/relay.js';
import {
    getSyncPeer,
    touchSyncPeer,
    updateSyncPeerAck,
    upsertSyncPeer,
} from '../../storage/sync/peers.js';
import { getMyAccountRegistry } from '../accountRegistry.js';
import { routeSyncFilePacket } from './files/route.js';
import { applySyncEvent } from './apply.js';
import { certificateFromPacket, getMySyncIdentity, verifySyncHelloBinding } from './auth.js';
import { applySyncHistoryResponse, requestSyncHistory, respondSyncHistory } from './history.js';
import { verifySyncEventOrigin } from './origin.js';
import { decryptEvent, decryptPayload, matchesEnvelope, type SyncPacket } from './payloads.js';
import { relayBacklogToPeer, relaySyncEvent } from './relay.js';
import { replayAfterAck, replayPendingSyncEvents } from './replay.js';
import { resetSyncSession } from './sessionReset.js';
import { notifySyncStatus } from './statusNotify.js';
import { sendSyncAck, sendSyncGroups, sendSyncHello, sendSyncProfiles, sendSyncRegistry } from './transport.js';
import type { SyncHelloPayload, SyncPlainEvent } from './types.js';

const HISTORY_REQUEST_COOLDOWN_MS = 30_000;
const historyRequests = new Map<string, number>();

export async function handleSyncHello(
    address: string,
    data: SyncPacket,
    now = Date.now(),
): Promise<void> {
    const myId = getMyUPeerId();
    const payload = data as unknown as SyncHelloPayload;
    const binding = verifySyncHelloBinding(payload, myId, now);
    if (!binding) {
        warn('Rejected invalid sync hello', { deviceId: payload.deviceId }, 'sync');
        return;
    }
    upsertSyncPeer({
        deviceId: binding.deviceId,
        upeerId: myId,
        devicePublicKey: binding.devicePublicKey,
        deviceCertificate: JSON.stringify(binding.deviceCertificate),
        deviceSignedPreKey: binding.deviceSignedPreKey.spkPub,
        deviceSignedPreKeySignature: binding.deviceSignedPreKey.spkSig,
        deviceSignedPreKeyId: binding.deviceSignedPreKey.spkId,
        address,
        lastSeen: now,
    });
    if (payload.ack !== true) {
        sendSyncHello(address, true);
    }
    const peer = getSyncPeer(binding.deviceId);
    if (peer) {
        const registry = getMyAccountRegistry(now);
        if (registry) sendSyncRegistry(peer, registry);
        sendSyncProfiles(peer).catch(err => warn('Sync profile push failed', err, 'sync'));
        sendSyncGroups(peer).catch(err => warn('Sync group push failed', err, 'sync'));
        replayPendingSyncEvents(peer).catch(err => warn('Sync replay failed', err, 'sync'));
        relayBacklogToPeer(peer).catch(err => warn('Sync relay backlog failed', err, 'sync'));
        const myDeviceId = getMySyncIdentity()?.deviceId ?? '';
        const lastRequest = historyRequests.get(peer.deviceId) ?? 0;
        if (myDeviceId <= peer.deviceId && now - lastRequest > HISTORY_REQUEST_COOLDOWN_MS) {
            historyRequests.set(peer.deviceId, now);
            requestSyncHistory(peer).catch(err => warn('Sync history request failed', err, 'sync'));
        }
    }
}


export async function handleSyncEnvelope(
    senderDeviceId: string,
    data: SyncPacket,
    address: string,
    win: BrowserWindow | null,
    now = Date.now(),
): Promise<void> {
    if (data.recipientDeviceId !== getMySyncIdentity()?.deviceId) return;
    const peer = getSyncPeer(senderDeviceId);
    if (!peer) return;
    const event = await decryptEvent(peer, data, 'SYNC_ENVELOPE');
    if (!event || !matchesEnvelope(data, event)) return;
    const originDeviceId = event.originDeviceId ?? senderDeviceId;
    const myDeviceId = getMySyncIdentity()?.deviceId;
    if (originDeviceId === myDeviceId && senderDeviceId !== myDeviceId) return;
    if (originDeviceId !== senderDeviceId && !verifySyncEventOrigin(event, getMyUPeerId(), now)) {
        warn('Rejected relayed sync event without a valid origin signature', { eventId: event.eventId }, 'sync');
        sendSyncAck(peer, event.eventId, event.sequence);
        return;
    }
    const signedEvent: SyncPlainEvent = { ...event, originDeviceId };
    const recorded = recordSyncEvent({
        eventId: signedEvent.eventId,
        originDeviceId,
        kind: signedEvent.kind,
        occurredAt: signedEvent.occurredAt,
        sequence: signedEvent.sequence,
        payload: JSON.stringify(signedEvent.payload),
        entityId: syncEntityId(signedEvent.kind, signedEvent.payload),
        originSignature: signedEvent.originSignature ?? null,
        originCertificate: signedEvent.originCertificate
            ? JSON.stringify(signedEvent.originCertificate)
            : null,
        direction: 'inbound',
        appliedAt: now,
    });
    if (recorded) {
        await applySyncEvent(signedEvent, win);
        await relaySyncEvent(signedEvent, senderDeviceId, getMyUPeerId());
    }
    touchSyncPeer(senderDeviceId, address, event.sequence);
    sendSyncAck(peer, event.eventId, event.sequence);
}

export async function handleSyncHistoryRequest(
    senderDeviceId: string,
    data: SyncPacket,
    address: string,
): Promise<void> {
    if (data.recipientDeviceId !== getMySyncIdentity()?.deviceId) return;
    const peer = getSyncPeer(senderDeviceId);
    if (!peer) return;
    touchSyncPeer(senderDeviceId, address, peer.lastSequence);
    const request = await decryptPayload(peer, data, 'SYNC_HISTORY_REQ');
    if (!request) return;
    if (typeof request.requestId !== 'string') return;
    if (request.cursor !== null && typeof request.cursor !== 'string') return;
    if (typeof request.limit !== 'number' || !Number.isInteger(request.limit)) return;
    await respondSyncHistory(peer, {
        requestId: request.requestId,
        cursor: request.cursor as string | null,
        limit: request.limit,
    });
    if (!peer.historyCompleted) {
        requestSyncHistory(peer).catch(err => warn('Sync history request failed', err, 'sync'));
    }
    await replayPendingSyncEvents(peer);
    await relayBacklogToPeer(peer);
}

export async function handleSyncHistoryResponse(
    senderDeviceId: string,
    data: SyncPacket,
    address: string,
    win: BrowserWindow | null,
    now = Date.now(),
): Promise<void> {
    if (data.recipientDeviceId !== getMySyncIdentity()?.deviceId) return;
    const peer = getSyncPeer(senderDeviceId);
    if (!peer) return;
    touchSyncPeer(senderDeviceId, address, peer.lastSequence);
    const response = await decryptPayload(peer, data, 'SYNC_HISTORY_RES');
    if (!response) return;
    if (typeof response.requestId !== 'string' || !Array.isArray(response.entries) || response.entries.length > 200) return;
    if (typeof response.done !== 'boolean') return;
    if (response.nextCursor !== null && typeof response.nextCursor !== 'string') return;
    await applySyncHistoryResponse(peer, {
        requestId: response.requestId,
        entries: response.entries,
        nextCursor: response.nextCursor as string | null,
        done: response.done,
        pending: response.pending,
    }, now, win);
    await replayPendingSyncEvents(peer);
}

export function handleSyncAck(senderDeviceId: string, data: SyncPacket): void {
    if (typeof data.sequence !== 'number' || !Number.isSafeInteger(data.sequence)) return;
    const eventId = typeof data.eventId === 'string' ? data.eventId : '';
    if (eventId && isSyncRelayTarget(eventId, senderDeviceId)) {
        markSyncRelayAcked(eventId, senderDeviceId);
        return;
    }
    updateSyncPeerAck(senderDeviceId, data.sequence);
    void replayAfterAck(senderDeviceId);
}

export async function routeSyncPacket(
    data: SyncPacket,
    address: string,
    win: BrowserWindow | null,
): Promise<void> {
    const certificate = certificateFromPacket(data, getMyUPeerId());
    if (!certificate) {
        warn('Rejected sync packet without a valid device certificate', { type: data.type }, 'sync');
        return;
    }
    const senderDeviceId = certificate.deviceId;
    switch (data.type) {
        case 'SYNC_HELLO':
            await handleSyncHello(address, data);
            notifySyncStatus(win);
            break;
        case 'SYNC_ENVELOPE':
            await handleSyncEnvelope(senderDeviceId, data, address, win);
            notifySyncStatus(win);
            break;
        case 'SYNC_HISTORY_REQ':
            await handleSyncHistoryRequest(senderDeviceId, data, address);
            notifySyncStatus(win);
            break;
        case 'SYNC_HISTORY_RES':
            await handleSyncHistoryResponse(senderDeviceId, data, address, win);
            notifySyncStatus(win);
            break;
        case 'SYNC_ACK':
            handleSyncAck(senderDeviceId, data);
            notifySyncStatus(win);
            break;
        case 'SYNC_RESET':
            resetSyncSession(senderDeviceId);
            break;
        default:
            if (await routeSyncFilePacket(senderDeviceId, data, win)) notifySyncStatus(win);
            break;
    }
}
