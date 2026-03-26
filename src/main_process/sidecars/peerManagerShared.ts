import { info, warn } from '../security/secure-logger.js';

export interface PeerInfo {
    uri: string;
    host: string;
    port: number;
    country: string;
    uptimePct: number;
    latencyMs: number | null;
    distanceKm: number | null;
    lat: number | null;
    lon: number | null;
    score: number;
    alive: boolean;
    lastChecked: number;
}

export interface GeoCoords {
    lat: number;
    lon: number;
    countryCode: string;
}

export interface PeerCache {
    selfGeo: GeoCoords | null;
    peers: PeerInfo[];
    lastFullRefresh: number;
}

export const PUBLIC_PEERS_URL = 'https://publicpeers.neilalexander.dev/';
export const GEO_SELF_URL = 'https://ip-api.com/json?fields=lat,lon,countryCode';
export const GEO_BATCH_URL = 'https://ip-api.com/batch?fields=lat,lon,countryCode,query';
export const PROBE_TIMEOUT_MS = 3_000;
export const GEO_TIMEOUT_MS = 6_000;
export const FETCH_TIMEOUT_MS = 10_000;
export const CACHE_TTL_MS = 2 * 60 * 60 * 1_000;
export const HEALTH_CHECK_INTERVAL_MS = 5 * 60 * 1_000;
export const PROBE_BATCH_SIZE = 30;
export const MAX_ACTIVE_PEERS = 8;
export const MAX_GEO_DISTANCE_KM = 12_000;

export const FALLBACK_PEERS: Array<{ uri: string; country: string }> = [
    { uri: 'tls://ygg.mkg20001.io:443', country: 'Germany' },
    {
        uri: 'tls://yggdrasil.neilalexander.dev:64648?key=ecbbcb3298e7d3b4196103333c3e839cfe47a6ca47602b94a6d596683f6bb358',
        country: 'UK'
    },
    { uri: 'tls://51.15.204.214:54321', country: 'France' },
    { uri: 'tls://95.217.35.92:1337', country: 'Finland' },
    { uri: 'tls://vpn.ltha.de:443', country: 'Germany' },
    { uri: 'tcp://longseason.1200bps.xyz:13121', country: 'UK' },
    { uri: 'tls://ygg1.grin.hu:42444', country: 'Hungary' },
    { uri: 'tcp://yggno.de:18226', country: 'Germany' },
    { uri: 'tls://spain.magicum.net:36901', country: 'Spain' },
    { uri: 'tls://redcatho.de:9494', country: 'Germany' },
];

export function makePeerInfo(uri: string, country: string, uptimePct: number): PeerInfo {
    return {
        uri,
        host: extractHost(uri),
        port: extractPort(uri),
        country,
        uptimePct,
        latencyMs: null,
        distanceKm: null,
        lat: null,
        lon: null,
        score: 0,
        alive: false,
        lastChecked: 0,
    };
}

export function computeScore(peer: PeerInfo, geo: GeoCoords | null): number {
    let geoScore = 20;
    let latencyScore = 20;

    if (geo != null && peer.distanceKm != null) {
        geoScore = Math.max(0, 1 - peer.distanceKm / MAX_GEO_DISTANCE_KM) * 40;
    }
    if (peer.latencyMs != null) {
        latencyScore = Math.max(0, 1 - peer.latencyMs / PROBE_TIMEOUT_MS) * 40;
    }
    const uptimeScore = (peer.uptimePct / 100) * 20;

    return geoScore + latencyScore + uptimeScore;
}

export function logTopPeers(pool: PeerInfo[]): void {
    const topCount = Math.min(pool.length, 6);
    if (topCount === 0) {
        warn('No reachable peers!', undefined, 'peers');
        return;
    }

    info(`Active pool: ${pool.length} reachable peers — top ${topCount}:`, undefined, 'peers');
    for (const peer of pool.slice(0, topCount)) {
        const distance = peer.distanceKm != null ? `${Math.round(peer.distanceKm)} km` : '? km';
        const latency = peer.latencyMs != null ? `${peer.latencyMs} ms` : '? ms';
        info(
            `score=${peer.score.toFixed(1).padStart(5)} latency=${latency.padStart(7)} dist=${distance.padStart(8)} uptime=${peer.uptimePct}% [${peer.country}] ${peer.uri}`,
            undefined,
            'peers'
        );
    }
}

export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const earthRadiusKm = 6_371;
    const deltaLat = toRad(lat2 - lat1);
    const deltaLon = toRad(lon2 - lon1);
    const value =
        Math.sin(deltaLat / 2) ** 2
        + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(deltaLon / 2) ** 2;
    return earthRadiusKm * 2 * Math.asin(Math.sqrt(value));
}

export function extractHost(uri: string): string {
    const match = /^(?:tcp|tls):\/\/(?:\[([^\]]+)\]|([^/:?[\]]+))/.exec(uri);
    return match ? (match[1] ?? match[2] ?? '') : '';
}

export function extractPort(uri: string): number {
    const withoutPrefix = uri.replace(/^(?:tcp|tls):\/\/(?:\[[^\]]+\]|[^/:?[\]]+)/, '');
    const match = /^:(\d+)/.exec(withoutPrefix);
    return match ? parseInt(match[1], 10) : 0;
}

export function isIPv4(value: string): boolean {
    return /^\d{1,3}(?:\.\d{1,3}){3}$/.test(value);
}

export function isIPv6(value: string): boolean {
    return value.includes(':') && /^[0-9a-f:]+$/i.test(value);
}

function toRad(degrees: number): number {
    return degrees * (Math.PI / 180);
}
