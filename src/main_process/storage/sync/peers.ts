import { and, eq } from 'drizzle-orm';
import { getDb, getSchema } from '../shared.js';

export type SyncPeerRecord = {
    deviceId: string;
    upeerId: string;
    devicePublicKey: string;
    deviceCertificate: string;
    deviceSignedPreKey: string;
    deviceSignedPreKeySignature: string;
    deviceSignedPreKeyId: number;
    address: string | null;
    lastSeen: number;
    lastSequence: number;
    ackSequence: number;
    historyCursor: string | null;
    historyCompleted: boolean;
};

export type SyncPeerInput = Omit<SyncPeerRecord, 'lastSequence' | 'ackSequence' | 'historyCursor' | 'historyCompleted'>;

export function upsertSyncPeer(peer: SyncPeerInput): void {
    const db = getDb();
    const schema = getSchema();
    db.insert(schema.syncPeers).values({
        deviceId: peer.deviceId,
        upeerId: peer.upeerId,
        devicePublicKey: peer.devicePublicKey,
        deviceCertificate: peer.deviceCertificate,
        deviceSignedPreKey: peer.deviceSignedPreKey,
        deviceSignedPreKeySignature: peer.deviceSignedPreKeySignature,
        deviceSignedPreKeyId: peer.deviceSignedPreKeyId,
        address: peer.address,
        lastSeen: peer.lastSeen,
    }).onConflictDoUpdate({
        target: schema.syncPeers.deviceId,
        set: {
            upeerId: peer.upeerId,
            devicePublicKey: peer.devicePublicKey,
            deviceCertificate: peer.deviceCertificate,
            deviceSignedPreKey: peer.deviceSignedPreKey,
            deviceSignedPreKeySignature: peer.deviceSignedPreKeySignature,
            deviceSignedPreKeyId: peer.deviceSignedPreKeyId,
            address: peer.address,
            lastSeen: peer.lastSeen,
        },
    }).run();
}

export function listSyncPeers(upeerId: string): SyncPeerRecord[] {
    const db = getDb();
    const schema = getSchema();
    return db.select().from(schema.syncPeers)
        .where(eq(schema.syncPeers.upeerId, upeerId))
        .all() as SyncPeerRecord[];
}

export function getSyncPeer(deviceId: string): SyncPeerRecord | null {
    const db = getDb();
    const schema = getSchema();
    const row = db.select().from(schema.syncPeers)
        .where(eq(schema.syncPeers.deviceId, deviceId))
        .get();
    return (row as SyncPeerRecord | undefined) ?? null;
}

export function touchSyncPeer(deviceId: string, address: string, lastSequence: number): void {
    const db = getDb();
    const schema = getSchema();
    const peer = getSyncPeer(deviceId);
    if (!peer) return;
    db.update(schema.syncPeers)
        .set({ address, lastSeen: Date.now(), lastSequence: Math.max(peer.lastSequence, lastSequence) })
        .where(eq(schema.syncPeers.deviceId, deviceId))
        .run();
}

export function updateSyncPeerAck(deviceId: string, ackSequence: number): void {
    const db = getDb();
    const schema = getSchema();
    const peer = getSyncPeer(deviceId);
    if (!peer || ackSequence <= peer.ackSequence) return;
    db.update(schema.syncPeers)
        .set({ ackSequence, lastSeen: Date.now() })
        .where(eq(schema.syncPeers.deviceId, deviceId))
        .run();
}

export function updateSyncPeerHistory(deviceId: string, cursor: string | null, completed: boolean): void {
    const db = getDb();
    const schema = getSchema();
    db.update(schema.syncPeers)
        .set({ historyCursor: cursor, historyCompleted: completed, lastSeen: Date.now() })
        .where(eq(schema.syncPeers.deviceId, deviceId))
        .run();
}

export function isKnownSyncPeer(upeerId: string, deviceId: string): boolean {
    const db = getDb();
    const schema = getSchema();
    return Boolean(db.select({ deviceId: schema.syncPeers.deviceId })
        .from(schema.syncPeers)
        .where(and(eq(schema.syncPeers.upeerId, upeerId), eq(schema.syncPeers.deviceId, deviceId)))
        .get());
}
