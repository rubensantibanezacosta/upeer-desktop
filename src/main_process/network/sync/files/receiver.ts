import fs from 'node:fs';
import path from 'node:path';
import type { BrowserWindow } from 'electron';
import { app } from 'electron';

import { warn } from '../../../security/secure-logger.js';
import { FILE_MAX_BYTES, type SyncFileChunk, type SyncFileResponse } from './packets.js';
import { findStoredFile, notifyFileReceived, persistSavedPath } from './storage.js';

type OpenReceipt = {
    fileId: string;
    fileName: string;
    fileSize: number;
    totalChunks: number;
    nextIndex: number;
    savedPath: string;
    handle: fs.promises.FileHandle;
};

const receipts = new Map<string, OpenReceipt>();

export function receivedFilePath(fileId: string, fileName: string): string {
    const extension = path.extname(fileName).slice(0, 12);
    return path.join(receivedDir(), `${fileId}${extension}`);
}

function receivedDir(): string {
    return path.join(app.getPath('userData'), 'assets', 'received');
}

export async function openSyncFileReceipt(response: SyncFileResponse): Promise<boolean> {
    if (!response.ok) return false;
    if (response.fileSize === undefined || response.totalChunks === undefined) return false;
    if (response.fileSize > FILE_MAX_BYTES) return false;
    await dropReceipt(response.requestId);
    const fileName = response.fileName ?? `${response.fileId}.bin`;
    const savedPath = receivedFilePath(response.fileId, fileName);
    try {
        await fs.promises.mkdir(path.dirname(savedPath), { recursive: true });
        const handle = await fs.promises.open(savedPath, 'w');
        receipts.set(response.requestId, {
            fileId: response.fileId,
            fileName,
            fileSize: response.fileSize,
            totalChunks: response.totalChunks,
            nextIndex: 0,
            savedPath,
            handle,
        });
        return true;
    } catch (err) {
        warn('No se pudo preparar el adjunto recibido por sincronización', err, 'sync');
        return false;
    }
}

export async function writeSyncFileChunk(
    chunk: SyncFileChunk,
    win: BrowserWindow | null,
): Promise<string | null> {
    const receipt = receipts.get(chunk.requestId);
    if (!receipt) return null;
    if (chunk.index !== receipt.nextIndex) {
        warn('Tramo de adjunto fuera de orden; se descarta la recepción', { requestId: chunk.requestId, index: chunk.index }, 'sync');
        await dropReceipt(chunk.requestId);
        return null;
    }
    const buffer = Buffer.from(chunk.data, 'hex');
    try {
        await receipt.handle.write(buffer, 0, buffer.length);
    } catch (err) {
        warn('No se pudo escribir el tramo del adjunto sincronizado', err, 'sync');
        await dropReceipt(chunk.requestId);
        return null;
    }
    receipt.nextIndex += 1;
    if (receipt.nextIndex < receipt.totalChunks) return null;
    const { fileId, savedPath, fileName, handle } = receipt;
    receipts.delete(chunk.requestId);
    await handle.close();
    const messageId = persistSavedPathFor(fileId, savedPath);
    notifyFileReceived(win, messageId ?? fileId, fileId, savedPath);
    warn('Adjunto recibido por el enlace de sincronización', { fileId, fileName }, 'sync');
    return fileId;
}

export async function dropReceipt(requestId: string): Promise<void> {
    const receipt = receipts.get(requestId);
    if (!receipt) return;
    receipts.delete(requestId);
    await receipt.handle.close();
    await fs.promises.rm(receipt.savedPath, { force: true });
}

function persistSavedPathFor(fileId: string, savedPath: string): string | null {
    const entry = findStoredFile(fileId);
    if (!entry) return null;
    return persistSavedPath(entry.messageId, savedPath) ? entry.messageId : null;
}
