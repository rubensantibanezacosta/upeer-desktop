import https from 'node:https';
import dns from 'node:dns';
import net from 'node:net';
import { info, warn } from '../security/secure-logger.js';
import {
    FETCH_TIMEOUT_MS,
    GEO_CACHE_TTL_MS,
    GEO_PEER_URL,
    GEO_SELF_URL,
    GEO_TIMEOUT_MS,
    MAX_GEO_PEERS,
    PUBLIC_PEERS_URL,
    PROBE_BATCH_SIZE,
    PROBE_TIMEOUT_MS,
    computeScore,
    haversineKm,
    isIPv4,
    isIPv6,
    makePeerInfo,
} from './peerManagerShared.js';
import type { GeoCoords, PeerInfo } from './peerManagerShared.js';

const geoCache = new Map<string, { lat: number; lon: number; expiresAt: number }>();

export async function fetchPeersWithMeta(): Promise<PeerInfo[]> {
    const content = await httpGet(PUBLIC_PEERS_URL, FETCH_TIMEOUT_MS);
    if (!content) return [];

    let response: { peers?: Array<{ uri?: unknown; country?: unknown; status?: unknown; uptime_pct?: unknown }> };
    try {
        response = JSON.parse(content) as typeof response;
    } catch (error) {
        warn('Failed to parse public peers API response', { err: String(error) }, 'peers');
        return [];
    }

    if (!Array.isArray(response.peers)) {
        warn('Public peers API response has no peers array', undefined, 'peers');
        return [];
    }

    const seen = new Set<string>();
    const peers: PeerInfo[] = [];
    for (const item of response.peers) {
        if (typeof item.uri !== 'string' || item.status !== 'up' || seen.has(item.uri)) continue;
        if (!/^(?:tcp|tls):\/\//i.test(item.uri)) continue;

        const uptimePct = typeof item.uptime_pct === 'number' && Number.isFinite(item.uptime_pct)
            ? Math.max(0, Math.min(100, item.uptime_pct))
            : 0;
        const country = typeof item.country === 'string' && item.country.trim() ? item.country.trim() : 'Unknown';
        const peer = makePeerInfo(item.uri, country, uptimePct);
        if (!peer.host || peer.port <= 0) continue;

        seen.add(item.uri);
        peers.push(peer);
    }

    const countries = new Set(peers.map(peer => peer.country)).size;
    info(`Parsed ${peers.length} online peers from API across ${countries} countries`, undefined, 'peers');
    return peers;
}

export async function fetchSelfGeo(): Promise<GeoCoords | null> {
    const data = await httpGet(GEO_SELF_URL, GEO_TIMEOUT_MS);
    if (!data) return null;

    try {
        const parsed = JSON.parse(data) as { success?: boolean; latitude?: number; longitude?: number; country_code?: string };
        if (parsed.success === true && typeof parsed.latitude === 'number' && typeof parsed.longitude === 'number') {
            return { lat: parsed.latitude, lon: parsed.longitude, countryCode: parsed.country_code ?? '' };
        }
    } catch (err) {
        warn('Failed to parse self geolocation response', { err: String(err) }, 'peers');
    }

    return null;
}

export async function geolocatePeers(peers: PeerInfo[], selfGeo: GeoCoords | null): Promise<void> {
    if (!selfGeo) return;

    const targets = peers.slice(0, MAX_GEO_PEERS);
    const hostToIp = new Map<string, string>();
    const hostsToResolve = [...new Set(targets.map(peer => peer.host).filter(host => !isIPv4(host) && !isIPv6(host)))];

    await Promise.allSettled(
        hostsToResolve.map(async (host) => {
            try {
                const address = await dns.promises.lookup(host, { family: 4 });
                hostToIp.set(host, address.address);
            } catch {
                hostToIp.set(host, host);
            }
        })
    );

    const peerToIp = new Map<string, string>();
    const uniqueIps: string[] = [];
    for (const peer of targets) {
        if (isIPv6(peer.host)) continue;
        const ip = isIPv4(peer.host) ? peer.host : (hostToIp.get(peer.host) ?? peer.host);
        peerToIp.set(peer.uri, ip);
        if (!uniqueIps.includes(ip)) uniqueIps.push(ip);
    }

    const now = Date.now();
    const geoByIp = new Map<string, { lat: number; lon: number }>();
    const pendingIps: string[] = [];
    for (const ip of uniqueIps) {
        const cached = geoCache.get(ip);
        if (cached && cached.expiresAt > now) {
            geoByIp.set(ip, { lat: cached.lat, lon: cached.lon });
        } else {
            pendingIps.push(ip);
        }
    }

    const concurrency = 5;
    for (let index = 0; index < pendingIps.length; index += concurrency) {
        const batch = pendingIps.slice(index, index + concurrency);
        await Promise.all(batch.map(async (ip) => {
            const response = await httpGet(`${GEO_PEER_URL}${encodeURIComponent(ip)}`, GEO_TIMEOUT_MS);
            if (!response) return;
            try {
                const parsed = JSON.parse(response) as { success?: boolean; latitude?: number; longitude?: number };
                if (parsed.success !== true || typeof parsed.latitude !== 'number' || typeof parsed.longitude !== 'number') return;
                geoByIp.set(ip, { lat: parsed.latitude, lon: parsed.longitude });
                geoCache.set(ip, { lat: parsed.latitude, lon: parsed.longitude, expiresAt: Date.now() + GEO_CACHE_TTL_MS });
            } catch (err) {
                warn('Failed to parse peer geolocation response', { err: String(err), ip }, 'peers');
            }
        }));
    }

    let geolocated = 0;
    for (const peer of targets) {
        const ip = peerToIp.get(peer.uri);
        if (!ip) continue;
        const geo = geoByIp.get(ip);
        if (!geo) continue;
        peer.lat = geo.lat;
        peer.lon = geo.lon;
        peer.distanceKm = haversineKm(selfGeo.lat, selfGeo.lon, geo.lat, geo.lon);
        geolocated++;
    }

    info(`Geolocation: ${geolocated}/${targets.length} peers with distance`, undefined, 'peers');
}

export async function probePeersLatency(peers: PeerInfo[]): Promise<void> {
    for (let index = 0; index < peers.length; index += PROBE_BATCH_SIZE) {
        const batch = peers.slice(index, index + PROBE_BATCH_SIZE);
        await Promise.all(batch.map(async (peer) => {
            const result = await probePeerLatency(peer.uri);
            peer.alive = result.alive;
            peer.latencyMs = result.alive ? result.latencyMs : null;
            peer.lastChecked = Date.now();
            peer.score = computeScore(peer, null);
        }));
    }

    const aliveCount = peers.filter(peer => peer.alive).length;
    info(`Latency: ${aliveCount}/${peers.length} peers reachable`, undefined, 'peers');
}

export async function probePeerLatency(uri: string): Promise<{ alive: boolean; latencyMs: number }> {
    const match = /^(?:tcp|tls):\/\/(\[([^\]]+)\]|([^/:?]+)):(\d+)/.exec(uri);
    if (!match) return { alive: false, latencyMs: 0 };

    const host = match[2] ?? match[3] ?? '';
    const port = parseInt(match[4] ?? '0', 10);
    const startedAt = Date.now();

    return new Promise(resolve => {
        const socket = new net.Socket();
        let settled = false;
        const done = (alive: boolean) => {
            if (settled) return;
            settled = true;
            socket.destroy();
            resolve({ alive, latencyMs: Date.now() - startedAt });
        };
        socket.setTimeout(PROBE_TIMEOUT_MS);
        socket.once('connect', () => done(true));
        socket.once('error', () => done(false));
        socket.once('timeout', () => done(false));
        socket.connect(port, host);
    });
}

function httpGet(url: string, timeoutMs: number): Promise<string | null> {
    return new Promise(resolve => {
        const req = https.get(url, { timeout: timeoutMs, headers: { 'User-Agent': 'uPeer/1.0', Accept: 'application/json' } }, (res) => {
            if (res.statusCode != null && (res.statusCode < 200 || res.statusCode >= 300)) {
                res.resume();
                resolve(null);
                return;
            }
            let data = '';
            res.on('data', (chunk: Buffer) => { data += chunk.toString(); });
            res.on('end', () => resolve(data));
            res.on('error', () => resolve(null));
        });
        req.on('error', () => resolve(null));
        req.on('timeout', () => { req.destroy(); resolve(null); });
    });
}
