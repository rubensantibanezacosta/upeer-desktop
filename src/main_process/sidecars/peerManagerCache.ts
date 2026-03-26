import fs from 'node:fs';
import path from 'node:path';
import { warn } from '../security/secure-logger.js';
import type { PeerCache } from './peerManagerShared.js';

function getCachePath(dir: string): string {
    return path.join(dir, 'peer-cache.json');
}

export function loadCache(dir: string): PeerCache | null {
    const cachePath = getCachePath(dir);
    if (!fs.existsSync(cachePath)) return null;

    try {
        return JSON.parse(fs.readFileSync(cachePath, 'utf8')) as PeerCache;
    } catch (err) {
        warn('Failed to load peer cache', { err: String(err), path: cachePath }, 'peers');
        return null;
    }
}

export function saveCache(dir: string, cache: PeerCache): void {
    try {
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(getCachePath(dir), JSON.stringify(cache, null, 2), 'utf8');
    } catch (err) {
        warn('Failed to save peer cache', err, 'peers');
    }
}
