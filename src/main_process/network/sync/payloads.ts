import { getMyUPeerId } from '../../security/identity.js';
import { parseCertificate } from '../../security/deviceCertificate.js';
import { warn } from '../../security/secure-logger.js';
import type { SyncPeerRecord } from '../../storage/sync/peers.js';
import { decryptDoubleRatchetPayload } from '../handlers/doubleRatchetDecrypt.js';
import { resetSyncSession } from './sessionReset.js';
import { sendSyncReset } from './transport.js';
import { SYNC_EVENT_KINDS, type SyncPlainEvent } from './types.js';

export type SyncPacket = Record<string, unknown>;

const DECRYPT_FAILURE_WINDOW_MS = 15_000;
const DECRYPT_FAILURE_LIMIT = 3;

export async function decryptEvent(peer: SyncPeerRecord, data: SyncPacket, expectedType: string): Promise<SyncPlainEvent | null> {
    if (data.type !== expectedType) return null;
    const parsed = await decryptPayload(peer, data, expectedType);
    if (!parsed) return null;
    return toSyncEvent(parsed);
}

const decryptFailures = new Map<string, number[]>();

function shouldResetSession(deviceId: string): boolean {
    const now = Date.now();
    const recent = (decryptFailures.get(deviceId) ?? []).filter(at => now - at < DECRYPT_FAILURE_WINDOW_MS);
    recent.push(now);
    decryptFailures.set(deviceId, recent);
    if (recent.length < DECRYPT_FAILURE_LIMIT) return false;
    decryptFailures.delete(deviceId);
    return true;
}

export async function decryptPayload(peer: SyncPeerRecord, data: SyncPacket, expectedType: string): Promise<Record<string, unknown> | null> {
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
    if (!plaintext) {
        if (!data.x3dhInit && !shouldResetSession(peer.deviceId)) {
            warn('Duplicate or out-of-order sync frame ignored', { deviceId: peer.deviceId, type: expectedType }, 'sync');
            return null;
        }
        warn('Sync payload could not be decrypted; requesting a session reset', { deviceId: peer.deviceId, type: expectedType }, 'sync');
        resetSyncSession(peer.deviceId);
        sendSyncReset(peer);
        return null;
    }
    decryptFailures.delete(peer.deviceId);
    try {
        const parsed = JSON.parse(plaintext) as unknown;
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
        return parsed as Record<string, unknown>;
    } catch {
        warn('Sync payload is not valid JSON', { deviceId: peer.deviceId, type: expectedType }, 'sync');
        return null;
    }
}

export function matchesEnvelope(data: SyncPacket, event: SyncPlainEvent): boolean {
    return data.eventId === event.eventId
        && data.kind === event.kind
        && data.occurredAt === event.occurredAt
        && data.sequence === event.sequence
        && (data.originDeviceId === undefined
            || event.originDeviceId === undefined
            || data.originDeviceId === event.originDeviceId);
}

export function toSyncEvent(value: unknown): SyncPlainEvent | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const record = value as Record<string, unknown>;
    if (typeof record.eventId !== 'string' || record.eventId.length === 0 || record.eventId.length > 128) return null;
    if (typeof record.kind !== 'string' || !SYNC_EVENT_KINDS.includes(record.kind as never)) return null;
    if (typeof record.occurredAt !== 'number' || !Number.isFinite(record.occurredAt)) return null;
    if (typeof record.sequence !== 'number' || !Number.isSafeInteger(record.sequence)) return null;
    if (record.originDeviceId !== undefined && (typeof record.originDeviceId !== 'string' || !/^[0-9a-f]{64}$/i.test(record.originDeviceId))) return null;
    if (record.originSignature !== undefined && (typeof record.originSignature !== 'string' || !/^[0-9a-f]{128}$/i.test(record.originSignature))) return null;
    const originCertificate = record.originCertificate === undefined
        ? undefined
        : parseCertificate(record.originCertificate) ?? undefined;
    if (record.originCertificate !== undefined && !originCertificate) return null;
    if (!record.payload || typeof record.payload !== 'object' || Array.isArray(record.payload)) return null;
    return {
        eventId: record.eventId,
        kind: record.kind as SyncPlainEvent['kind'],
        occurredAt: record.occurredAt,
        sequence: record.sequence,
        originDeviceId: typeof record.originDeviceId === 'string' ? record.originDeviceId.toLowerCase() : undefined,
        originSignature: typeof record.originSignature === 'string' ? record.originSignature.toLowerCase() : undefined,
        originCertificate,
        payload: record.payload as Record<string, unknown>,
    };
}
