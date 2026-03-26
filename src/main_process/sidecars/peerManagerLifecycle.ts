import { warn, info } from '../security/secure-logger.js';
import { loadCache, saveCache } from './peerManagerCache.js';
import {
    fetchPeersWithMeta,
    fetchSelfGeo,
    geolocatePeers,
    probePeerLatency,
    probePeersLatency,
} from './peerManagerNetwork.js';
import {
    CACHE_TTL_MS,
    FALLBACK_PEERS,
    HEALTH_CHECK_INTERVAL_MS,
    MAX_ACTIVE_PEERS,
    computeScore,
    logTopPeers,
    makePeerInfo,
} from './peerManagerShared.js';
import type { GeoCoords } from './peerManagerShared.js';
import { peerManagerState } from './peerManagerState.js';

const refreshCacheSnapshot = (cacheDir: string) => {
    saveCache(cacheDir, {
        selfGeo: peerManagerState.selfGeo,
        peers: peerManagerState.peerPool,
        lastFullRefresh: Date.now(),
    });
};

const applyActivePeers = () => {
    peerManagerState.activePeers = peerManagerState.peerPool.slice(0, MAX_ACTIVE_PEERS);
    peerManagerState.peersChangedCb?.(peerManagerState.activePeers.map((peer) => peer.uri));
};

export const restorePeerCache = (cacheDir: string) => {
    const cached = loadCache(cacheDir);
    const cacheAge = cached ? Date.now() - cached.lastFullRefresh : Infinity;

    if (!cached || cacheAge >= CACHE_TTL_MS || cached.peers.length < 4) {
        return false;
    }

    const minLeft = Math.round((CACHE_TTL_MS - cacheAge) / 60_000);
    info(`Peers cache valid (${cached.peers.length} nodes, refresh in ${minLeft} min)`, undefined, 'peers');
    peerManagerState.selfGeo = cached.selfGeo;
    peerManagerState.peerPool = cached.peers;
    peerManagerState.activePeers = cached.peers.slice(0, MAX_ACTIVE_PEERS);

    setTimeout(() => {
        void fullRefresh(cacheDir).catch((err) => {
            warn('Background peer refresh failed', { err: String(err) }, 'peers');
        });
    }, 20_000);

    return true;
};

export async function fullRefresh(cacheDir: string): Promise<void> {
    info('Full peer discovery started', undefined, 'peers');

    if (!peerManagerState.selfGeo) {
        peerManagerState.selfGeo = await fetchSelfGeo();
        if (peerManagerState.selfGeo) {
            info(`Self geolocation: ${peerManagerState.selfGeo.countryCode} (${peerManagerState.selfGeo.lat.toFixed(2)}, ${peerManagerState.selfGeo.lon.toFixed(2)})`, undefined, 'peers');
        } else {
            warn('Self geolocation unavailable — scoring without distance', undefined, 'peers');
        }
    }

    const rawPeers = await fetchPeersWithMeta();
    info(`${rawPeers.length} online peers parsed`, undefined, 'peers');

    const existingUris = new Set(rawPeers.map((peer) => peer.uri));
    for (const fallbackPeer of FALLBACK_PEERS) {
        if (!existingUris.has(fallbackPeer.uri)) {
            rawPeers.push(makePeerInfo(fallbackPeer.uri, fallbackPeer.country, 90));
        }
    }

    if (peerManagerState.selfGeo) {
        await geolocatePeers(rawPeers, peerManagerState.selfGeo);
    }

    await probePeersLatency(rawPeers);

    for (const peer of rawPeers) {
        peer.score = computeScore(peer, peerManagerState.selfGeo);
    }

    peerManagerState.peerPool = rawPeers
        .filter((peer) => peer.alive)
        .sort((a, b) => b.score - a.score);

    logTopPeers(peerManagerState.peerPool);
    applyActivePeers();
    refreshCacheSnapshot(cacheDir);
    info('Full peer discovery completed', undefined, 'peers');
}

export function startHealthMonitor(cacheDir: string): void {
    if (peerManagerState.healthTimer) {
        clearInterval(peerManagerState.healthTimer);
    }

    peerManagerState.healthTimer = setInterval(() => {
        void healthCheck(cacheDir).catch((err) => {
            warn('Peer health check failed', { err: String(err) }, 'peers');
        });
    }, HEALTH_CHECK_INTERVAL_MS);
}

export async function healthCheck(cacheDir: string): Promise<void> {
    if (peerManagerState.activePeers.length === 0) {
        return;
    }

    const results = await Promise.all(
        peerManagerState.activePeers.map(async (peer) => {
            const result = await probePeerLatency(peer.uri);
            return { peer, ...result };
        })
    );

    let changed = false;
    const activeSet = new Set(peerManagerState.activePeers.map((peer) => peer.uri));

    for (const { peer, alive, latencyMs } of results) {
        const wasAlive = peer.alive;
        peer.alive = alive;
        peer.latencyMs = alive ? latencyMs : peer.latencyMs;
        peer.lastChecked = Date.now();
        peer.score = computeScore(peer, peerManagerState.selfGeo as GeoCoords | null);

        if (wasAlive && !alive) {
            warn(`Peer down: ${peer.uri}`, undefined, 'peers');
            const replacement = peerManagerState.peerPool.find((candidate) => candidate.alive && !activeSet.has(candidate.uri));
            if (replacement) {
                peerManagerState.activePeers[peerManagerState.activePeers.indexOf(peer)] = replacement;
                activeSet.delete(peer.uri);
                activeSet.add(replacement.uri);
                info(`Replaced by: ${replacement.uri} (score=${replacement.score.toFixed(1)})`, undefined, 'peers');
                changed = true;
                continue;
            }

            warn('Peer pool exhausted — triggering background rediscovery', undefined, 'peers');
            setTimeout(() => {
                void fullRefresh(cacheDir).catch((err) => {
                    warn('Peer rediscovery after pool exhaustion failed', { err: String(err) }, 'peers');
                });
            }, 2_000);
            return;
        }
    }

    if (changed) {
        refreshCacheSnapshot(cacheDir);
        peerManagerState.peersChangedCb?.(peerManagerState.activePeers.map((peer) => peer.uri));
    }
}