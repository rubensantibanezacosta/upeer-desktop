import { getMyUPeerId } from '../../security/identity.js';
import { debug, warn } from '../../security/secure-logger.js';
import { recordSyncEvent } from '../../storage/sync/events.js';
import { registerSyncEventSink, type SyncEventDraft } from '../../storage/sync/eventSink.js';
import { listSyncPeers } from '../../storage/sync/peers.js';
import { getSelfAddresses } from '../messaging/chatSupport.js';
import { getMySyncIdentity } from './auth.js';
import { signSyncEventOrigin } from './origin.js';
import { nextSyncSequence, sendSyncEnvelope, sendSyncHello } from './transport.js';
import { notifySyncStatus } from './statusNotify.js';

let discoveryTimer: ReturnType<typeof setInterval> | null = null;
let discoveryRunning = false;

export async function broadcastSyncEvent(event: SyncEventDraft): Promise<void> {
    const myId = getMyUPeerId();
    const sequence = nextSyncSequence();
    const plainEvent = signSyncEventOrigin({
        eventId: event.eventId,
        kind: event.kind,
        occurredAt: event.occurredAt,
        sequence,
        payload: event.payload,
    });
    const recorded = recordSyncEvent({
        eventId: plainEvent.eventId,
        originDeviceId: plainEvent.originDeviceId ?? getMySyncIdentity()?.deviceId ?? 'unknown-device',
        kind: plainEvent.kind,
        occurredAt: plainEvent.occurredAt,
        sequence: plainEvent.sequence,
        payload: JSON.stringify(plainEvent.payload),
        entityId: event.entityId,
        originSignature: plainEvent.originSignature ?? null,
        originCertificate: plainEvent.originCertificate
            ? JSON.stringify(plainEvent.originCertificate)
            : null,
        direction: 'outbound',
        appliedAt: Date.now(),
    });
    if (!recorded) return;

    const peers = listSyncPeers(myId).filter(peer => peer.address);
    if (peers.length === 0) {
        discoverSyncPeers().catch(err => warn('Sync peer discovery failed', err, 'sync'));
        return;
    }
    for (const peer of peers) {
        sendSyncEnvelope(peer, plainEvent).catch(err => {
            warn('Sync envelope delivery failed', { deviceId: peer.deviceId, err: String(err) }, 'sync');
        });
    }
    notifySyncStatus();
}

export async function discoverSyncPeers(): Promise<void> {
    if (discoveryRunning) return;
    discoveryRunning = true;
    try {
        const myId = getMyUPeerId();
        const addresses = new Set(await getSelfAddresses(myId));
        for (const peer of listSyncPeers(myId)) {
            if (peer.address) addresses.add(peer.address);
        }
        for (const address of addresses) {
            sendSyncHello(address, false);
        }
        debug('Sync peer discovery dispatched', { addresses: addresses.size }, 'sync');
    } finally {
        discoveryRunning = false;
    }
}

export function startSyncDiscovery(intervalMs = 300_000): void {
    if (discoveryTimer) return;
    registerSyncEventSink((event) => {
        void broadcastSyncEvent(event).catch(err => warn('Sync event broadcast failed', err, 'sync'));
    });
    discoverSyncPeers().catch(err => warn('Initial sync discovery failed', err, 'sync'));
    discoveryTimer = setInterval(() => {
        discoverSyncPeers().catch(err => warn('Periodic sync discovery failed', err, 'sync'));
    }, intervalMs);
}

export function stopSyncDiscovery(): void {
    if (!discoveryTimer) return;
    clearInterval(discoveryTimer);
    discoveryTimer = null;
    registerSyncEventSink(null);
}
