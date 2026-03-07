import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { FileChunker } from '../src/main_process/network/file-transfer/chunker.js';

describe('FileChunker (logic only)', () => {
    let chunker: FileChunker;
    const defaultChunkSize = 1024 * 64;

    beforeEach(() => {
        chunker = new FileChunker(defaultChunkSize);
    });

    describe('constructor', () => {
        it('should use default chunk size', () => {
            const defaultChunker = new FileChunker();
            assert.strictEqual(defaultChunker.getChunkSize(), defaultChunkSize);
        });

        it('should accept custom chunk size', () => {
            const customSize = 1024 * 32;
            const customChunker = new FileChunker(customSize);
            assert.strictEqual(customChunker.getChunkSize(), customSize);
        });
    });

    describe('calculateChunks', () => {
        it('should calculate correct number of chunks', () => {
            // 150KB file with 64KB chunks = 3 chunks (2.34 rounded up)
            const chunks = chunker.calculateChunks(150 * 1024);
            assert.strictEqual(chunks, 3);
        });

        it('should handle exact chunk boundaries', () => {
            // 128KB file with 64KB chunks = 2 chunks exactly
            const chunks = chunker.calculateChunks(128 * 1024);
            assert.strictEqual(chunks, 2);
        });

        it('should handle zero-sized file', () => {
            const chunks = chunker.calculateChunks(0);
            assert.strictEqual(chunks, 0);
        });

        it('should use custom chunk size parameter', () => {
            // 100KB file with 10KB chunks = 10 chunks
            const chunks = chunker.calculateChunks(100 * 1024, 10 * 1024);
            assert.strictEqual(chunks, 10);
        });
    });

    describe('validateChunkIndex', () => {
        it('should accept valid chunk indices', () => {
            assert.strictEqual(chunker.validateChunkIndex(0, 5), true);
            assert.strictEqual(chunker.validateChunkIndex(4, 5), true);
            assert.strictEqual(chunker.validateChunkIndex(2, 10), true);
        });

        it('should reject invalid chunk indices', () => {
            assert.strictEqual(chunker.validateChunkIndex(-1, 5), false);
            assert.strictEqual(chunker.validateChunkIndex(5, 5), false); // equal to totalChunks
            assert.strictEqual(chunker.validateChunkIndex(10, 5), false);
        });
    });

    describe('getChunkSize and setChunkSize', () => {
        it('should get current chunk size', () => {
            assert.strictEqual(chunker.getChunkSize(), defaultChunkSize);
        });

        it('should set new chunk size', () => {
            const newSize = 1024 * 32;
            chunker.setChunkSize(newSize);
            assert.strictEqual(chunker.getChunkSize(), newSize);
        });

        it('should reject non-positive chunk size', () => {
            assert.throws(() => {
                chunker.setChunkSize(0);
            }, /Chunk size must be positive/);

            assert.throws(() => {
                chunker.setChunkSize(-100);
            }, /Chunk size must be positive/);
        });

        it('should reject chunk size exceeding 1MB', () => {
            assert.throws(() => {
                chunker.setChunkSize(1024 * 1024 + 1); // 1MB + 1 byte
            }, /Chunk size cannot exceed 1MB/);

            // Should accept exactly 1MB
            chunker.setChunkSize(1024 * 1024);
            assert.strictEqual(chunker.getChunkSize(), 1024 * 1024);
        });
    });

    // Note: I/O methods (createTempFile, writeChunk, createChunkData, etc.)
    // are tested in integration tests. Unit testing them requires extensive mocking
    // which is less valuable than integration testing.
});