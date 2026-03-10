import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { FileTransfer } from './types.js';
import { FileChunkData } from '../types.js';
import { warn } from '../../security/secure-logger.js';

export class FileChunker {
    private chunkSize: number;

    constructor(chunkSize: number = 1024 * 64) {
        this.chunkSize = chunkSize;
    }

    async createTempFile(transfer: FileTransfer): Promise<void> {
        if (transfer.direction !== 'receiving') {
            throw new Error('Can only create temp files for receiving transfers');
        }

        const tempDir = await fs.mkdtemp(path.join(process.env.TMPDIR || '/tmp', 'upeer-'));
        transfer.tempPath = path.join(tempDir, transfer.fileId);

        // Initialize file with zeros
        const fd = await fs.open(transfer.tempPath, 'w');
        try {
            await fd.truncate(transfer.fileSize);
        } finally {
            await fd.close();
        }
    }

    async writeChunk(transfer: FileTransfer, chunkData: any): Promise<void> {
        if (!transfer.tempPath) {
            throw new Error('No temp path for receiving transfer');
        }

        // Validate chunk index
        if (chunkData.chunkIndex < 0 || chunkData.chunkIndex >= transfer.totalChunks) {
            throw new Error(`Invalid chunk index: ${chunkData.chunkIndex}`);
        }

        // Verify chunk hash
        const chunkBuffer = Buffer.from(chunkData.data, 'base64');
        const chunkHash = crypto.createHash('sha256').update(chunkBuffer).digest('hex');

        if (chunkHash !== chunkData.chunkHash) {
            throw new Error(`Chunk hash mismatch for index ${chunkData.chunkIndex}`);
        }

        // Write chunk to temporary file
        const fd = await fs.open(transfer.tempPath, 'r+');
        try {
            const offset = chunkData.chunkIndex * transfer.chunkSize;
            await fd.write(chunkBuffer, 0, chunkBuffer.length, offset);
        } finally {
            await fd.close();
        }
    }

    async createChunkData(transfer: FileTransfer, chunkIndex: number): Promise<FileChunkData> {
        if (!transfer.fileBuffer) {
            throw new Error('No file buffer for sending transfer');
        }

        const start = chunkIndex * transfer.chunkSize;
        const end = Math.min(start + transfer.chunkSize, transfer.fileBuffer.length);
        const chunkBuffer = transfer.fileBuffer.slice(start, end);

        // Calculate chunk hash
        const chunkHash = crypto.createHash('sha256').update(chunkBuffer).digest('hex');

        return {
            fileId: transfer.fileId,
            chunkIndex,
            totalChunks: transfer.totalChunks,
            data: chunkBuffer.toString('base64'),
            chunkHash
        };
    }

    async readCompleteFile(transfer: FileTransfer): Promise<Buffer> {
        if (!transfer.tempPath) {
            throw new Error('No temp path for reading file');
        }

        return await fs.readFile(transfer.tempPath);
    }

    async cleanupTempFile(transfer: FileTransfer): Promise<void> {
        if (transfer.tempPath) {
            try {
                await fs.unlink(transfer.tempPath);
                const tempDir = path.dirname(transfer.tempPath);
                await fs.rmdir(tempDir);
            } catch (error) {
                // Ignore cleanup errors, log silently
                warn('Error cleaning up temp file', error, 'file-transfer');
            }
        }
    }

    calculateChunks(fileSize: number, chunkSize?: number): number {
        const size = chunkSize || this.chunkSize;
        return Math.ceil(fileSize / size);
    }

    validateChunkIndex(chunkIndex: number, totalChunks: number): boolean {
        return chunkIndex >= 0 && chunkIndex < totalChunks;
    }

    getChunkSize(): number {
        return this.chunkSize;
    }

    setChunkSize(size: number): void {
        if (size <= 0) {
            throw new Error('Chunk size must be positive');
        }
        if (size > 1024 * 1024) { // 1MB max
            throw new Error('Chunk size cannot exceed 1MB');
        }
        this.chunkSize = size;
    }
}