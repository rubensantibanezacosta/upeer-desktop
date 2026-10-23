import type { BrowserWindow } from 'electron';
import { getMyUPeerId } from '../../security/identity.js';
import { warn } from '../../security/secure-logger.js';
import { getRatchetSession } from '../../storage/ratchet/operations.js';
import { recordSyncEvent } from '../../storage/sync/events.js';
import { isSyncRelayTarget, markSyncRelayAcked } from '../../storage/sync/relay.js';
import {
    getSyncPeer,
    touchSyncPeer,
    updateSyncPeerAck,
    upsertSyncPeer,
    type SyncPeerRecord,
} from '../../storage/sync/peers.js';
import { decryptDoubleRatchetPayload } from '../handlers/doubleRatchetDecrypt.js';
import { applySyncEvent } from './apply.js';
import { certificateFromPacket, getMySyncIdentity, verifySyncHelloBinding } from './auth.js';
import { applySyncHistoryResponse, requestSyncHistory, respondSyncHistory } from './history.js';
import { relayBacklogToPeer, relaySyncEvent } from './relay.js';
import { replayAfterAck, replayPendingSyncEvents } from './replay.js';
import { sendSyncAck, sendSyncHello } from './transport.js';
import { SYNC_EVENT_KINDS, type SyncHelloPayload, type SyncPlainEvent } from './types.js';

type SyncPacket = Record<string, unknown>;

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
        replayPendingSyncEvents(peer).catch(err => warn('Sync replay failed', err, 'sync'));
        relayBacklogToPeer(peer).catch(err => warn('Sync relay backlog failed', err, 'sync'));
        const myDeviceId = getMySyncIdentity()?.deviceId ?? '';
        const hasSession = Boolean(getRatchetSession(myId, `sync:${peer.deviceId}`));
        if (myDeviceId <= peer.deviceId && (!peer.historyCompleted || !hasSession)) {
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
    const recorded = recordSyncEvent({
        eventId: event.eventId,
        originDeviceId,
        kind: event.kind,
        occurredAt: event.occurredAt,
        sequence: event.sequence,
        payload: JSON.stringify(event.payload),
        direction: 'inbound',
        appliedAt: now,
    });
    if (recorded) {
        await applySyncEvent({ ...event, originDeviceId }, win);
        if (originDeviceId !== getMySyncIdentity()?.deviceId) {
            await relaySyncEvent({ ...event, originDeviceId }, senderDeviceId, getMyUPeerId());
        }
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
            break;
        case 'SYNC_ENVELOPE':
            await handleSyncEnvelope(senderDeviceId, data, address, win);
            break;
        case 'SYNC_HISTORY_REQ':
            await handleSyncHistoryRequest(senderDeviceId, data, address);
            break;
        case 'SYNC_HISTORY_RES':
            await handleSyncHistoryResponse(senderDeviceId, data, address, win);
            break;
        case 'SYNC_ACK':
            handleSyncAck(senderDeviceId, data);
            break;
        default:
            break;
    }
}

async function decryptEvent(peer: SyncPeerRecord, data: SyncPacket, expectedType: string): Promise<SyncPlainEvent | null> {
    if (data.type !== expectedType) return null;
    const parsed = await decryptPayload(peer, data, expectedType);
    if (!parsed) return null;
    return toSyncEvent(parsed);
}

async function decryptPayload(peer: SyncPeerRecord, data: SyncPacket, expectedType: string): Promise<Record<string, unknown> | null> {
    if (data.type !== expectedType) return null;
    const plaintext = await decryptDoubleRatchetPayload(
        getMyUPeerId(),
        {
            content: typeof data.content === 'string' ? data.content : undefined,
            nonce: typeof data.nonce === 'string' ? data.nonce : undefined,
            ratchetHeader: data.ratchetHeader as never,
            x3dhInit: data.x3dhInit as never,
            senderDeviceId: peer.deviceId,
        },
        undefined,
        `sync:${peer.deviceId}`,
    );
    if (!plaintext) return null;
    try {
        const parsed = JSON.parse(plaintext) as unknown;
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
        return parsed as Record<string, unknown>;
    } catch {
        warn('Sync payload is not valid JSON', { deviceId: peer.deviceId, type: expectedType }, 'sync');
        return null;
    }
}

function matchesEnvelope(data: SyncPacket, event: SyncPlainEvent): boolean {
    return data.eventId === event.eventId
        && data.kind === event.kind
        && data.occurredAt === event.occurredAt
        && data.sequence === event.sequence
        && (data.originDeviceId === undefined
            || event.originDeviceId === undefined
            || data.originDeviceId === event.originDeviceId);
}

function toSyncEvent(value: unknown): SyncPlainEvent | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const record = value as Record<string, unknown>;
    if (typeof record.eventId !== 'string' || record.eventId.length === 0 || record.eventId.length > 128) return null;
    if (typeof record.kind !== 'string' || !SYNC_EVENT_KINDS.includes(record.kind as never)) return null;
    if (typeof record.occurredAt !== 'number' || !Number.isFinite(record.occurredAt)) return null;
    if (typeof record.sequence !== 'number' || !Number.isSafeInteger(record.sequence)) return null;
    if (record.originDeviceId !== undefined && (typeof record.originDeviceId !== 'string' || !/^[0-9a-f]{64}$/i.test(record.originDeviceId))) return null;
    if (!record.payload || typeof record.payload !== 'object' || Array.isArray(record.payload)) return null;
    return {
        eventId: record.eventId,
        kind: record.kind as SyncPlainEvent['kind'],
        occurredAt: record.occurredAt,
        sequence: record.sequence,
        originDeviceId: typeof record.originDeviceId === 'string' ? record.originDeviceId.toLowerCase() : undefined,
        payload: record.payload as Record<string, unknown>,
    };
}

