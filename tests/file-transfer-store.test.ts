import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { FileTransferStore } from '../src/main_process/network/file-transfer/transfer-store.js';

describe('FileTransferStore', () => {
    let store: FileTransferStore;

    beforeEach(() => {
        store = new FileTransferStore();
    });

    afterEach(() => {
        // Clean up after each test
        store.clearAll();
    });

    describe('createTransfer', () => {
        it('should create a new transfer with default values', () => {
            const transfer = store.createTransfer({
                revelnestId: 'peer123',
                fileName: 'test.txt',
                fileSize: 1024,
                mimeType: 'text/plain',
                direction: 'sending'
            });

            assert.ok(transfer.fileId);
            assert.strictEqual(transfer.revelnestId, 'peer123');
            assert.strictEqual(transfer.fileName, 'test.txt');
            assert.strictEqual(transfer.fileSize, 1024);
            assert.strictEqual(transfer.mimeType, 'text/plain');
            assert.strictEqual(transfer.direction, 'sending');
            assert.strictEqual(transfer.state, 'active');
            assert.ok(transfer.totalChunks > 0);
            assert.strictEqual(transfer.chunkSize, 65536);
            assert.ok(transfer.startedAt > 0);
            assert.ok(transfer.lastActivity > 0);
            assert.ok(transfer.chunksReceived instanceof Set);
            assert.ok(transfer.chunksAcked instanceof Set);
            assert.ok(transfer.chunksSent instanceof Set);
        });

        it('should accept custom fileId', () => {
            const customId = 'custom-file-id-123';
            const transfer = store.createTransfer({
                fileId: customId,
                revelnestId: 'peer123',
                fileName: 'test.txt',
                fileSize: 1024,
                mimeType: 'text/plain',
                direction: 'sending'
            });

            assert.strictEqual(transfer.fileId, customId);
        });

        it('should calculate totalChunks based on fileSize and chunkSize', () => {
            const transfer = store.createTransfer({
                revelnestId: 'peer123',
                fileName: 'test.txt',
                fileSize: 100000, // 100KB
                mimeType: 'text/plain',
                direction: 'sending',
                chunkSize: 10000 // 10KB chunks
            });

            // 100KB / 10KB = 10 chunks
            assert.strictEqual(transfer.totalChunks, 10);
            assert.strictEqual(transfer.chunkSize, 10000);
        });

        it('should handle receiving direction', () => {
            const transfer = store.createTransfer({
                revelnestId: 'peer123',
                fileName: 'test.txt',
                fileSize: 1024,
                mimeType: 'text/plain',
                direction: 'receiving'
            });

            assert.strictEqual(transfer.direction, 'receiving');
            assert.strictEqual(transfer.state, 'active');
        });
    });

    describe('getTransfer', () => {
        it('should return transfer by fileId', () => {
            const transfer = store.createTransfer({
                revelnestId: 'peer123',
                fileName: 'test.txt',
                fileSize: 1024,
                mimeType: 'text/plain',
                direction: 'sending'
            });

            const retrieved = store.getTransfer(transfer.fileId);
            assert.deepStrictEqual(retrieved, transfer);
        });

        it('should return undefined for non-existent transfer', () => {
            const retrieved = store.getTransfer('non-existent-id');
            assert.strictEqual(retrieved, undefined);
        });
    });

    describe('updateTransfer', () => {
        it('should update transfer properties', () => {
            const transfer = store.createTransfer({
                revelnestId: 'peer123',
                fileName: 'test.txt',
                fileSize: 1024,
                mimeType: 'text/plain',
                direction: 'sending'
            });

            const newTime = Date.now() + 1000;
            const updated = store.updateTransfer(transfer.fileId, {
                state: 'completed',
                lastActivity: newTime
            });

            assert.strictEqual(updated, true);
            
            const retrieved = store.getTransfer(transfer.fileId);
            assert.strictEqual(retrieved?.state, 'completed');
            assert.strictEqual(retrieved?.lastActivity, newTime);
            // Other properties should remain unchanged
            assert.strictEqual(retrieved?.fileName, 'test.txt');
            assert.strictEqual(retrieved?.revelnestId, 'peer123');
        });

        it('should update Sets correctly', () => {
            const transfer = store.createTransfer({
                revelnestId: 'peer123',
                fileName: 'test.txt',
                fileSize: 1024,
                mimeType: 'text/plain',
                direction: 'sending'
            });

            const newChunksReceived = new Set([0, 1, 2]);
            const updated = store.updateTransfer(transfer.fileId, {
                chunksReceived: newChunksReceived
            });

            assert.strictEqual(updated, true);
            
            const retrieved = store.getTransfer(transfer.fileId);
            assert.strictEqual(retrieved?.chunksReceived, newChunksReceived);
            // Other Sets should remain as original empty Sets
            assert.strictEqual(retrieved?.chunksAcked.size, 0);
            assert.strictEqual(retrieved?.chunksSent.size, 0);
        });

        it('should return false for non-existent transfer', () => {
            const updated = store.updateTransfer('non-existent-id', {
                state: 'completed'
            });
            assert.strictEqual(updated, false);
        });
    });

    describe('getAllTransfers', () => {
        it('should return all transfers', () => {
            const transfer1 = store.createTransfer({
                revelnestId: 'peer1',
                fileName: 'test1.txt',
                fileSize: 1024,
                mimeType: 'text/plain',
                direction: 'sending'
            });

            const transfer2 = store.createTransfer({
                revelnestId: 'peer2',
                fileName: 'test2.txt',
                fileSize: 2048,
                mimeType: 'text/plain',
                direction: 'receiving'
            });

            const allTransfers = store.getAllTransfers();
            assert.strictEqual(allTransfers.length, 2);
            assert.ok(allTransfers.includes(transfer1));
            assert.ok(allTransfers.includes(transfer2));
        });

        it('should return empty array when no transfers', () => {
            const allTransfers = store.getAllTransfers();
            assert.deepStrictEqual(allTransfers, []);
        });
    });

    describe('getTransfersByState', () => {
        it('should filter transfers by state', () => {
            store.createTransfer({
                revelnestId: 'peer1',
                fileName: 'active.txt',
                fileSize: 1024,
                mimeType: 'text/plain',
                direction: 'sending'
            });

            const completedTransfer = store.createTransfer({
                revelnestId: 'peer2',
                fileName: 'completed.txt',
                fileSize: 2048,
                mimeType: 'text/plain',
                direction: 'receiving'
            });
            store.updateTransfer(completedTransfer.fileId, { state: 'completed' });

            const activeTransfers = store.getTransfersByState('active');
            const completedTransfers = store.getTransfersByState('completed');
            const pendingTransfers = store.getTransfersByState('pending');

            assert.strictEqual(activeTransfers.length, 1);
            assert.strictEqual(completedTransfers.length, 1);
            assert.strictEqual(pendingTransfers.length, 0);
        });
    });

    describe('getTransfersByPeer', () => {
        it('should filter transfers by peer ID', () => {
            store.createTransfer({
                revelnestId: 'peer1',
                fileName: 'test1.txt',
                fileSize: 1024,
                mimeType: 'text/plain',
                direction: 'sending'
            });

            store.createTransfer({
                revelnestId: 'peer2',
                fileName: 'test2.txt',
                fileSize: 2048,
                mimeType: 'text/plain',
                direction: 'receiving'
            });

            store.createTransfer({
                revelnestId: 'peer1',
                fileName: 'test3.txt',
                fileSize: 4096,
                mimeType: 'text/plain',
                direction: 'sending'
            });

            const peer1Transfers = store.getTransfersByPeer('peer1');
            const peer2Transfers = store.getTransfersByPeer('peer2');
            const peer3Transfers = store.getTransfersByPeer('peer3');

            assert.strictEqual(peer1Transfers.length, 2);
            assert.strictEqual(peer2Transfers.length, 1);
            assert.strictEqual(peer3Transfers.length, 0);
        });
    });

    describe('removeTransfer', () => {
        it('should remove transfer by fileId', () => {
            const transfer = store.createTransfer({
                revelnestId: 'peer123',
                fileName: 'test.txt',
                fileSize: 1024,
                mimeType: 'text/plain',
                direction: 'sending'
            });

            const removed = store.removeTransfer(transfer.fileId);
            assert.strictEqual(removed, true);
            
            const retrieved = store.getTransfer(transfer.fileId);
            assert.strictEqual(retrieved, undefined);
        });

        it('should return false for non-existent transfer', () => {
            const removed = store.removeTransfer('non-existent-id');
            assert.strictEqual(removed, false);
        });
    });

    describe('clearCompletedTransfers', () => {
        it('should remove completed, cancelled, and failed transfers', () => {
            const active = store.createTransfer({
                revelnestId: 'peer1',
                fileName: 'active.txt',
                fileSize: 1024,
                mimeType: 'text/plain',
                direction: 'sending'
            });

            const completed = store.createTransfer({
                revelnestId: 'peer2',
                fileName: 'completed.txt',
                fileSize: 2048,
                mimeType: 'text/plain',
                direction: 'receiving'
            });
            store.updateTransfer(completed.fileId, { state: 'completed' });

            const cancelled = store.createTransfer({
                revelnestId: 'peer3',
                fileName: 'cancelled.txt',
                fileSize: 4096,
                mimeType: 'text/plain',
                direction: 'sending'
            });
            store.updateTransfer(cancelled.fileId, { state: 'cancelled' });

            const failed = store.createTransfer({
                revelnestId: 'peer4',
                fileName: 'failed.txt',
                fileSize: 8192,
                mimeType: 'text/plain',
                direction: 'receiving'
            });
            store.updateTransfer(failed.fileId, { state: 'failed' });

            const removedCount = store.clearCompletedTransfers();
            assert.strictEqual(removedCount, 3);
            
            const remaining = store.getAllTransfers();
            assert.strictEqual(remaining.length, 1);
            assert.strictEqual(remaining[0].fileId, active.fileId);
        });
    });

    describe('getStats', () => {
        it('should return correct statistics', () => {
            // Create transfers with different states and directions
            store.createTransfer({
                revelnestId: 'peer1',
                fileName: 'active-sending.txt',
                fileSize: 1024,
                mimeType: 'text/plain',
                direction: 'sending'
            });

            const completedReceiving = store.createTransfer({
                revelnestId: 'peer2',
                fileName: 'completed-receiving.txt',
                fileSize: 2048,
                mimeType: 'text/plain',
                direction: 'receiving'
            });
            store.updateTransfer(completedReceiving.fileId, { state: 'completed' });

            const failedSending = store.createTransfer({
                revelnestId: 'peer3',
                fileName: 'failed-sending.txt',
                fileSize: 4096,
                mimeType: 'text/plain',
                direction: 'sending'
            });
            store.updateTransfer(failedSending.fileId, { state: 'failed' });

            const stats = store.getStats();
            
            assert.strictEqual(stats.total, 3);
            assert.strictEqual(stats.active, 1);
            assert.strictEqual(stats.pending, 0); // All transfers become active immediately
            assert.strictEqual(stats.completed, 1);
            assert.strictEqual(stats.failed, 1);
            assert.strictEqual(stats.cancelled, 0);
            assert.strictEqual(stats.sending, 2);
            assert.strictEqual(stats.receiving, 1);
        });
    });
});