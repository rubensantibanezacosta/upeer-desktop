import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { TransferValidator } from '../src/main_process/network/file-transfer/validator.js';

// Valid SHA-256 hash (64 hex chars)
const VALID_HASH = '0'.repeat(64); // 64 zeros

describe('TransferValidator', () => {
    let validator: TransferValidator;

    beforeEach(() => {
        validator = new TransferValidator(100 * 1024 * 1024); // 100MB max
    });

    describe('validateIncomingFile', () => {
        it('should accept valid file data', () => {
            const validData = {
                fileId: 'file-123',
                fileName: 'test.txt',
                fileSize: 1024,
                mimeType: 'text/plain',
                totalChunks: 10,
                chunkSize: 1024,
                fileHash: VALID_HASH
            };

            assert.doesNotThrow(() => {
                validator.validateIncomingFile(validData);
            });
        });

        it('should reject missing required fields', () => {
            const invalidData = {
                // Missing fileId
                fileName: 'test.txt',
                fileSize: 1024,
                mimeType: 'text/plain',
                totalChunks: 10,
                chunkSize: 1024,
                fileHash: VALID_HASH
            };

            assert.throws(() => {
                validator.validateIncomingFile(invalidData);
            }, /Missing required field/);
        });

        it('should reject invalid fileSize', () => {
            const invalidData = {
                fileId: 'file-123',
                fileName: 'test.txt',
                fileSize: -1, // Invalid
                mimeType: 'text/plain',
                totalChunks: 10,
                chunkSize: 1024,
                fileHash: VALID_HASH
            };

            assert.throws(() => {
                validator.validateIncomingFile(invalidData);
            }, /Invalid fileSize/);
        });

        it('should reject fileSize exceeding max', () => {
            const smallValidator = new TransferValidator(100); // 100 bytes max
            const invalidData = {
                fileId: 'file-123',
                fileName: 'test.txt',
                fileSize: 1000, // Exceeds 100 bytes
                mimeType: 'text/plain',
                totalChunks: 10,
                chunkSize: 1024,
                fileHash: VALID_HASH
            };

            assert.throws(() => {
                smallValidator.validateIncomingFile(invalidData);
            }, /File size exceeds limit/);
        });

        it('should reject invalid totalChunks', () => {
            const invalidData = {
                fileId: 'file-123',
                fileName: 'test.txt',
                fileSize: 1024,
                mimeType: 'text/plain',
                totalChunks: 0, // Invalid
                chunkSize: 1024,
                fileHash: VALID_HASH
            };

            assert.throws(() => {
                validator.validateIncomingFile(invalidData);
            }, /Invalid totalChunks/);
        });

        it('should reject invalid chunkSize', () => {
            const invalidData = {
                fileId: 'file-123',
                fileName: 'test.txt',
                fileSize: 1024,
                mimeType: 'text/plain',
                totalChunks: 10,
                chunkSize: -100, // Invalid
                fileHash: VALID_HASH
            };

            assert.throws(() => {
                validator.validateIncomingFile(invalidData);
            }, /Invalid chunkSize/);
        });

        it('should reject invalid fileHash format', () => {
            const invalidData = {
                fileId: 'file-123',
                fileName: 'test.txt',
                fileSize: 1024,
                mimeType: 'text/plain',
                totalChunks: 10,
                chunkSize: 1024,
                fileHash: 'not-a-valid-hex-hash' // Invalid
            };

            assert.throws(() => {
                validator.validateIncomingFile(invalidData);
            }, /Invalid fileHash format/);
        });

        it('should reject invalid file name', () => {
            const invalidData = {
                fileId: 'file-123',
                fileName: '../etc/passwd', // Path traversal attempt
                fileSize: 1024,
                mimeType: 'text/plain',
                totalChunks: 10,
                chunkSize: 1024,
                fileHash: VALID_HASH
            };

            assert.throws(() => {
                validator.validateIncomingFile(invalidData);
            }, /Invalid file name/);
        });

        it('should reject invalid MIME type', () => {
            const invalidData = {
                fileId: 'file-123',
                fileName: 'test.txt',
                fileSize: 1024,
                mimeType: 'invalid/mime/type', // Invalid format
                totalChunks: 10,
                chunkSize: 1024,
                fileHash: VALID_HASH
            };

            assert.throws(() => {
                validator.validateIncomingFile(invalidData);
            }, /Invalid MIME type/);
        });
    });

    describe('validateChunkData', () => {
        it('should validate chunk data against transfer', () => {
            const mockTransfer = {
                fileId: 'file-123',
                totalChunks: 10,
                chunkSize: 1024
            };

            const validChunkData = {
                fileId: 'file-123',
                chunkIndex: 5,
                totalChunks: 10,
                data: 'base64encodeddata',
                chunkHash: 'chunkhash123'
            };

            assert.doesNotThrow(() => {
                validator.validateChunkData(mockTransfer as any, validChunkData);
            });
        });

        it('should reject chunk with wrong fileId', () => {
            const mockTransfer = {
                fileId: 'file-123',
                totalChunks: 10,
                chunkSize: 1024
            };

            const invalidChunkData = {
                fileId: 'different-file-id', // Wrong fileId
                chunkIndex: 5,
                totalChunks: 10,
                data: 'base64encodeddata',
                chunkHash: 'chunkhash123'
            };

            assert.throws(() => {
                validator.validateChunkData(mockTransfer as any, invalidChunkData);
            }, /File ID mismatch/);
        });

        it('should reject invalid chunk index', () => {
            const mockTransfer = {
                fileId: 'file-123',
                totalChunks: 10,
                chunkSize: 1024
            };

            const invalidChunkData = {
                fileId: 'file-123',
                chunkIndex: 15, // Out of bounds (totalChunks is 10)
                totalChunks: 10,
                data: 'base64encodeddata',
                chunkHash: 'chunkhash123'
            };

            assert.throws(() => {
                validator.validateChunkData(mockTransfer as any, invalidChunkData);
            }, /Invalid chunk index/);
        });

        it('should reject negative chunk index', () => {
            const mockTransfer = {
                fileId: 'file-123',
                totalChunks: 10,
                chunkSize: 1024
            };

            const invalidChunkData = {
                fileId: 'file-123',
                chunkIndex: -1, // Negative
                totalChunks: 10,
                data: 'base64encodeddata',
                chunkHash: 'chunkhash123'
            };

            assert.throws(() => {
                validator.validateChunkData(mockTransfer as any, invalidChunkData);
            }, /Invalid chunk index/);
        });

        it('should reject chunk with missing data', () => {
            const mockTransfer = {
                fileId: 'file-123',
                totalChunks: 10,
                chunkSize: 1024
            };

            const invalidChunkData = {
                fileId: 'file-123',
                chunkIndex: 5,
                totalChunks: 10,
                // Missing data field
                chunkHash: 'chunkhash123'
            } as any;

            assert.throws(() => {
                validator.validateChunkData(mockTransfer as any, invalidChunkData);
            }, /Invalid chunk data/);
        });

        it('should reject chunk with missing chunkHash', () => {
            const mockTransfer = {
                fileId: 'file-123',
                totalChunks: 10,
                chunkSize: 1024
            };

            const invalidChunkData = {
                fileId: 'file-123',
                chunkIndex: 5,
                totalChunks: 10,
                data: 'base64encodeddata'
                // Missing chunkHash
            } as any;

            assert.throws(() => {
                validator.validateChunkData(mockTransfer as any, invalidChunkData);
            }, /Invalid chunk hash/);
        });
    });

    describe('getMaxFileSize and setMaxFileSize', () => {
        it('should get and set max file size', () => {
            const originalSize = validator.getMaxFileSize();
            assert.strictEqual(originalSize, 100 * 1024 * 1024);

            validator.setMaxFileSize(50 * 1024 * 1024);
            assert.strictEqual(validator.getMaxFileSize(), 50 * 1024 * 1024);

            // Restore
            validator.setMaxFileSize(originalSize);
        });

        it('should reject non-positive max file size', () => {
            assert.throws(() => {
                validator.setMaxFileSize(0);
            }, /Max file size must be positive/);

            assert.throws(() => {
                validator.setMaxFileSize(-100);
            }, /Max file size must be positive/);
        });
    });
});