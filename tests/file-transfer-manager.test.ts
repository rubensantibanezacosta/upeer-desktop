import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert';
import { TransferManager } from '../src/main_process/network/file-transfer/transfer-manager.js';
import { FileTransferStore } from '../src/main_process/network/file-transfer/transfer-store.js';
import { FileChunker } from '../src/main_process/network/file-transfer/chunker.js';
import { TransferValidator } from '../src/main_process/network/file-transfer/validator.js';

// Mock dependencies
const mockStore = {
    createTransfer: mock.fn(),
    getTransfer: mock.fn(),
    updateTransfer: mock.fn(),
    removeTransfer: mock.fn(),
    getAllTransfers: mock.fn(),
    getTransfersByState: mock.fn(),
    getTransfersByPeer: mock.fn(),
    clearCompletedTransfers: mock.fn(),
    getStats: mock.fn(),
    clearAll: mock.fn(),
};

const mockChunker = {
    createTempFile: mock.fn(),
    writeChunk: mock.fn(),
    createChunkData: mock.fn(),
    readCompleteFile: mock.fn(),
    cleanupTempFile: mock.fn(),
    calculateChunks: mock.fn(),
    validateChunkIndex: mock.fn(),
    getChunkSize: mock.fn(),
    setChunkSize: mock.fn(),
};

const mockValidator = {
    validateIncomingFile: mock.fn(),
    validateChunkData: mock.fn(),
    validateAndPrepareFile: mock.fn(),
    getMaxFileSize: mock.fn(),
    setMaxFileSize: mock.fn(),
};

const mockSendFunction = mock.fn((address: string, data: any) => {
    console.log(`[MOCK SEND] to ${address}:`, data.type);
});

const mockWindow = {
    webContents: {
        send: mock.fn((channel: string, data: any) => {
            console.log(`[MOCK UI] ${channel}:`, data);
        })
    }
};

// Replace actual implementations with mocks
mock.method(FileTransferStore.prototype, 'constructor', () => mockStore);
mock.method(FileChunker.prototype, 'constructor', () => mockChunker);
mock.method(TransferValidator.prototype, 'constructor', () => mockValidator);

describe('TransferManager Unit Tests', () => {
    let manager: TransferManager;

    beforeEach(() => {
        // Reset all mocks
        Object.values(mockStore).forEach(fn => (fn as any).mock?.resetCalls?.());
        Object.values(mockChunker).forEach(fn => (fn as any).mock?.resetCalls?.());
        Object.values(mockValidator).forEach(fn => (fn as any).mock?.resetCalls?.());
        mockSendFunction.mock.resetCalls();
        (mockWindow.webContents.send as any).mock.resetCalls();

        // Create manager with custom config
        manager = new TransferManager({
            maxChunkSize: 1024,
            maxFileSize: 1024 * 1024,
            transferTimeout: 30000,
            maxRetries: 2
        });

        // Initialize with mock send function
        manager.initialize(mockSendFunction, mockWindow as any);
    });

    afterEach(() => {
        // Clean up any intervals
        if ((manager as any).cleanupInterval) {
            clearInterval((manager as any).cleanupInterval);
        }
    });

    describe('initialization', () => {
        it('should initialize with default config', () => {
            const defaultManager = new TransferManager();
            // Should not throw
            assert.ok(defaultManager);
        });

        it('should require initialization before sending', async () => {
            const uninitializedManager = new TransferManager();
            
            await assert.rejects(
                async () => {
                    await uninitializedManager.startSend('peer', 'address', '/path/to/file');
                },
                /TransferManager not initialized with send function/
            );
        });

        it('should start cleanup interval after initialization', () => {
            // The interval should be set
            assert.ok((manager as any).cleanupInterval);
        });
    });

    describe('startSend', () => {
        beforeEach(() => {
            // Setup validator mock
            mockValidator.validateAndPrepareFile.mock.mockImplementation(async () => ({
                name: 'test.txt',
                size: 1024,
                mimeType: 'text/plain',
                hash: 'abc123'
            }));

            // Setup store mock
            mockStore.createTransfer.mock.mockImplementation((data: any) => ({
                fileId: 'generated-file-id',
                ...data,
                state: 'active',
                direction: 'sending',
                chunksReceived: new Set(),
                chunksAcked: new Set(),
                chunksSent: new Set(),
                startedAt: Date.now(),
                lastActivity: Date.now(),
                totalChunks: 1,
                chunkSize: 1024,
                fileHash: 'abc123'
            }));
        });

        it('should successfully start a file transfer', async () => {
            const fileId = await manager.startSend(
                'peer-123',
                '200::1',
                '/path/to/test.txt'
            );

            assert.ok(fileId);
            assert.strictEqual(fileId, 'generated-file-id');

            // Verify validator was called
            assert.strictEqual(mockValidator.validateAndPrepareFile.mock.calls.length, 1);

            // Verify store was called with correct data
            assert.strictEqual(mockStore.createTransfer.mock.calls.length, 1);
            const storeCall = mockStore.createTransfer.mock.calls[0];
            assert.strictEqual(storeCall.arguments[0].upeerId, 'peer-123');
            assert.strictEqual(storeCall.arguments[0].fileName, 'test.txt');
            assert.strictEqual(storeCall.arguments[0].fileSize, 1024);

            // Verify send function was called with FILE_START
            assert.strictEqual(mockSendFunction.mock.calls.length, 1);
            const sendCall = mockSendFunction.mock.calls[0];
            assert.strictEqual(sendCall.arguments[1].type, 'FILE_START');
            assert.strictEqual(sendCall.arguments[1].fileId, 'generated-file-id');
        });

        it('should handle validation failure', async () => {
            mockValidator.validateAndPrepareFile.mock.mockImplementation(async () => {
                throw new Error('File validation failed');
            });

            await assert.rejects(
                async () => {
                    await manager.startSend('peer', 'address', '/invalid/file');
                },
                /File validation failed/
            );

            // No transfer should be created
            assert.strictEqual(mockStore.createTransfer.mock.calls.length, 0);
            // No FILE_START should be sent
            assert.strictEqual(mockSendFunction.mock.calls.length, 0);
        });

        it('should include thumbnail if provided', async () => {
            await manager.startSend(
                'peer-123',
                '200::1',
                '/path/to/test.txt',
                'data:image/png;base64,thumbnail'
            );

            const storeCall = mockStore.createTransfer.mock.calls[0];
            assert.strictEqual(storeCall.arguments[0].thumbnail, 'data:image/png;base64,thumbnail');
        });
    });

    describe('handleFileStart', () => {
        beforeEach(() => {
            // Setup validator mock
            mockValidator.validateIncomingFile.mock.mockImplementation(() => {
                // No throw means validation passed
            });

            // Setup store mock
            mockStore.createTransfer.mock.mockImplementation((data: any) => ({
                fileId: data.fileId || 'generated-id',
                ...data,
                state: 'active',
                chunksReceived: new Set(),
                chunksAcked: new Set(),
                chunksSent: new Set(),
                startedAt: Date.now(),
                lastActivity: Date.now(),
                totalChunks: data.totalChunks || 1,
                chunkSize: data.chunkSize || 1024
            }));

            // Setup chunker mock
            mockChunker.createTempFile.mock.mockImplementation(async () => {});
        });

        it('should accept valid incoming file start', async () => {
            const incomingFileData = {
                fileId: 'incoming-file-123',
                fileName: 'received.txt',
                fileSize: 1024,
                mimeType: 'text/plain',
                totalChunks: 1,
                chunkSize: 1024,
                fileHash: '0'.repeat(64),
                thumbnail: 'data:image/png;base64,thumb'
            };

            await manager.handleFileStart(
                'peer-456',
                '200::2',
                incomingFileData,
                'mock-signature'
            );

            // Verify validation
            assert.strictEqual(mockValidator.validateIncomingFile.mock.calls.length, 1);

            // Verify transfer creation
            assert.strictEqual(mockStore.createTransfer.mock.calls.length, 1);
            const storeCall = mockStore.createTransfer.mock.calls[0];
            assert.strictEqual(storeCall.arguments[0].fileId, 'incoming-file-123');
            assert.strictEqual(storeCall.arguments[0].upeerId, 'peer-456');
            assert.strictEqual(storeCall.arguments[0].direction, 'receiving');

            // Verify temp file creation
            assert.strictEqual(mockChunker.createTempFile.mock.calls.length, 1);

            // Verify ACK was sent
            assert.strictEqual(mockSendFunction.mock.calls.length, 1);
            const sendCall = mockSendFunction.mock.calls[0];
            assert.strictEqual(sendCall.arguments[1].type, 'FILE_ACK');
            assert.strictEqual(sendCall.arguments[1].fileId, 'incoming-file-123');
            assert.strictEqual(sendCall.arguments[1].received, true);
        });

        it('should reject invalid incoming file data', async () => {
            mockValidator.validateIncomingFile.mock.mockImplementation(() => {
                throw new Error('Validation failed');
            });

            const invalidFileData = {
                fileName: 'test.txt',
                fileSize: 1024
                // Missing required fields
            };

            await assert.rejects(
                async () => {
                    await manager.handleFileStart(
                        'peer',
                        'address',
                        invalidFileData as any,
                        'signature'
                    );
                },
                /Validation failed/
            );

            // No transfer should be created
            assert.strictEqual(mockStore.createTransfer.mock.calls.length, 0);
            // No ACK should be sent
            assert.strictEqual(mockSendFunction.mock.calls.length, 0);
        });
    });

    describe('cancelTransfer', () => {
        it('should cancel existing transfer', () => {
            const mockTransfer = {
                fileId: 'test-transfer',
                upeerId: 'peer-123',
                fileName: 'test.txt',
                state: 'active',
                direction: 'sending'
            };

            mockStore.getTransfer.mock.mockImplementation(() => mockTransfer);
            mockStore.updateTransfer.mock.mockImplementation(() => true);

            manager.cancelTransfer('test-transfer', 'User cancelled');

            // Verify transfer was retrieved
            assert.strictEqual(mockStore.getTransfer.mock.calls.length, 1);
            assert.strictEqual(mockStore.getTransfer.mock.calls[0].arguments[0], 'test-transfer');

            // Verify transfer was updated to cancelled
            assert.strictEqual(mockStore.updateTransfer.mock.calls.length, 1);
            const updateCall = mockStore.updateTransfer.mock.calls[0];
            assert.strictEqual(updateCall.arguments[1].state, 'cancelled');

            // Verify UI was notified
            assert.strictEqual((mockWindow.webContents.send as any).mock.calls.length, 1);
            const uiCall = (mockWindow.webContents.send as any).mock.calls[0];
            assert.strictEqual(uiCall.arguments[0], 'file-transfer-cancelled');
            assert.strictEqual(uiCall.arguments[1].fileId, 'test-transfer');
        });

        it('should handle non-existent transfer', () => {
            mockStore.getTransfer.mock.mockImplementation(() => undefined);

            // Should not throw
            assert.doesNotThrow(() => {
                manager.cancelTransfer('non-existent', 'reason');
            });

            // No updates should happen
            assert.strictEqual(mockStore.updateTransfer.mock.calls.length, 0);
        });
    });

    describe('getAllTransfers', () => {
        it('should return all transfers from store', () => {
            const mockTransfers = [
                { fileId: '1', fileName: 'test1.txt' },
                { fileId: '2', fileName: 'test2.txt' }
            ];

            mockStore.getAllTransfers.mock.mockImplementation(() => mockTransfers);

            const transfers = manager.getAllTransfers();
            assert.deepStrictEqual(transfers, mockTransfers);
            assert.strictEqual(mockStore.getAllTransfers.mock.calls.length, 1);
        });
    });

    describe('cleanupInterval', () => {
        it('should clean up completed transfers periodically', () => {
            // Mock the cleanup method
            const mockCleanup = mock.method(manager as any, 'cleanupOldTransfers');
            
            // Trigger interval manually (simulate interval firing)
            (manager as any).cleanupOldTransfers();
            
            assert.strictEqual(mockCleanup.mock.calls.length, 1);
            // Store cleanup should be called
            assert.strictEqual(mockStore.clearCompletedTransfers.mock.calls.length, 1);
        });
    });
});