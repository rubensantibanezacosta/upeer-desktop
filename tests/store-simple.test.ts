import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { FileTransferStore } from '../src/main_process/network/file-transfer/transfer-store.js';

describe('FileTransferStore simple', () => {
    let store: FileTransferStore;

    beforeEach(() => {
        store = new FileTransferStore();
    });

    afterEach(() => {
        store.clear();
    });

    it('should create a transfer', () => {
        const transfer = store.createTransfer({
            upeerId: 'peer123',
            peerAddress: '200::1',
            fileName: 'test.txt',
            fileSize: 1024,
            mimeType: 'text/plain',
            totalChunks: 1,
            chunkSize: 65536,
            fileHash: '0'.repeat(64),
            direction: 'sending'
        });
        assert.ok(transfer.fileId);
        assert.strictEqual(transfer.state, 'pending');
    });
});
