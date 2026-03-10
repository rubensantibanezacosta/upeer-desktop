/**
 * MÓDULO: Gestión Inteligente de Peers Yggdrasil
 *
 * Implementa selección, puntuación y monitorización continua de peers con
 * soporte de geolocalización IP para preferir nodos geográficamente cercanos.
 *
 * ── SCORING (0-100 puntos) ────────────────────────────────────────────────
 *   40 pts → Proximidad geográfica  (0 = antipodal ≥12 000 km, 40 = local)
 *   40 pts → Latencia TCP medida    (0 = ≥ 3 000 ms,           40 = 0 ms)
 *   20 pts → Uptime histórico       (0 = 0 %,                  20 = 100 %)
 *
 * Si un dato no está disponible (sin geo, sin latencia), se asigna el valor
 * neutro (20 pts) para no penalizar peers que no se pudieron medir.
 *
 * ── CICLO DE VIDA ─────────────────────────────────────────────────────────
 *   1. initPeerManager()  → selección inicial inteligente (o usa caché <2 h)
 *   2. Health monitor     → sondeo cada 5 min, reemplaza peers caídos al vuelo
 *   3. fullRefresh()      → redescubrimiento completo cuando el pool se agota
 *   4. Caché persistente  → peer-cache.json en userData (evita re-geolocatar)
 */

import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';
import dns from 'node:dns';
import net from 'node:net';
import { warn, info } from '../security/secure-logger.js';

// ── Tipos ─────────────────────────────────────────────────────────────────────

export interface PeerInfo {
    uri: string;          // URI completa tcp:// o tls://
    host: string;          // hostname o IP (sin corchetes)
    port: number;
    country: string;          // país según la lista pública
    uptimePct: number;          // 0-100, extraído de la página
    latencyMs: number | null;   // ms del TCP connect, null si no medido
    distanceKm: number | null;   // km desde nuestra IP, null si sin geo
    lat: number | null;         // latitud geográfica del peer (ip-api)
    lon: number | null;         // longitud geográfica del peer (ip-api)
    score: number;          // puntuación compuesta 0-100
    alive: boolean;
    lastChecked: number;          // timestamp Unix
}

interface GeoCoords {
    lat: number;
    lon: number;
    countryCode: string;
}

interface PeerCache {
    selfGeo: GeoCoords | null;
    peers: PeerInfo[];
    lastFullRefresh: number;
}

// ── Constantes ────────────────────────────────────────────────────────────────

const PUBLIC_PEERS_URL = 'https://publicpeers.neilalexander.dev/';
const GEO_SELF_URL = 'https://ip-api.com/json?fields=lat,lon,countryCode';
const GEO_BATCH_URL = 'https://ip-api.com/batch?fields=lat,lon,countryCode,query';

const PROBE_TIMEOUT_MS = 3_000;
const GEO_TIMEOUT_MS = 6_000;
const FETCH_TIMEOUT_MS = 10_000;
const CACHE_TTL_MS = 2 * 60 * 60 * 1_000;   // 2 horas
const HEALTH_CHECK_INTERVAL_MS = 5 * 60 * 1_000;        // 5 minutos
const PROBE_BATCH_SIZE = 30;
const MAX_ACTIVE_PEERS = 8;
const MAX_GEO_DISTANCE_KM = 12_000;   // normalización para scoring

/**
 * Peers de reserva con buena reputación — todos probados antes de usarse.
 * Preferimos TLS (cifrado), buena distribución geográfica y uptime 100%.
 * Se añaden al pool dinámico si la lista pública no rinde suficientes peers.
 */
const FALLBACK_PEERS: Array<{ uri: string; country: string }> = [
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

// ── Estado del módulo ─────────────────────────────────────────────────────────

let activePeers: PeerInfo[] = [];
let peerPool: PeerInfo[] = [];   // todos los peers alcanzables, por score
let selfGeo: GeoCoords | null = null;
let healthTimer: NodeJS.Timeout | null = null;
let peersChangedCb: ((uris: string[]) => void) | null = null;

// ── API pública ───────────────────────────────────────────────────────────────

/**
 * Registra un callback que se invoca cuando la lista de peers activos cambia.
 * Se llama tanto en la selección inicial como al reemplazar peers caídos.
 */
export function setOnPeersChanged(cb: (uris: string[]) => void): void {
    peersChangedCb = cb;
}

/** URIs de los peers actualmente activos (top-N del pool). */
export function getActivePeerUris(): string[] {
    return activePeers.map(p => p.uri);
}

/** Pool completo de peers conocidos con métricas (para diagnóstico o UI). */
export function getPeerPool(): PeerInfo[] {
    return [...peerPool];
}

/** Geolocalización de este nodo (null si no disponible). */
export function getSelfGeo(): { lat: number; lon: number } | null {
    return selfGeo ? { lat: selfGeo.lat, lon: selfGeo.lon } : null;
}

/**
 * Inicializa el gestor de peers:
 *   - Carga caché si es reciente (<2 h) → arranque instantáneo + refresco bg
 *   - Si la caché está obsoleta → descubrimiento completo bloqueante
 *   - Arranca el health monitor periódico
 *
 * @returns URIs de los peers activos seleccionados
 */
export async function initPeerManager(cacheDir: string): Promise<string[]> {
    const cached = loadCache(cacheDir);
    const cacheAge = cached ? Date.now() - cached.lastFullRefresh : Infinity;

    if (cached && cacheAge < CACHE_TTL_MS && cached.peers.length >= 4) {
        const minLeft = Math.round((CACHE_TTL_MS - cacheAge) / 60_000);
        info(`Peers cache valid (${cached.peers.length} nodes, refresh in ${minLeft} min)`, undefined, 'peers');
        selfGeo = cached.selfGeo;
        peerPool = cached.peers;
        activePeers = cached.peers.slice(0, MAX_ACTIVE_PEERS);

        // Refresco en background sin bloquear el arranque de la app
        setTimeout(() => fullRefresh(cacheDir).catch(() => { }), 20_000);
    } else {
        await fullRefresh(cacheDir);
    }

    startHealthMonitor(cacheDir);
    return getActivePeerUris();
}

/** Detiene el health monitor (llamar en stopYggstack). */
export function stopPeerManager(): void {
    if (healthTimer) {
        clearInterval(healthTimer);
        healthTimer = null;
    }
}

// ── Descubrimiento completo ───────────────────────────────────────────────────

async function fullRefresh(cacheDir: string): Promise<void> {
    info('Full peer discovery started', undefined, 'peers');

    // 1. Geoposición propia (solo si no la tenemos ya)
    if (!selfGeo) {
        selfGeo = await fetchSelfGeo();
        if (selfGeo) {
            info(`Self geolocation: ${selfGeo.countryCode} (${selfGeo.lat.toFixed(2)}, ${selfGeo.lon.toFixed(2)})`, undefined, 'peers');
        } else {
            warn('Self geolocation unavailable — scoring without distance', undefined, 'peers');
        }
    }

    // 2. Obtener lista pública con metadatos (country + uptime%)
    let rawPeers = await fetchPeersWithMeta();
    info(`${rawPeers.length} online peers parsed`, undefined, 'peers');

    // Añadir fallbacks (sin duplicar)
    const existingUris = new Set(rawPeers.map(p => p.uri));
    for (const fb of FALLBACK_PEERS) {
        if (!existingUris.has(fb.uri)) {
            rawPeers.push(makePeerInfo(fb.uri, fb.country, 90));
        }
    }

    // 3. Geolocalizar (DNS + ip-api batch)
    if (selfGeo) {
        await geolocatePeers(rawPeers);
    }

    // 4. Medir latencia en lotes paralelos
    await probePeersLatency(rawPeers);

    // 5. Puntuar, filtrar vivos y ordenar por score
    for (const p of rawPeers) p.score = computeScore(p, selfGeo);
    peerPool = rawPeers
        .filter(p => p.alive)
        .sort((a, b) => b.score - a.score);

    logTopPeers(peerPool);

    activePeers = peerPool.slice(0, MAX_ACTIVE_PEERS);
    saveCache(cacheDir, { selfGeo, peers: peerPool, lastFullRefresh: Date.now() });
    peersChangedCb?.(getActivePeerUris());
    info('Full peer discovery completed', undefined, 'peers');
}

function logTopPeers(pool: PeerInfo[]): void {
    const n = Math.min(pool.length, 6);
    if (n === 0) {
        warn('No reachable peers!', undefined, 'peers');
        return;
    }
    info(`Active pool: ${pool.length} reachable peers — top ${n}:`, undefined, 'peers');
    for (const p of pool.slice(0, n)) {
        const dist = p.distanceKm != null ? `${Math.round(p.distanceKm)} km` : '? km';
        const lat = p.latencyMs != null ? `${p.latencyMs} ms` : '? ms';
        info(
            `score=${p.score.toFixed(1).padStart(5)} ` +
            `latency=${lat.padStart(7)} dist=${dist.padStart(8)} ` +
            `uptime=${p.uptimePct}% [${p.country}] ${p.uri}`,
            undefined, 'peers'
        );
    }
}

// ── Health monitor ────────────────────────────────────────────────────────────

function startHealthMonitor(cacheDir: string): void {
    if (healthTimer) clearInterval(healthTimer);
    healthTimer = setInterval(
        () => healthCheck(cacheDir).catch(() => { }),
        HEALTH_CHECK_INTERVAL_MS
    );
}

async function healthCheck(cacheDir: string): Promise<void> {
    if (activePeers.length === 0) return;

    // Sondar todos los peers activos en paralelo
    const results = await Promise.all(
        activePeers.map(async (peer) => {
            const r = await probePeerLatency(peer.uri);
            return { peer, ...r };
        })
    );

    let changed = false;
    const activeSet = new Set(activePeers.map(p => p.uri));

    for (const { peer, alive, latencyMs } of results) {
        const wasAlive = peer.alive;
        peer.alive = alive;
        peer.latencyMs = alive ? latencyMs : peer.latencyMs;
        peer.lastChecked = Date.now();
        peer.score = computeScore(peer, selfGeo);

        if (wasAlive && !alive) {
            warn(`Peer down: ${peer.uri}`, undefined, 'peers');

            // Buscar sustituto en el pool que no esté ya activo
            const replacement = peerPool.find(p => p.alive && !activeSet.has(p.uri));
            if (replacement) {
                activePeers[activePeers.indexOf(peer)] = replacement;
                activeSet.delete(peer.uri);
                activeSet.add(replacement.uri);
                info(`Replaced by: ${replacement.uri} (score=${replacement.score.toFixed(1)})`, undefined, 'peers');
                changed = true;
            } else {
                warn('Peer pool exhausted — triggering background rediscovery', undefined, 'peers');
                setTimeout(() => fullRefresh(cacheDir).catch(() => { }), 2_000);
                return;
            }
        }
    }

    if (changed) {
        saveCache(cacheDir, { selfGeo, peers: peerPool, lastFullRefresh: Date.now() });
        peersChangedCb?.(getActivePeerUris());
    }
}

// ── Fetch y parsing de la lista pública ──────────────────────────────────────

async function fetchPeersWithMeta(): Promise<PeerInfo[]> {
    const content = await httpGet(PUBLIC_PEERS_URL, FETCH_TIMEOUT_MS);
    if (!content) return [];

    const peers: PeerInfo[] = [];

    // ── Extraer encabezados de país ───────────────────────────────────────
    // La página puede renderizar como HTML (<h2>Country</h2>) o markdown (## Country).
    // Guardamos posición en el texto para asignar país a cada peer posterior.
    const headingRe = /(?:<h[23][^>]*>([^<]+)<\/h[23]>|^#{1,3}\s+(.+)$)/gim;
    const headings: Array<{ pos: number; name: string }> = [];
    let hm: RegExpExecArray | null;
    while ((hm = headingRe.exec(content)) !== null) {
        const raw = (hm[1] ?? hm[2] ?? '').trim().replace(/\s+/g, ' ');
        // Filtrar metaencabezados como "public peers (v0.5)"
        if (raw && !/peer|v\d|\bapi\b/i.test(raw) && raw.length < 60) {
            headings.push({ pos: hm.index, name: raw });
        }
    }

    // ── Extraer filas de peers ────────────────────────────────────────────
    // Soporta markdown pipe: | tcp://... | online 1 week+ | 100% |
    // y href HTML:           <a href="tcp://...">tcp://...</a> ... online ... 100%
    const seen = new Set<string>();

    // Formato markdown (formato primario conocido)
    const mdRe = /\|\s*((?:tcp|tls):\/\/[^\s|]+)\s*\|\s*online[^|]*\|\s*(\d+)%/gi;
    let pm: RegExpExecArray | null;
    while ((pm = mdRe.exec(content)) !== null) {
        const uri = pm[1].trim();
        const uptimePct = parseInt(pm[2], 10);
        tryAddPeer(uri, uptimePct, pm.index, peers, headings, seen);
    }

    // Formato HTML (fallback por si el sitio cambia)
    if (peers.length === 0) {
        const htmlRe = /href=["']((?:tcp|tls):\/\/[^"'<\s]+)["'][^>]*>[\s\S]{1,300}?online[\s\S]{1,150}?(\d+)%/gi;
        let hpr: RegExpExecArray | null;
        while ((hpr = htmlRe.exec(content)) !== null) {
            const uri = hpr[1].trim();
            const uptimePct = parseInt(hpr[2], 10);
            tryAddPeer(uri, uptimePct, hpr.index, peers, headings, seen);
        }
    }

    const countries = new Set(peers.map(p => p.country)).size;
    info(`Parsed ${peers.length} peers from ${countries} countries`, undefined, 'peers');
    return peers;
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

    // País = último encabezado antes de esta posición en el texto
    let country = 'Unknown';
    for (const h of headings) {
        if (h.pos <= pos) country = h.name;
        else break;
    }

    seen.add(uri);
    peers.push(makePeerInfo(uri, country, uptimePct));
}

function makePeerInfo(uri: string, country: string, uptimePct: number): PeerInfo {
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

// ── Geolocalización ───────────────────────────────────────────────────────────

async function fetchSelfGeo(): Promise<GeoCoords | null> {
    const data = await httpGet(GEO_SELF_URL, GEO_TIMEOUT_MS);
    if (!data) return null;
    try {
        const j = JSON.parse(data) as { lat?: number; lon?: number; countryCode?: string };
        if (typeof j.lat === 'number' && typeof j.lon === 'number') {
            return { lat: j.lat, lon: j.lon, countryCode: j.countryCode ?? '' };
        }
    } catch { /* ignore */ }
    return null;
}

async function geolocatePeers(peers: PeerInfo[]): Promise<void> {
    if (!selfGeo) return;

    // 1. Resolver nombres de host a IPv4 (en paralelo)
    const hostToIp = new Map<string, string>();
    const hostsToResolve = [
        ...new Set(peers.map(p => p.host).filter(h => !isIPv4(h) && !isIPv6(h)))
    ];

    await Promise.allSettled(
        hostsToResolve.map(async (host) => {
            try {
                const addr = await dns.promises.lookup(host, { family: 4 });
                hostToIp.set(host, addr.address);
            } catch {
                // ip-api puede resolver hostnames directamente
                hostToIp.set(host, host);
            }
        })
    );

    // 2. Mapear peer → IP
    const peerToIp = new Map<string, string>();
    const uniqueIps: string[] = [];
    for (const peer of peers) {
        if (isIPv6(peer.host)) continue; // ip-api gratuito no acepta IPv6 en batch
        const ip = isIPv4(peer.host) ? peer.host : (hostToIp.get(peer.host) ?? peer.host);
        peerToIp.set(peer.uri, ip);
        if (!uniqueIps.includes(ip)) uniqueIps.push(ip);
    }

    // 3. Batch geolocate (ip-api.com: 100 IPs por petición, 45 req/min gratis)
    const geoByIp = new Map<string, { lat: number; lon: number }>();
    for (let i = 0; i < uniqueIps.length; i += 100) {
        const batch = uniqueIps.slice(i, i + 100);
        const body = JSON.stringify(batch.map(q => ({ query: q, fields: 'lat,lon,query' })));
        const resp = await httpPost(GEO_BATCH_URL, body, GEO_TIMEOUT_MS);
        if (!resp) continue;
        try {
            const arr = JSON.parse(resp) as Array<{ query: string; lat?: number; lon?: number }>;
            for (const e of arr) {
                if (typeof e.lat === 'number' && typeof e.lon === 'number') {
                    geoByIp.set(e.query, { lat: e.lat, lon: e.lon });
                }
            }
        } catch { /* ignore */ }
    }

    // 4. Asignar distancia + coordenadas a cada peer
    let geolocated = 0;
    for (const peer of peers) {
        const ip = peerToIp.get(peer.uri);
        if (!ip) continue;
        const geo = geoByIp.get(ip);
        if (geo) {
            peer.lat = geo.lat;
            peer.lon = geo.lon;
            if (selfGeo) {
                peer.distanceKm = haversineKm(selfGeo.lat, selfGeo.lon, geo.lat, geo.lon);
            }
            geolocated++;
        }
    }

    info(`Geolocation: ${geolocated}/${peers.length} peers with distance`, undefined, 'peers');
}

// ── Sondeo de latencia ────────────────────────────────────────────────────────

async function probePeersLatency(peers: PeerInfo[]): Promise<void> {
    for (let i = 0; i < peers.length; i += PROBE_BATCH_SIZE) {
        const batch = peers.slice(i, i + PROBE_BATCH_SIZE);
        await Promise.all(batch.map(async (peer) => {
            const { alive, latencyMs } = await probePeerLatency(peer.uri);
            peer.alive = alive;
            peer.latencyMs = alive ? latencyMs : null;
            peer.lastChecked = Date.now();
        }));
    }
    const alive = peers.filter(p => p.alive).length;
    info(`Latency: ${alive}/${peers.length} peers reachable`, undefined, 'peers');
}

async function probePeerLatency(uri: string): Promise<{ alive: boolean; latencyMs: number }> {
    const m = /^(?:tcp|tls):\/\/(\[([^\]]+)\]|([^/:?]+)):(\d+)/.exec(uri);
    if (!m) return { alive: false, latencyMs: 0 };
    const host = m[2] ?? m[3] ?? '';
    const port = parseInt(m[4] ?? '0', 10);
    const t0 = Date.now();

    return new Promise(resolve => {
        const sock = new net.Socket();
        let settled = false;
        const done = (alive: boolean) => {
            if (settled) return;
            settled = true;
            sock.destroy();
            resolve({ alive, latencyMs: Date.now() - t0 });
        };
        sock.setTimeout(PROBE_TIMEOUT_MS);
        sock.once('connect', () => done(true));
        sock.once('error', () => done(false));
        sock.once('timeout', () => done(false));
        sock.connect(port, host);
    });
}

// ── Scoring ───────────────────────────────────────────────────────────────────

/**
 * Puntuación compuesta 0-100:
 *   40 pts → proximidad geográfica
 *   40 pts → latencia TCP
 *   20 pts → uptime histórico
 * Valor neutro (20) si el dato es desconocido.
 */
function computeScore(peer: PeerInfo, geo: GeoCoords | null): number {
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

// ── Caché en disco ────────────────────────────────────────────────────────────

function getCachePath(dir: string): string {
    return path.join(dir, 'peer-cache.json');
}

function loadCache(dir: string): PeerCache | null {
    const p = getCachePath(dir);
    if (!fs.existsSync(p)) return null;
    try {
        return JSON.parse(fs.readFileSync(p, 'utf8')) as PeerCache;
    } catch {
        return null;
    }
}

function saveCache(dir: string, cache: PeerCache): void {
    try {
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(getCachePath(dir), JSON.stringify(cache, null, 2), 'utf8');
    } catch (e) {
        warn('Failed to save peer cache', e, 'peers');
    }
}

// ── HTTP helpers ──────────────────────────────────────────────────────────────

function httpGet(url: string, timeoutMs: number): Promise<string | null> {
    return new Promise(resolve => {
        const req = https.get(url, { timeout: timeoutMs }, (res) => {
            let data = '';
            res.on('data', (c: Buffer) => { data += c.toString(); });
            res.on('end', () => resolve(data));
            res.on('error', () => resolve(null));
        });
        req.on('error', () => resolve(null));
        req.on('timeout', () => { req.destroy(); resolve(null); });
    });
}

function httpPost(url: string, body: string, timeoutMs: number): Promise<string | null> {
    return new Promise(resolve => {
        const u = new URL(url);
        const req = https.request({
            hostname: u.hostname,
            port: u.port || '443',
            path: u.pathname + u.search,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(body),
            },
            timeout: timeoutMs,
        }, (res) => {
            let data = '';
            res.on('data', (c: Buffer) => { data += c.toString(); });
            res.on('end', () => resolve(data));
            res.on('error', () => resolve(null));
        });
        req.on('error', () => resolve(null));
        req.on('timeout', () => { req.destroy(); resolve(null); });
        req.write(body);
        req.end();
    });
}

// ── Fórmula de Haversine ──────────────────────────────────────────────────────

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6_371; // radio terrestre en km
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
        Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.asin(Math.sqrt(a));
}

function toRad(deg: number): number { return deg * (Math.PI / 180); }

// ── Helpers de URI ────────────────────────────────────────────────────────────

function extractHost(uri: string): string {
    // IPv6 entre corchetes: [2001::1] → "2001::1"
    // Hostname/IPv4: foo.bar.com → "foo.bar.com"
    const m = /^(?:tcp|tls):\/\/(?:\[([^\]]+)\]|([^/:?[\]]+))/.exec(uri);
    return m ? (m[1] ?? m[2] ?? '') : '';
}

function extractPort(uri: string): number {
    // Elimina esquema y host, luego captura :port
    const withoutPrefix = uri.replace(/^(?:tcp|tls):\/\/(?:\[[^\]]+\]|[^/:?[\]]+)/, '');
    const m = /^:(\d+)/.exec(withoutPrefix);
    return m ? parseInt(m[1], 10) : 0;
}

function isIPv4(s: string): boolean {
    return /^\d{1,3}(?:\.\d{1,3}){3}$/.test(s);
}

function isIPv6(s: string): boolean {
    return s.includes(':') && /^[0-9a-f:]+$/i.test(s);
}
