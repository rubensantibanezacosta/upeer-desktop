import crypto from 'node:crypto';
import { encryptChunk } from './crypto.js';
import { FileTransfer } from './types.js';

export const CHUNK_PREPARE_CONCURRENCY = 4;

export async function readChunkFully(handle: any, length: number, position: number): Promise<Buffer> {
    const buffer = Buffer.alloc(length);
    let offset = 0;

    while (offset < length) {
        const { bytesRead } = await handle.read(buffer, offset, length - offset, position + offset);
        if (bytesRead <= 0) break;
        offset += bytesRead;
    }

    if (offset <= 0) {
        throw new Error('Invalid chunk range or end of file reached');
    }

    return offset < length ? buffer.slice(0, offset) : buffer;
}

export async function calculateHashFromChunks(handle: any, fileSize: number, chunkSize: number): Promise<string> {
    const { createHash } = await import('node:crypto');
    const hash = createHash('sha256');
    let position = 0;

    while (position < fileSize) {
        const length = Math.min(chunkSize, fileSize - position);
        const buffer = await readChunkFully(handle, length, position);
        hash.update(buffer);
        position += buffer.length;
    }

    return hash.digest('hex');
}

export async function prepareChunkPayload(handle: any, transfer: FileTransfer, chunkIndex: number, aesKey?: Buffer) {
    const chunkSize = transfer.chunkSize || 16384;
    const offset = chunkIndex * chunkSize;
    const finalBuffer = await readChunkFully(handle, chunkSize, offset);

    const chunkMsg: any = {
        type: 'FILE_CHUNK',
        fileId: transfer.fileId,
        chunkIndex,
        chunkHash: crypto.createHash('sha256').update(finalBuffer).digest('hex')
    };

    if (aesKey) {
        const enc = encryptChunk(finalBuffer, aesKey);
        chunkMsg.data = enc.data;
        chunkMsg.iv = enc.iv;
        chunkMsg.tag = enc.tag;
    } else {
        chunkMsg.data = finalBuffer.toString('base64');
    }

    return {
        chunkIndex,
        chunkLength: finalBuffer.length,
        chunkMsg
    };
}