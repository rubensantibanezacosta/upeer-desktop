import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs/promises';
import path from 'node:path';
import { TransferManager } from '../src/main_process/network/file-transfer/transfer-manager.js';
import { FileTransferStore } from '../src/main_process/network/file-transfer/transfer-store.js';

// Mock dependencies
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

describe('TransferManager Integration', () => {
    let transferManager: TransferManager;
    let tempDir: string;
    let testFilePath: string;

    beforeEach(async () => {
        // Create temp directory for test files
        tempDir = await fs.mkdtemp(path.join('/tmp', 'transfer-test-'));
        testFilePath = path.join(tempDir, 'test-file.txt');
        
        // Create a test file
        await fs.writeFile(testFilePath, 'This is a test file content for transfer testing.'.repeat(100));
        
        // Create new manager instance
        transferManager = new TransferManager({
            maxChunkSize: 1024, // 1KB chunks for testing
            maxFileSize: 1024 * 1024, // 1MB max
            transferTimeout: 30000, // 30 seconds
            maxRetries: 2
        });
        
        // Initialize with mock send function
        transferManager.initialize(mockSendFunction, mockWindow as any);
    });

    afterEach(async () => {
        // Cleanup transfer manager interval
        if (transferManager && (transferManager as any).cleanupInterval) {
            clearInterval((transferManager as any).cleanupInterval);
            (transferManager as any).cleanupInterval = undefined;
        }
        
        // Cleanup temp directory
        try {
            await fs.rm(tempDir, { recursive: true, force: true });
        } catch (error) {
            // Ignore cleanup errors
        }
        
        // Reset mocks
        mockSendFunction.mock.resetCalls();
        (mockWindow.webContents.send as any).mock.resetCalls();
    });

    describe('Basic Transfer Flow', () => {
        it('should initialize correctly', () => {
            assert.ok(transferManager);
            // Test that we can get transfers (should be empty initially)
            const transfers = transferManager.getAllTransfers();
            assert.deepStrictEqual(transfers, []);
        });

        it('should start a file transfer', async () => {
            const fileId = await transferManager.startSend(
                'peer-123',
                '200::1',
                testFilePath,
                'data:image/png;base64,thumbnail'
            );

            assert.ok(fileId);
            assert.strictEqual(typeof fileId, 'string');
            
            // Verify transfer was created
            const transfer = transferManager.getTransfer(fileId);
            assert.ok(transfer);
            assert.strictEqual(transfer.upeerId, 'peer-123');
            assert.strictEqual(transfer.fileName, 'test-file.txt');
            assert.strictEqual(transfer.direction, 'sending');
            assert.strictEqual(transfer.state, 'active');
            
            // Verify FILE_START was sent (may also send FILE_CHUNK immediately)
            assert.ok(mockSendFunction.mock.calls.length >= 1);
            const firstCall = mockSendFunction.mock.calls[0];
            assert.strictEqual(firstCall.arguments[1].type, 'FILE_START');
            assert.strictEqual(firstCall.arguments[1].fileId, fileId);
        });

        it('should handle incoming FILE_START', async () => {
            const incomingFileData = {
                fileId: 'incoming-file-123',
                fileName: 'received.txt',
                fileSize: 1024,
                mimeType: 'text/plain',
                totalChunks: 1,
                chunkSize: 1024,
                fileHash: '0'.repeat(64), // SHA-256 hash
                thumbnail: 'data:image/png;base64,thumbnail'
            };

            await transferManager.handleFileStart(
                'peer-456',
                '200::2',
                incomingFileData,
                'mock-signature'
            );

            // Verify transfer was created for receiving
            const transfer = transferManager.getTransfer('incoming-file-123');
            assert.ok(transfer);
            assert.strictEqual(transfer.upeerId, 'peer-456');
            assert.strictEqual(transfer.fileName, 'received.txt');
            assert.strictEqual(transfer.direction, 'receiving');
            assert.strictEqual(transfer.state, 'active');
            
            // Verify ACK was sent
            assert.strictEqual(mockSendFunction.mock.calls.length, 1);
            const ackCall = mockSendFunction.mock.calls[0];
            assert.strictEqual(ackCall.arguments[1].type, 'FILE_ACK');
            assert.strictEqual(ackCall.arguments[1].fileId, 'incoming-file-123');
            assert.strictEqual(ackCall.arguments[1].received, true);
        });

        it('should cancel a transfer', async () => {
            const fileId = await transferManager.startSend(
                'peer-123',
                '200::1',
                testFilePath
            );

            // Cancel the transfer
            transferManager.cancelTransfer(fileId, 'User cancelled');

            // Verify transfer is cancelled
            const transfer = transferManager.getTransfer(fileId);
            assert.ok(transfer);
            assert.strictEqual(transfer.state, 'cancelled');
            
            // Verify UI was notified
            const uiCalls = (mockWindow.webContents.send as any).mock.calls;
            const cancelCall = uiCalls.find((call: any) => call.arguments[0] === 'file-transfer-cancelled');
            assert.ok(cancelCall);
            assert.strictEqual(cancelCall.arguments[1].fileId, fileId);
            assert.strictEqual(cancelCall.arguments[1].reason, 'User cancelled');
        });

        it('should get all transfers', async () => {
            // Start multiple transfers
            const fileId1 = await transferManager.startSend(
                'peer-1',
                '200::1',
                testFilePath
            );

            const fileId2 = await transferManager.startSend(
                'peer-2',
                '200::2',
                testFilePath
            );

            const allTransfers = transferManager.getAllTransfers();
            assert.strictEqual(allTransfers.length, 2);
            
            const transferIds = allTransfers.map(t => t.fileId);
            assert.ok(transferIds.includes(fileId1));
            assert.ok(transferIds.includes(fileId2));
        });

        it('should reject invalid FILE_START data', async () => {
            const invalidFileData = {
                // Missing required fields but include fileId for cancel message
                fileId: 'invalid-file-123',
                fileName: 'test.txt',
                fileSize: 1024
            };

            // Should not throw (error is handled internally)
            await transferManager.handleFileStart(
                'peer-123',
                '200::1',
                invalidFileData as any,
                'mock-signature'
            );

            // Should send FILE_CANCEL for invalid data
            assert.strictEqual(mockSendFunction.mock.calls.length, 1);
            const cancelCall = mockSendFunction.mock.calls[0];
            assert.strictEqual(cancelCall.arguments[1].type, 'FILE_CANCEL');
            assert.strictEqual(cancelCall.arguments[1].fileId, 'invalid-file-123');
            
            // No transfer should be created
            const transfer = transferManager.getTransfer('invalid-file-123');
            assert.strictEqual(transfer, undefined);
        });
    });

    describe('Transfer Store Integration', () => {
        it('should update transfer progress', () => {
            // Create a simple store for testing
            const store = new FileTransferStore();
            
            const transfer = store.createTransfer({
                upeerId: 'peer-123',
                fileName: 'test.txt',
                fileSize: 1024,
                mimeType: 'text/plain',
                direction: 'sending'
            });

            // Update progress
            const updated = store.updateTransfer(transfer.fileId, {
                chunksAcked: new Set([0, 1, 2]),
                lastActivity: Date.now()
            });

            assert.strictEqual(updated, true);
            
            const retrieved = store.getTransfer(transfer.fileId);
            assert.strictEqual(retrieved?.chunksAcked.size, 3);
            assert.ok(retrieved?.chunksAcked.has(0));
            assert.ok(retrieved?.chunksAcked.has(1));
            assert.ok(retrieved?.chunksAcked.has(2));
        });

        it('should get transfers by state', () => {
            const store = new FileTransferStore();
            
            store.createTransfer({
                upeerId: 'peer-1',
                fileName: 'active.txt',
                fileSize: 1024,
                mimeType: 'text/plain',
                direction: 'sending'
            });

            const completed = store.createTransfer({
                upeerId: 'peer-2',
                fileName: 'completed.txt',
                fileSize: 2048,
                mimeType: 'text/plain',
                direction: 'receiving'
            });
            store.updateTransfer(completed.fileId, { state: 'completed' });

            const activeTransfers = store.getTransfersByState('active');
            const completedTransfers = store.getTransfersByState('completed');

            assert.strictEqual(activeTransfers.length, 1);
            assert.strictEqual(completedTransfers.length, 1);
            assert.strictEqual(activeTransfers[0].fileName, 'active.txt');
            assert.strictEqual(completedTransfers[0].fileName, 'completed.txt');
        });
    });

    describe('Error Handling', () => {
        it('should handle non-existent file path', async () => {
            const nonExistentFile = path.join(tempDir, 'non-existent.txt');
            
            await assert.rejects(
                async () => {
                    await transferManager.startSend(
                        'peer-123',
                        '200::1',
                        nonExistentFile
                    );
                },
                /File too large|Error starting file transfer|ENOENT|no such file/
            );
        });

        it('should handle invalid peer address', async () => {
            // Test that manager doesn't crash with invalid address
            // (send function handles the actual sending)
            const fileId = await transferManager.startSend(
                'peer-123',
                'invalid-address',
                testFilePath
            );

            assert.ok(fileId);
            // Should still create the transfer even if sending fails
            const transfer = transferManager.getTransfer(fileId);
            assert.ok(transfer);
        });

        it('should clean up after timeout', async () => {
            // This test is more complex as it involves timeouts
            // We'll just verify the cleanup mechanism exists
            const store = new FileTransferStore();
            
            const transfer = store.createTransfer({
                upeerId: 'peer-123',
                fileName: 'test.txt',
                fileSize: 1024,
                mimeType: 'text/plain',
                direction: 'sending'
            });

            // Mark as very old
            store.updateTransfer(transfer.fileId, {
                lastActivity: Date.now() - 3600000, // 1 hour ago
                state: 'completed'
            });

            // Clear completed transfers
            const removed = store.clearCompletedTransfers();
            assert.strictEqual(removed, 1);
            
            const remaining = store.getAllTransfers();
            assert.strictEqual(remaining.length, 0);
        });
    });
});