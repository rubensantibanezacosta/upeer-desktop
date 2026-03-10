import { describe, it } from 'node:test';
import assert from 'node:assert';
import { ErasureCoder } from '../src/main_process/network/vault/redundancy/erasure.js';

describe('ErasureCoder Unit Tests', () => {
    it('should encode and decode correctly with perfect conditions', () => {
        const coder = new ErasureCoder(4, 2); // 4 data, 2 parity
        const originalData = Buffer.from('HelloWorld! Testing Erasure Coding.');
        const originalSize = originalData.length;

        const shards = coder.encode(originalData);
        assert.strictEqual(shards.length, 6);

        // Take only the first 4 shards (perfect case)
        const recovered = coder.decode([
            { index: 0, data: shards[0] },
            { index: 1, data: shards[1] },
            { index: 2, data: shards[2] },
            { index: 3, data: shards[3] }
        ], originalSize);

        assert.strictEqual(recovered?.toString(), originalData.toString());
    });

    it('should reconstruct data with lost original shards (using parity)', () => {
        const coder = new ErasureCoder(4, 2);
        const originalData = Buffer.from('This is some resilient data that survives shard loss!');
        const originalSize = originalData.length;

        const shards = coder.encode(originalData);

        // Lose shards 0 and 2, but use parity shards 4 and 5
        const availableShards = [
            { index: 1, data: shards[1] },
            { index: 3, data: shards[3] },
            { index: 4, data: shards[4] },
            { index: 5, data: shards[5] }
        ];

        const recovered = coder.decode(availableShards, originalSize);
        assert.strictEqual(recovered?.toString(), originalData.toString());
    });

    it('should fail if insufficient shards are provided', () => {
        const coder = new ErasureCoder(4, 2);
        const originalData = Buffer.from('Low redundancy test');
        const originalSize = originalData.length;

        const shards = coder.encode(originalData);

        // Only 3 shards (needs 4)
        const recovered = coder.decode([
            { index: 0, data: shards[0] },
            { index: 1, data: shards[1] },
            { index: 4, data: shards[4] }
        ], originalSize);

        assert.strictEqual(recovered, null);
    });

    it('should handle small data (less than k bytes)', () => {
        const coder = new ErasureCoder(4, 8);
        const originalData = Buffer.from('Hi');
        const originalSize = originalData.length;

        const shards = coder.encode(originalData);

        // Recover using only parity shards
        const recovered = coder.decode([
            { index: 8, data: shards[8] },
            { index: 9, data: shards[9] },
            { index: 10, data: shards[10] },
            { index: 11, data: shards[11] }
        ], originalSize);

        assert.strictEqual(recovered?.toString(), 'Hi');
    });
});
