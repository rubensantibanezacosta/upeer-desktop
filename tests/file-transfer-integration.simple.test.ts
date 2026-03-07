import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert';
import { TransferManager } from '../src/main_process/network/file-transfer/transfer-manager.js';
import { FileTransferStore } from '../src/main_process/network/file-transfer/transfer-store.js';

// Mock the validator to avoid file system operations
const mockValidator = {
    validateAndPrepareFile: mock.fn(async (filePath: string) => ({
        name: 'test.txt',
        size: 1024,
        mimeType: 'text/plain',
        hash: '0'.repeat(64),
        buffer: Buffer.from('test content')
    })),
    validateIncomingFile: mock.fn(() => {}),
    validateChunkData: mock.fn(() => {}),
    verifyFileHash: mock.fn(async () => {}),
    getMaxFileSize: () => 100 * 1024 * 1024,
    setMaxFileSize: () => {}
};

// Mock the chunker
const mockChunker = {
    createTempFile: mock.fn(async () => {}),
    writeChunk: mock.fn(async () => {}),
    createChunkData: mock.fn(() => ({
        fileId: 'test-id',
        chunkIndex: 0,
        totalChunks: 1,
        data: 'dGVzdCBkYXRh', // base64 of 'test data'
        chunkHash: 'chunkhash'
    })),
    cleanupTempFile: mock.fn(async () => {}),
    readCompleteFile: mock.fn(async () => Buffer.from('test')),
    calculateChunks: () => 1
};

// Mock dependencies
const mockSendFunction = mock.fn((address: string, data: any) => {
    console.log(`[MOCK SEND] to ${address}:`, data.type);
    return Promise.resolve();
});

const mockWindow = {
    webContents: {
        send: mock.fn((channel: string, data: any) => {
            console.log(`[MOCK UI] ${channel}:`, data.fileId || data.type);
        })
    }
};

describe('TransferManager Simple Integration', () => {
    let transferManager: TransferManager;

    beforeEach(() => {
        // Create new manager instance with custom config
        transferManager = new TransferManager({
            maxChunkSize: 1024,
            maxFileSize: 1024 * 1024,
            transferTimeout: 30000,
            maxRetries: 2
        });
        
        // Initialize with mock send function
        transferManager.initialize(mockSendFunction, mockWindow as any);
        
        // Reset mocks
        mockSendFunction.mock.resetCalls();
        (mockWindow.webContents.send as any).mock.resetCalls();
    });

    afterEach(() => {
        // Reset mocks
        mockSendFunction.mock.resetCalls();
        (mockWindow.webContents.send as any).mock.resetCalls();
    });

    describe('Basic Operations', () => {
        it('should initialize correctly', () => {
            assert.ok(transferManager);
            
            // Test that we can get transfers (should be empty initially)
            const transfers = transferManager.getAllTransfers();
            assert.deepStrictEqual(transfers, []);
        });

        it('should create and retrieve transfers', async () => {
            // This test doesn't actually start a transfer, just tests the store
            const store = new FileTransferStore();
            
            const transfer = store.createTransfer({
                revelnestId: 'peer-123',
                fileName: 'test.txt',
                fileSize: 1024,
                mimeType: 'text/plain',
                direction: 'sending'
            });

            assert.ok(transfer.fileId);
            assert.strictEqual(transfer.revelnestId, 'peer-123');
            assert.strictEqual(transfer.fileName, 'test.txt');
            assert.strictEqual(transfer.direction, 'sending');
            assert.strictEqual(transfer.state, 'active');
            
            // Retrieve the transfer
            const retrieved = store.getTransfer(transfer.fileId);
            assert.deepStrictEqual(retrieved, transfer);
            
            // Get all transfers
            const allTransfers = store.getAllTransfers();
            assert.strictEqual(allTransfers.length, 1);
            assert.deepStrictEqual(allTransfers[0], transfer);
        });

        it('should update transfer state', () => {
            const store = new FileTransferStore();
            
            const transfer = store.createTransfer({
                revelnestId: 'peer-123',
                fileName: 'test.txt',
                fileSize: 1024,
                mimeType: 'text/plain',
                direction: 'sending'
            });

            // Update the transfer
            const updated = store.updateTransfer(transfer.fileId, {
                state: 'completed',
                lastActivity: Date.now() + 1000
            });

            assert.strictEqual(updated, true);
            
            const retrieved = store.getTransfer(transfer.fileId);
            assert.strictEqual(retrieved?.state, 'completed');
            assert.ok(retrieved?.lastActivity > transfer.lastActivity);
        });

        it('should handle transfer cancellation', () => {
            const store = new FileTransferStore();
            
            const transfer = store.createTransfer({
                revelnestId: 'peer-123',
                fileName: 'test.txt',
                fileSize: 1024,
                mimeType: 'text/plain',
                direction: 'sending'
            });

            // Cancel the transfer
            store.updateTransfer(transfer.fileId, { state: 'cancelled' });
            
            const retrieved = store.getTransfer(transfer.fileId);
            assert.strictEqual(retrieved?.state, 'cancelled');
        });
    });

    describe('Transfer Statistics', () => {
        it('should provide correct statistics', () => {
            const store = new FileTransferStore();
            
            // Create transfers with different states
            store.createTransfer({
                revelnestId: 'peer-1',
                fileName: 'active.txt',
                fileSize: 1024,
                mimeType: 'text/plain',
                direction: 'sending'
            });

            const completed = store.createTransfer({
                revelnestId: 'peer-2',
                fileName: 'completed.txt',
                fileSize: 2048,
                mimeType: 'text/plain',
                direction: 'receiving'
            });
            store.updateTransfer(completed.fileId, { state: 'completed' });

            const failed = store.createTransfer({
                revelnestId: 'peer-3',
                fileName: 'failed.txt',
                fileSize: 4096,
                mimeType: 'text/plain',
                direction: 'sending'
            });
            store.updateTransfer(failed.fileId, { state: 'failed' });

            const stats = store.getStats();
            
            assert.strictEqual(stats.total, 3);
            assert.strictEqual(stats.active, 1);
            assert.strictEqual(stats.completed, 1);
            assert.strictEqual(stats.failed, 1);
            assert.strictEqual(stats.cancelled, 0);
            assert.strictEqual(stats.sending, 2);
            assert.strictEqual(stats.receiving, 1);
        });

        it('should filter transfers by peer', () => {
            const store = new FileTransferStore();
            
            store.createTransfer({
                revelnestId: 'peer-1',
                fileName: 'file1.txt',
                fileSize: 1024,
                mimeType: 'text/plain',
                direction: 'sending'
            });

            store.createTransfer({
                revelnestId: 'peer-2',
                fileName: 'file2.txt',
                fileSize: 2048,
                mimeType: 'text/plain',
                direction: 'receiving'
            });

            store.createTransfer({
                revelnestId: 'peer-1',
                fileName: 'file3.txt',
                fileSize: 4096,
                mimeType: 'text/plain',
                direction: 'sending'
            });

            const peer1Transfers = store.getTransfersByPeer('peer-1');
            const peer2Transfers = store.getTransfersByPeer('peer-2');
            const peer3Transfers = store.getTransfersByPeer('peer-3');

            assert.strictEqual(peer1Transfers.length, 2);
            assert.strictEqual(peer2Transfers.length, 1);
            assert.strictEqual(peer3Transfers.length, 0);
        });
    });

    describe('Error Handling', () => {
        it('should handle non-existent transfer operations', () => {
            const store = new FileTransferStore();
            
            // Try to get non-existent transfer
            const transfer = store.getTransfer('non-existent-id');
            assert.strictEqual(transfer, undefined);
            
            // Try to update non-existent transfer
            const updated = store.updateTransfer('non-existent-id', { state: 'completed' });
            assert.strictEqual(updated, false);
            
            // Try to remove non-existent transfer
            const removed = store.removeTransfer('non-existent-id');
            assert.strictEqual(removed, false);
        });

        it('should clear completed transfers', () => {
            const store = new FileTransferStore();
            
            // Create transfers with different states
            const active = store.createTransfer({
                revelnestId: 'peer-1',
                fileName: 'active.txt',
                fileSize: 1024,
                mimeType: 'text/plain',
                direction: 'sending'
            });

            const completed = store.createTransfer({
                revelnestId: 'peer-2',
                fileName: 'completed.txt',
                fileSize: 2048,
                mimeType: 'text/plain',
                direction: 'receiving'
            });
            store.updateTransfer(completed.fileId, { state: 'completed' });

            const cancelled = store.createTransfer({
                revelnestId: 'peer-3',
                fileName: 'cancelled.txt',
                fileSize: 4096,
                mimeType: 'text/plain',
                direction: 'sending'
            });
            store.updateTransfer(cancelled.fileId, { state: 'cancelled' });

            const failed = store.createTransfer({
                revelnestId: 'peer-4',
                fileName: 'failed.txt',
                fileSize: 8192,
                mimeType: 'text/plain',
                direction: 'receiving'
            });
            store.updateTransfer(failed.fileId, { state: 'failed' });

            // Clear completed transfers (should remove completed, cancelled, failed)
            const removedCount = store.clearCompletedTransfers();
            assert.strictEqual(removedCount, 3);
            
            // Only active transfer should remain
            const remaining = store.getAllTransfers();
            assert.strictEqual(remaining.length, 1);
            assert.strictEqual(remaining[0].fileId, active.fileId);
        });
    });
});