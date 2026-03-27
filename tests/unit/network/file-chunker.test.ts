import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { FileChunker } from '../../../src/main_process/network/file-transfer/chunker.js';
import type { FileTransfer } from '../../../src/main_process/network/file-transfer/types.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';

type ChunkerTestTransfer = Partial<FileTransfer> & Pick<FileTransfer, 'fileId' | 'fileSize' | 'direction' | 'totalChunks' | 'chunkSize'>;

describe('FileChunker - Unit Tests', () => {
    let chunker: FileChunker;
    let tempTestDir: string;

    beforeEach(async () => {
        chunker = new FileChunker(1024); // 1KB chunks para test
        tempTestDir = await fs.mkdtemp(path.join(os.tmpdir(), 'chunker-test-'));
    });

    afterEach(async () => {
        await fs.rm(tempTestDir, { recursive: true, force: true });
    });

    it('should create a temp file of correct size', async () => {
        const transfer: ChunkerTestTransfer = {
            fileId: 'test-file-id',
            fileSize: 5000,
            direction: 'receiving',
            totalChunks: 5,
            chunkSize: 1024,
        };

        await chunker.createTempFile(transfer as FileTransfer);

        expect(transfer.tempPath).toBeDefined();
        const stats = await fs.stat(transfer.tempPath);
        expect(stats.size).toBe(5000);
    });

    it('should write and verify chunks correctly', async () => {
        const transfer: ChunkerTestTransfer = {
            fileId: 'test-file-index',
            fileSize: 2048,
            direction: 'receiving',
            totalChunks: 2,
            chunkSize: 1024
        };

        await chunker.createTempFile(transfer as FileTransfer);

        const data1 = Buffer.alloc(1024, 'a');
        const hash1 = crypto.createHash('sha256').update(data1).digest('hex');

        const chunkData = {
            chunkIndex: 0,
            data: data1.toString('base64'),
            chunkHash: hash1
        };

        await chunker.writeChunk(transfer as FileTransfer, chunkData);

        // Verificar contenido directamente
        const fd = await fs.open(transfer.tempPath, 'r');
        const buffer = Buffer.alloc(1024);
        await fd.read(buffer, 0, 1024, 0);
        await fd.close();

        expect(buffer.toString()).toBe(data1.toString());
    });

    it('should throw error on hash mismatch', async () => {
        const transfer: ChunkerTestTransfer = {
            fileId: 'test-hash-fail',
            fileSize: 1024,
            direction: 'receiving',
            totalChunks: 1,
            chunkSize: 1024
        };
        await chunker.createTempFile(transfer as FileTransfer);

        const chunkData = {
            chunkIndex: 0,
            data: Buffer.from('correct data').toString('base64'),
            chunkHash: 'wrong-hash'
        };

        await expect(chunker.writeChunk(transfer as FileTransfer, chunkData)).rejects.toThrow('Chunk hash mismatch');
    });

    it('should throw error on invalid chunk index', async () => {
        const transfer: ChunkerTestTransfer = {
            fileId: 'test-index-fail',
            fileSize: 1024,
            direction: 'receiving',
            totalChunks: 1,
            chunkSize: 1024
        };
        await chunker.createTempFile(transfer as FileTransfer);

        const chunkData = {
            chunkIndex: 5, // Out of bounds
            data: Buffer.alloc(10).toString('base64'),
            chunkHash: crypto.createHash('sha256').update(Buffer.alloc(10)).digest('hex')
        };

        await expect(chunker.writeChunk(transfer as FileTransfer, chunkData)).rejects.toThrow('Invalid chunk index');
    });

    it('should correctly read chunks from a real file for sending', async () => {
        const testFilePath = path.join(tempTestDir, 'source.txt');
        const content = Buffer.alloc(2500, 'x'); // 2.5 KB
        await fs.writeFile(testFilePath, content);

        const transfer: ChunkerTestTransfer = {
            fileId: 'send-id',
            filePath: testFilePath,
            fileSize: 2500,
            direction: 'sending',
            totalChunks: 3,
            chunkSize: 1024
        };

        // Leer segundo chunk (index 1: 1024 a 2048)
        const chunk = await chunker.createChunkData(transfer as FileTransfer, 1);

        expect(chunk.chunkIndex).toBe(1);
        const decoded = Buffer.from(chunk.data, 'base64');
        expect(decoded.length).toBe(1024);
        expect(decoded.every(b => b === 'x'.charCodeAt(0))).toBe(true);

        // Leer último chunk (index 2: 2048 a 2500)
        const lastChunk = await chunker.createChunkData(transfer as FileTransfer, 2);
        expect(Buffer.from(lastChunk.data, 'base64').length).toBe(2500 - 2048);
    });
});
