import crypto from 'node:crypto';
import fs from 'node:fs';
import type { BrowserWindow } from 'electron';

import { debug, warn } from '../../../security/secure-logger.js';
import { getMyUPeerId } from '../../../security/identity.js';
import { listSyncPeers, type SyncPeerRecord } from '../../../storage/sync/peers.js';
import { resetPeerConnection } from '../../server/transport.js';
import { sendEncryptedSync } from '../transport.js';
import { FILE_REQ } from './packets.js';
import { findStoredFile } from './storage.js';

const REQUEST_TTL_MS = 180_000;
const RETRY_MS = 15_000;

type PendingFileRequest = {
    requestId: string;
    peers: SyncPeerRecord[];
    startedAt: number;
    attempts: number;
    timer?: ReturnType<typeof setTimeout>;
};

const pending = new Map<string, PendingFileRequest>();

export type SyncFileRequestResult = { requested: number; local: boolean };

export function fileIsLocal(fileId: string): boolean {
    const entry = findStoredFile(fileId);
    if (!entry) return false;
    try {
        return fs.existsSync(entry.savedPath);
    } catch {
        return false;
    }
}

export async function requestSyncFile(fileId: string, win: BrowserWindow | null): Promise<SyncFileRequestResult> {
    if (!fileId) return { requested: 0, local: false };
    if (fileIsLocal(fileId)) return { requested: 0, local: true };
    sweep();
    if (pending.has(fileId)) return { requested: 0, local: false };
    const peers = listSyncPeers(getMyUPeerId()).filter((peer) => Boolean(peer.address));
    if (peers.length === 0) {
        notifyUnavailable(win, fileId, 'no-devices');
        return { requested: 0, local: false };
    }
    const entry: PendingFileRequest = {
        requestId: crypto.randomUUID().replace(/-/g, ''),
        peers,
        startedAt: Date.now(),
        attempts: 0,
    };
    pending.set(fileId, entry);
    const requested = await dispatch(entry, fileId, false);
    debug(
        'Pedido de adjunto enviado a los dispositivos propios',
        { fileId, requested, devices: peers.map((peer) => `${peer.deviceId.slice(0, 8)}@${peer.address}`) },
        'sync',
    );
    if (requested === 0) {
        pending.delete(fileId);
        notifyUnavailable(win, fileId, 'no-devices');
        return { requested: 0, local: false };
    }
    scheduleRetry(entry, fileId, win);
    return { requested, local: false };
}

async function dispatch(entry: PendingFileRequest, fileId: string, fresh: boolean): Promise<number> {
    let sent = 0;
    for (const peer of entry.peers) {
        if (fresh && entry.attempts === 1 && peer.address) resetPeerConnection(peer.address);
        if (await sendEncryptedSync(peer, FILE_REQ, { requestId: entry.requestId, fileId })) sent += 1;
    }
    entry.attempts += 1;
    return sent;
}

function scheduleRetry(entry: PendingFileRequest, fileId: string, win: BrowserWindow | null): void {
    clearRetry(entry);
    entry.timer = setTimeout(() => {
        entry.timer = undefined;
        if (pending.get(fileId) !== entry) return;
        if (Date.now() - entry.startedAt > REQUEST_TTL_MS) {
            pending.delete(fileId);
            notifyUnavailable(win, fileId, 'timeout');
            return;
        }
        void dispatch(entry, fileId, true).then(() => {
            if (pending.get(fileId) !== entry) return;
            debug('Reintento del pedido de adjunto propio', { fileId, attempts: entry.attempts }, 'sync');
            scheduleRetry(entry, fileId, win);
        });
    }, RETRY_MS);
}

function clearRetry(entry: PendingFileRequest): void {
    if (!entry.timer) return;
    clearTimeout(entry.timer);
    entry.timer = undefined;
}

export function isSyncFilePending(fileId: string): boolean {
    return pending.has(fileId);
}

export function pendingFileRequestId(fileId: string): string | null {
    return pending.get(fileId)?.requestId ?? null;
}

export function completeSyncFileRequest(fileId: string): void {
    const entry = pending.get(fileId);
    if (!entry) return;
    clearRetry(entry);
    pending.delete(fileId);
    debug('Adjunto propio recibido por sincronización', { fileId }, 'sync');
}

export function discardSyncFileRequest(fileId: string): void {
    const entry = pending.get(fileId);
    if (!entry) return;
    clearRetry(entry);
    pending.delete(fileId);
}

export function forgetSyncFileRequests(): void {
    for (const entry of pending.values()) clearRetry(entry);
    pending.clear();
}

function sweep(): void {
    const now = Date.now();
    for (const [fileId, entry] of pending) {
        if (now - entry.startedAt > REQUEST_TTL_MS) {
            clearRetry(entry);
            pending.delete(fileId);
        }
    }
}

export function notifyUnavailable(win: BrowserWindow | null, fileId: string, reason: string): void {
    if (!win || win.isDestroyed() || win.webContents.isDestroyed()) return;
    win.webContents.send('sync-file-unavailable', { fileId, reason });
}

export function logUnavailableRequest(fileId: string): void {
    warn('Ningún dispositivo propio tiene el adjunto', { fileId }, 'sync');
}
