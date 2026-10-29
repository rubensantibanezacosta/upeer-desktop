import fs from 'node:fs';

import { debug, warn } from '../../../security/secure-logger.js';
import type { SyncPeerRecord } from '../../../storage/sync/peers.js';
import { sendEncryptedSync } from '../transport.js';
import { chunkBounds, chunkCount } from './chunks.js';
import { FILE_CHUNK, FILE_CHUNK_SIZE, FILE_MAX_BYTES, FILE_RES, type SyncFileRequest } from './packets.js';
import { findStoredFile } from './storage.js';

export async function serveSyncFile(peer: SyncPeerRecord, request: SyncFileRequest): Promise<boolean> {
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
            const buffer = Buffer.alloc(bounds.length);
            await handle.read(buffer, 0, bounds.length, bounds.start);
            const sent = await sendEncryptedSync(peer, FILE_CHUNK, {
                requestId: request.requestId,
                index,
                data: buffer.toString('hex'),
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
