import { describe, it, expect, vi } from 'vitest';
import { ErasureCoder } from '../../../src/main_process/network/vault/redundancy/erasure.js';

vi.mock('../../../src/main_process/security/secure-logger.js', () => ({
    error: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
}));

describe('ErasureCoder Unit Tests', () => {
    const k = 4;
    const m = 2; // Reduced for faster testing
    const coder = new ErasureCoder(k, m);

    it('should encode data into k + m shards', () => {
        const data = Buffer.from('this is a test message to encode');
        const shards = coder.encode(data);

        expect(shards.length).toBe(k + m);
        expect(shards[0].length).toBe(Math.ceil(data.length / k));
    });

    it('should reconstruct data with 0 losses', () => {
        const data = Buffer.from('reconstruct this data please');
        const shards = coder.encode(data);

        const received = shards.map((d, i) => ({ index: i, data: d }));
        const reconstructed = coder.decode(received, data.length);

        expect(reconstructed?.toString()).toBe(data.toString());
    });

    it('should reconstruct data with exactly k shards (m losses)', () => {
        const data = Buffer.from('reconstruct matching k shards');
        const shards = coder.encode(data);

        // Pick only the first k shards (original data shards)
        const received = shards.slice(0, k).map((d, i) => ({ index: i, data: d }));
        const reconstructed = coder.decode(received, data.length);

        expect(reconstructed?.toString()).toBe(data.toString());
    });

    it('should reconstruct data using only parity shards (k losses)', () => {
        const data = Buffer.from('reconstruct using only parity shards');
        const coder2 = new ErasureCoder(2, 2);
        const shards = coder2.encode(data);

        // Pick only parity shards (indices 2 and 3)
        const received = [
            { index: 2, data: shards[2] },
            { index: 3, data: shards[3] }
        ];
        const reconstructed = coder2.decode(received, data.length);

        expect(reconstructed?.toString()).toBe(data.toString());
    });

    it('should reconstruct data with mixed shards (partial losses)', () => {
        const data = Buffer.from('mixed shards reconstruction test');
        const shards = coder.encode(data);

        // Loss: shard 1 and 3 are missing. k=4.
        const received = [
            { index: 0, data: shards[0] },
            { index: 2, data: shards[2] },
            { index: 4, data: shards[4] },
            { index: 5, data: shards[5] }
        ];
        const reconstructed = coder.decode(received, data.length);

        expect(reconstructed?.toString()).toBe(data.toString());
    });

    it('should fail if less than k shards are provided', () => {
        const data = Buffer.from('insufficient shards');
        const shards = coder.encode(data);

        // Only k-1 shards
        const received = shards.slice(0, k - 1).map((d, i) => ({ index: i, data: d }));
        const reconstructed = coder.decode(received, data.length);

        expect(reconstructed).toBeNull();
    });

    it('should handle data size not multiple of k (padding test)', () => {
        const data = Buffer.from('padding'); // 7 bytes, k=4
        const shards = coder.encode(data);

        expect(shards[0].length).toBe(2); // ceil(7/4) = 2

        const reconstructed = coder.decode(shards.slice(0, k).map((d, i) => ({ index: i, data: d })), data.length);
        expect(reconstructed?.length).toBe(7);
        expect(reconstructed?.toString()).toBe('padding');
    });

    it('should throw error if total shards > 256', () => {
        expect(() => new ErasureCoder(200, 100)).toThrow('Total shards cannot exceed 256');
    });
});
