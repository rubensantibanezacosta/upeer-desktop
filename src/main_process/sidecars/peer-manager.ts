import type { PeerInfo } from './peerManagerShared.js';
import { peerManagerState } from './peerManagerState.js';
import { fullRefresh, restorePeerCache, startHealthMonitor } from './peerManagerLifecycle.js';

export type { PeerInfo };

export function setOnPeersChanged(cb: (uris: string[]) => void): void {
    peerManagerState.peersChangedCb = cb;
}

export function getActivePeerUris(): string[] {
    return peerManagerState.activePeers.map(peer => peer.uri);
}

export function getPeerPool(): PeerInfo[] {
    return [...peerManagerState.peerPool];
}

export function getSelfGeo(): { lat: number; lon: number } | null {
    return peerManagerState.selfGeo ? { lat: peerManagerState.selfGeo.lat, lon: peerManagerState.selfGeo.lon } : null;
}

export async function initPeerManager(cacheDir: string): Promise<string[]> {
    const cacheRestored = restorePeerCache(cacheDir);
    if (!cacheRestored) {
        await fullRefresh(cacheDir);
    }

    startHealthMonitor(cacheDir);
    return getActivePeerUris();
}

export function stopPeerManager(): void {
    if (peerManagerState.healthTimer) {
        clearInterval(peerManagerState.healthTimer);
        peerManagerState.healthTimer = null;
    }
}
