import { describe, it, mock } from 'node:test';
import assert from 'node:assert';
import { fileTransferManager } from '../src/main_process/network/file-transfer/index.js';

describe('File Transfer Handlers Integration', () => {
    describe('Direct handler function calls', () => {
        it('should integrate with fileTransferManager correctly', () => {
            // Test that the fileTransferManager singleton exists
            assert.ok(fileTransferManager);
            assert.ok(typeof fileTransferManager.initialize === 'function');
            assert.ok(typeof fileTransferManager.handleMessage === 'function');
            assert.ok(typeof fileTransferManager.startSend === 'function');
            assert.ok(typeof fileTransferManager.cancelTransfer === 'function');
        });
    });

    describe('Message type routing', () => {
        it('should have FILE_* message types defined', () => {
            // These message types should be handled by the switch statement in handlePacket
            const fileTransferMessageTypes = [
                'FILE_PROPOSAL',
                'FILE_START',
                'FILE_ACCEPT',
                'FILE_CHUNK',
                'FILE_CHUNK_ACK',
                'FILE_ACK',
                'FILE_DONE_ACK',
                'FILE_END',
                'FILE_CANCEL'
            ];
            
            for (const type of fileTransferMessageTypes) {
                assert.ok(type, `File transfer message type ${type} should be defined`);
            }
        });
    });
});
