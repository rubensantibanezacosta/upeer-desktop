import fs from 'node:fs';

import { debug, warn } from '../../../security/secure-logger.js';
import type { SyncPeerRecord } from '../../../storage/sync/peers.js';
import { sendEncryptedSync } from '../transport.js';
import { waitForSendCapacity } from './backpressure.js';
import { chunkBounds, chunkCount } from './chunks.js';
import { FILE_CHUNK, FILE_CHUNK_SIZE, FILE_MAX_BYTES, FILE_RES, type SyncFileRequest } from './packets.js';
import { findStoredFile } from './storage.js';

const inFlight = new Set<string>();
const active = new Map<string, number>();
const waiting = new Map<string, Array<() => void>>();
const MAX_PARALLEL = 3;

export async function serveSyncFile(peer: SyncPeerRecord, request: SyncFileRequest): Promise<boolean> {
    if (inFlight.has(request.requestId)) {
        debug('Petición de adjunto ya en curso; se ignora el duplicado', { requestId: request.requestId }, 'sync');
        return true;
    }
    inFlight.add(request.requestId);
    const key = peer.deviceId;
    await acquire(key);
    try {
        return await serveOnce(peer, request);
    } finally {
        inFlight.delete(request.requestId);
        release(key);
    }
}

function acquire(key: string): Promise<void> {
    if ((active.get(key) ?? 0) < MAX_PARALLEL) {
        active.set(key, (active.get(key) ?? 0) + 1);
        return Promise.resolve();
    }
    return new Promise((resolve) => {
        const queue = waiting.get(key) ?? [];
        queue.push(() => {
            active.set(key, (active.get(key) ?? 0) + 1);
            resolve();
        });
        waiting.set(key, queue);
    });
}

function release(key: string): void {
    active.set(key, Math.max(0, (active.get(key) ?? 1) - 1));
    const queue = waiting.get(key);
    if (!queue || queue.length === 0) return;
    const next = queue.shift();
    if (!next) return;
    if (queue.length === 0) waiting.delete(key);
    next();
}

async function serveOnce(peer: SyncPeerRecord, request: SyncFileRequest): Promise<boolean> {
    const address = peer.address;
    if (!address) return false;
    const entry = findStoredFile(request.fileId);
    if (!entry) {
        return refuse(peer, request, 'not-here');
    }
    let size = 0;
    try {
        const stats = await fs.promises.stat(entry.savedPath);
        if (!stats.isFile()) return refuse(peer, request, 'not-here');
        size = stats.size;
    } catch {
        return refuse(peer, request, 'not-here');
    }
    if (size <= 0 || size > FILE_MAX_BYTES) return refuse(peer, request, 'too-large');

    const total = chunkCount(size, FILE_CHUNK_SIZE);
    if (!(await waitForSendCapacity(address))) {
        warn('Cola de envío saturada antes de servir el adjunto', { fileId: request.fileId }, 'sync');
        return false;
    }
    const accepted = await sendEncryptedSync(peer, FILE_RES, {
        requestId: request.requestId,
        fileId: request.fileId,
        ok: true,
        fileName: entry.fileName,
        fileSize: size,
        chunkSize: FILE_CHUNK_SIZE,
        totalChunks: total,
    });
    if (!accepted) return false;

    let handle: fs.promises.FileHandle | null = null;
    try {
        handle = await fs.promises.open(entry.savedPath, 'r');
        for (let index = 0; index < total; index += 1) {
            const bounds = chunkBounds(index, FILE_CHUNK_SIZE, size);
            if (!bounds) break;
            if (!(await waitForSendCapacity(address))) {
                warn('Cola de envío saturada sirviendo un adjunto', { fileId: request.fileId, index }, 'sync');
                return false;
            }
            const buffer = Buffer.alloc(bounds.length);
            await handle.read(buffer, 0, bounds.length, bounds.start);
            const sent = await sendEncryptedSync(peer, FILE_CHUNK, {
                requestId: request.requestId,
                index,
                data: buffer.toString('base64'),
            });
            if (!sent) {
                warn('Enlace de sincronización cortado sirviendo un adjunto', { fileId: request.fileId, index }, 'sync');
                return false;
            }
        }
        debug('Adjunto servido por el enlace de sincronización', { fileId: request.fileId, total }, 'sync');
        return true;
    } catch (err) {
        warn('No se pudo servir el adjunto por sincronización', err, 'sync');
        return false;
    } finally {
        await handle?.close();
    }
}

async function refuse(peer: SyncPeerRecord, request: SyncFileRequest, reason: string): Promise<boolean> {
    return sendEncryptedSync(peer, FILE_RES, { requestId: request.requestId, fileId: request.fileId, ok: false, reason });
}
