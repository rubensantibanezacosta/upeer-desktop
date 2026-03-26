import https from 'node:https';
import dns from 'node:dns';
import net from 'node:net';
import { info, warn } from '../security/secure-logger.js';
import {
    FETCH_TIMEOUT_MS,
    GEO_BATCH_URL,
    GEO_SELF_URL,
    GEO_TIMEOUT_MS,
    PUBLIC_PEERS_URL,
    PROBE_BATCH_SIZE,
    PROBE_TIMEOUT_MS,
    extractHost,
    extractPort,
    haversineKm,
    isIPv4,
    isIPv6,
    makePeerInfo,
} from './peerManagerShared.js';
import type { GeoCoords, PeerInfo } from './peerManagerShared.js';

export async function fetchPeersWithMeta(): Promise<PeerInfo[]> {
    const content = await httpGet(PUBLIC_PEERS_URL, FETCH_TIMEOUT_MS);
    if (!content) return [];

    const peers: PeerInfo[] = [];
    const headings: Array<{ pos: number; name: string }> = [];
    const headingRegex = /(?:<h[23][^>]*>([^<]+)<\/h[23]>|^#{1,3}\s+(.+)$)/gim;
    let headingMatch: RegExpExecArray | null;
    while ((headingMatch = headingRegex.exec(content)) !== null) {
        const raw = (headingMatch[1] ?? headingMatch[2] ?? '').trim().replace(/\s+/g, ' ');
        if (raw && !/peer|v\d|\bapi\b/i.test(raw) && raw.length < 60) {
            headings.push({ pos: headingMatch.index, name: raw });
        }
    }

    const seen = new Set<string>();
    const markdownRegex = /\|\s*((?:tcp|tls):\/\/[^\s|]+)\s*\|\s*online[^|]*\|\s*(\d+)%/gi;
    let markdownMatch: RegExpExecArray | null;
    while ((markdownMatch = markdownRegex.exec(content)) !== null) {
        tryAddPeer(markdownMatch[1].trim(), parseInt(markdownMatch[2], 10), markdownMatch.index, peers, headings, seen);
    }

    if (peers.length === 0) {
        const htmlRegex = /href=["']((?:tcp|tls):\/\/[^"'<\s]+)["'][^>]*>[\s\S]{1,300}?online[\s\S]{1,150}?(\d+)%/gi;
        let htmlMatch: RegExpExecArray | null;
        while ((htmlMatch = htmlRegex.exec(content)) !== null) {
            tryAddPeer(htmlMatch[1].trim(), parseInt(htmlMatch[2], 10), htmlMatch.index, peers, headings, seen);
        }
    }

    const countries = new Set(peers.map(peer => peer.country)).size;
    info(`Parsed ${peers.length} peers from ${countries} countries`, undefined, 'peers');
    return peers;
}

export async function fetchSelfGeo(): Promise<GeoCoords | null> {
    const data = await httpGet(GEO_SELF_URL, GEO_TIMEOUT_MS);
    if (!data) return null;

    try {
        const parsed = JSON.parse(data) as { lat?: number; lon?: number; countryCode?: string };
        if (typeof parsed.lat === 'number' && typeof parsed.lon === 'number') {
            return { lat: parsed.lat, lon: parsed.lon, countryCode: parsed.countryCode ?? '' };
        }
    } catch (err) {
        warn('Failed to parse self geolocation response', { err: String(err) }, 'peers');
    }

    return null;
}

export async function geolocatePeers(peers: PeerInfo[], selfGeo: GeoCoords | null): Promise<void> {
    if (!selfGeo) return;

    const hostToIp = new Map<string, string>();
    const hostsToResolve = [...new Set(peers.map(peer => peer.host).filter(host => !isIPv4(host) && !isIPv6(host)))];

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
    for (const peer of peers) {
        if (isIPv6(peer.host)) continue;
        const ip = isIPv4(peer.host) ? peer.host : (hostToIp.get(peer.host) ?? peer.host);
        peerToIp.set(peer.uri, ip);
        if (!uniqueIps.includes(ip)) uniqueIps.push(ip);
    }

    const geoByIp = new Map<string, { lat: number; lon: number }>();
    for (let index = 0; index < uniqueIps.length; index += 100) {
        const batch = uniqueIps.slice(index, index + 100);
        const body = JSON.stringify(batch.map(query => ({ query, fields: 'lat,lon,query' })));
        const response = await httpPost(GEO_BATCH_URL, body, GEO_TIMEOUT_MS);
        if (!response) continue;
        try {
            const values = JSON.parse(response) as Array<{ query: string; lat?: number; lon?: number }>;
            for (const value of values) {
                if (typeof value.lat === 'number' && typeof value.lon === 'number') {
                    geoByIp.set(value.query, { lat: value.lat, lon: value.lon });
                }
            }
        } catch (err) {
            warn('Failed to parse batch geolocation response', { err: String(err) }, 'peers');
        }
    }

    let geolocated = 0;
    for (const peer of peers) {
        const ip = peerToIp.get(peer.uri);
        if (!ip) continue;
        const geo = geoByIp.get(ip);
        if (!geo) continue;
        peer.lat = geo.lat;
        peer.lon = geo.lon;
        peer.distanceKm = haversineKm(selfGeo.lat, selfGeo.lon, geo.lat, geo.lon);
        geolocated++;
    }

    info(`Geolocation: ${geolocated}/${peers.length} peers with distance`, undefined, 'peers');
}

export async function probePeersLatency(peers: PeerInfo[]): Promise<void> {
    for (let index = 0; index < peers.length; index += PROBE_BATCH_SIZE) {
        const batch = peers.slice(index, index + PROBE_BATCH_SIZE);
        await Promise.all(batch.map(async (peer) => {
            const result = await probePeerLatency(peer.uri);
            peer.alive = result.alive;
            peer.latencyMs = result.alive ? result.latencyMs : null;
            peer.lastChecked = Date.now();
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

function tryAddPeer(
    uri: string,
    uptimePct: number,
    pos: number,
    peers: PeerInfo[],
    headings: Array<{ pos: number; name: string }>,
    seen: Set<string>
): void {
    if (seen.has(uri)) return;
    const host = extractHost(uri);
    const port = extractPort(uri);
    if (!host || port <= 0) return;

    let country = 'Unknown';
    for (const heading of headings) {
        if (heading.pos <= pos) country = heading.name;
        else break;
    }

    seen.add(uri);
    peers.push(makePeerInfo(uri, country, uptimePct));
}

function httpGet(url: string, timeoutMs: number): Promise<string | null> {
    return new Promise(resolve => {
        const req = https.get(url, { timeout: timeoutMs }, (res) => {
            let data = '';
            res.on('data', (chunk: Buffer) => { data += chunk.toString(); });
            res.on('end', () => resolve(data));
            res.on('error', () => resolve(null));
        });
        req.on('error', () => resolve(null));
        req.on('timeout', () => { req.destroy(); resolve(null); });
    });
}

function httpPost(url: string, body: string, timeoutMs: number): Promise<string | null> {
    return new Promise(resolve => {
        const parsedUrl = new URL(url);
        const req = https.request({
            hostname: parsedUrl.hostname,
            port: parsedUrl.port || '443',
            path: parsedUrl.pathname + parsedUrl.search,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(body),
            },
            timeout: timeoutMs,
        }, (res) => {
            let data = '';
            res.on('data', (chunk: Buffer) => { data += chunk.toString(); });
            res.on('end', () => resolve(data));
            res.on('error', () => resolve(null));
        });
        req.on('error', () => resolve(null));
        req.on('timeout', () => { req.destroy(); resolve(null); });
        req.write(body);
        req.end();
    });
}
