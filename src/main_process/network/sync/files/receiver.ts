import fs from 'node:fs';
import path from 'node:path';
import type { BrowserWindow } from 'electron';
import { app } from 'electron';

import { warn } from '../../../security/secure-logger.js';
import { FILE_CHUNK_SIZE, FILE_MAX_BYTES, type SyncFileChunk, type SyncFileResponse } from './packets.js';
import { findStoredFile, notifyFileReceived, persistSavedPath } from './storage.js';

type OpenReceipt = {
    fileId: string;
    fileName: string;
    fileSize: number;
    chunkSize: number;
    totalChunks: number;
    received: Set<number>;
    savedPath: string;
    handle: fs.promises.FileHandle;
};

const receipts = new Map<string, OpenReceipt>();
const early = new Map<string, Map<number, Buffer>>();
const MAX_EARLY_CHUNKS = 256;

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
            chunkSize: response.chunkSize ?? FILE_CHUNK_SIZE,
            totalChunks: response.totalChunks,
            received: new Set<number>(),
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
    if (!receipt) {
        stashEarlyChunk(chunk);
        return null;
    }
    return writeIntoReceipt(receipt, chunk, win);
}

async function writeIntoReceipt(receipt: OpenReceipt, chunk: SyncFileChunk, win: BrowserWindow | null): Promise<string | null> {
    if (chunk.index >= receipt.totalChunks) {
        warn('Tramo de adjunto fuera del rango declarado', { requestId: chunk.requestId, index: chunk.index }, 'sync');
        await dropReceipt(chunk.requestId);
        return null;
    }
    const offset = chunk.index * receipt.chunkSize;
    const expected = Math.min(receipt.chunkSize, receipt.fileSize - offset);
    const buffer = Buffer.from(chunk.data, 'base64');
    if (buffer.length !== expected) {
        warn('Tramo de adjunto con longitud inesperada', { requestId: chunk.requestId, index: chunk.index, size: buffer.length }, 'sync');
        await dropReceipt(chunk.requestId);
        return null;
    }
    try {
        await receipt.handle.write(buffer, 0, buffer.length, offset);
    } catch (err) {
        warn('No se pudo escribir el tramo del adjunto sincronizado', err, 'sync');
        await dropReceipt(chunk.requestId);
        return null;
    }
    receipt.received.add(chunk.index);
    if (receipt.received.size < receipt.totalChunks) return null;
    const { fileId, savedPath, fileName, handle } = receipt;
    receipts.delete(chunk.requestId);
    early.delete(chunk.requestId);
    await handle.close();
    const messageId = persistSavedPathFor(fileId, savedPath);
    notifyFileReceived(win, messageId ?? fileId, fileId, savedPath);
    warn('Adjunto recibido por el enlace de sincronización', { fileId, fileName }, 'sync');
    return fileId;
}

function stashEarlyChunk(chunk: SyncFileChunk): void {
    const store = early.get(chunk.requestId) ?? new Map<number, Buffer>();
    if (store.size >= MAX_EARLY_CHUNKS) return;
    store.set(chunk.index, Buffer.from(chunk.data, 'base64'));
    early.set(chunk.requestId, store);
}

function takeEarlyChunks(requestId: string): Map<number, Buffer> {
    const store = early.get(requestId);
    if (!store) return new Map<number, Buffer>();
    early.delete(requestId);
    return store;
}

export async function flushEarlyChunks(requestId: string, win: BrowserWindow | null): Promise<string | null> {
    const store = takeEarlyChunks(requestId);
    if (store.size === 0) return null;
    const ordered = Array.from(store.entries()).sort((left, right) => left[0] - right[0]);
    for (const [index, data] of ordered) {
        const chunk: SyncFileChunk = { requestId, index, data: data.toString('base64') };
        const done = await writeSyncFileChunk(chunk, win);
        if (done) return done;
        if (!receipts.has(requestId)) return null;
    }
    return null;
}

export function fileReceiptProgress(requestId: string): number | null {
    const receipt = receipts.get(requestId);
    if (!receipt || receipt.totalChunks <= 0) return null;
    return Math.min(1, receipt.received.size / receipt.totalChunks);
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
