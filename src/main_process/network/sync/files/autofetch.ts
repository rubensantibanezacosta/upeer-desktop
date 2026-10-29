import fs from 'node:fs';

import { getMyUPeerId } from '../../../security/identity.js';
import { debug } from '../../../security/secure-logger.js';
import { getFileHistory } from '../../../storage/messages/operations.js';
import { listSyncPeers } from '../../../storage/sync/peers.js';
import { completeSyncFileRequest, fileIsLocal, isSyncFilePending, pendingFileRequestId, requestSyncFile } from './request.js';
import { fileReceiptProgress } from './receiver.js';

const MAX_FILES = 400;

export type SyncFileWork = {
    total: number;
    done: number;
    pending: number;
    failed: number;
    progressUnits?: number;
};

const EMPTY: SyncFileWork = { total: 0, done: 0, pending: 0, failed: 0 };

let work: SyncFileWork = { ...EMPTY };
let running = false;
let baseline: Set<string> | null = null;
const tracked = new Set<string>();
const completed = new Set<string>();

export function getSyncFileWork(): SyncFileWork {
    return work;
}

export function resetSyncFileWork(): void {
    work = { ...EMPTY };
    baseline = null;
    tracked.clear();
    completed.clear();
}

export async function sweepMissingFiles(): Promise<SyncFileWork> {
    if (running) return work;
    const peers = listSyncPeers(getMyUPeerId()).filter((peer) => Boolean(peer.address));
    if (peers.length === 0) return work;
    running = true;
    try {
        const seen = new Map<string, { fileId: string; savedPath?: string }>();
        for (const entry of getFileHistory(MAX_FILES)) {
            if (!seen.has(entry.fileId)) seen.set(entry.fileId, entry);
        }
        if (baseline === null) {
            baseline = new Set([...seen.values()].filter(stored).map((entry) => entry.fileId));
        }
        reviveMissing(seen);
        let pending = 0;
        let failed = 0;
        for (const entry of seen.values()) {
            if (baseline.has(entry.fileId) || completed.has(entry.fileId)) continue;
            tracked.add(entry.fileId);
            if (stored(entry)) {
                completed.add(entry.fileId);
                completeSyncFileRequest(entry.fileId);
                continue;
            }
            const result = await requestSyncFile(entry.fileId, null);
            if (result.local) {
                completed.add(entry.fileId);
            } else if (result.requested > 0 || isSyncFilePending(entry.fileId)) {
                pending += 1;
            } else {
                failed += 1;
            }
        }
        for (const fileId of tracked) {
            if (completed.has(fileId) || seen.has(fileId)) continue;
            if (fileIsLocal(fileId)) completed.add(fileId);
        }
        const done = [...tracked].filter((fileId) => completed.has(fileId)).length;
        work = { total: tracked.size, done, pending, failed, progressUnits: progressUnits() };
        if (work.total > 0) debug('Adjuntos de otros dispositivos', { ...work }, 'sync');
        return work;
    } finally {
        running = false;
    }
}

function reviveMissing(seen: Map<string, { fileId: string; savedPath?: string }>): void {
    const candidates = new Set<string>(completed);
    for (const fileId of baseline ?? []) candidates.add(fileId);
    for (const fileId of candidates) {
        const entry = seen.get(fileId);
        if (!entry || stored(entry)) continue;
        completed.delete(fileId);
        baseline?.delete(fileId);
        debug('El adjunto ya no está en el dispositivo: se vuelve a pedir', { fileId }, 'sync');
    }
}

function stored(entry: { fileId: string; savedPath?: string }): boolean {
    if (fileIsLocal(entry.fileId)) return true;
    if (!entry.savedPath) return false;
    try {
        return fs.existsSync(entry.savedPath);
    } catch {
        return false;
    }
}

export function refreshSyncFileProgress(): SyncFileWork {
    if (tracked.size === 0) return work;
    const done = [...tracked].filter((fileId) => completed.has(fileId)).length;
    work = { ...work, done, progressUnits: progressUnits() };
    return work;
}

function progressUnits(): number {
    let units = 0;
    for (const fileId of tracked) {
        if (completed.has(fileId)) {
            units += 1;
            continue;
        }
        const requestId = pendingFileRequestId(fileId);
        units += requestId ? (fileReceiptProgress(requestId) ?? 0) : 0;
    }
    return units;
}
