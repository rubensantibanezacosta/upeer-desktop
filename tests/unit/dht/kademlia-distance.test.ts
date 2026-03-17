import { describe, it, expect } from 'vitest';
import { xorDistance, compareDistance, getBucketIndex } from '../../../src/main_process/network/dht/kademlia/distance.js';

describe('Kademlia Distance Logic', () => {
    const id1 = Buffer.from('a'.repeat(32)); // 32 bytes ID
    const id2 = Buffer.from('b'.repeat(32));
    const target = Buffer.from('c'.repeat(32));

    it('should calculate XOR distance correctly', () => {
        const dist = xorDistance(id1, id2);
        expect(dist.length).toBe(32);
        // 'a' ^ 'b' = 0x61 ^ 0x62 = 0x03
        expect(dist[0]).toBe(0x03);
    });

    it('should compare distances correctly', () => {
        const near = Buffer.from('c'.repeat(31) + 'd'); // 0x63 ^ 0x64 = 0x07
        const far = Buffer.from('d'.repeat(32));         // 0x63 ^ 0x64 = 0x07 at start
        
        // El que tiene la diferencia en el último byte es más cercano que el que la tiene en el primero
        expect(compareDistance(near, far, target)).toBe(-1); 
    });

    it('should handle zero distance', () => {
        expect(compareDistance(target, target, target)).toBe(0);
    });

    describe('getBucketIndex', () => {
        const myNodeId = Buffer.alloc(32, 0); // Node 0

        it('should return 0 for first bit difference', () => {
            const other = Buffer.alloc(32, 0);
            other[0] = 0x80; // Binary 1000 0000
            expect(getBucketIndex(myNodeId, other)).toBe(0);
        });

        it('should return 7 for 8th bit difference', () => {
            const other = Buffer.alloc(32, 0);
            other[0] = 0x01; // Binary 0000 0001
            expect(getBucketIndex(myNodeId, other)).toBe(7);
        });

        it('should return 8 for 9th bit difference', () => {
            const other = Buffer.alloc(32, 0);
            other[1] = 0x80; 
            expect(getBucketIndex(myNodeId, other)).toBe(8);
        });

        it('should return 159 for same ID (last bucket)', () => {
            expect(getBucketIndex(myNodeId, myNodeId)).toBe(159);
        });
    });
});
