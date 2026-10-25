export type SyncPhase = 'idle' | 'syncing' | 'live';

export type SyncPhasePeer = {
    historyCompleted: boolean;
    lastSeen: number;
};

export type SyncPhaseReport = {
    phase: SyncPhase;
    devicesTotal: number;
    devicesDone: number;
    lastPeerAt: number;
    ageMillis: number;
};

export const SYNC_STALE_MS = 45_000;

export function computeSyncPhase(
    peers: SyncPhasePeer[],
    now: number,
    staleMs: number = SYNC_STALE_MS,
): SyncPhaseReport {
    const devicesTotal = peers.length;
    if (devicesTotal === 0) {
        return { phase: 'idle', devicesTotal: 0, devicesDone: 0, lastPeerAt: 0, ageMillis: 0 };
    }
    const devicesDone = peers.filter((peer) => peer.historyCompleted).length;
    const lastPeerAt = peers.reduce((latest, peer) => Math.max(latest, peer.lastSeen), 0);
    const fresh = lastPeerAt > 0 && now - lastPeerAt <= staleMs;
    const done = devicesDone === devicesTotal;
    return {
        phase: fresh && !done ? 'syncing' : 'live',
        devicesTotal,
        devicesDone,
        lastPeerAt,
        ageMillis: lastPeerAt > 0 ? now - lastPeerAt : 0,
    };
}
