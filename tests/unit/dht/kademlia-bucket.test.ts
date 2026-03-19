import { describe, it, expect, beforeEach } from 'vitest';
import { KBucket } from '../../../src/main_process/network/dht/kademlia/kbucket.js';

describe('Kademlia KBucket Tests', () => {
    let bucket: KBucket;
    const K_SIZE = 4;

    beforeEach(() => {
        bucket = new KBucket(K_SIZE);
    });

    it('should add contacts correctly', () => {
        const contact = {
            upeerId: 'id1',
            nodeId: Buffer.alloc(32, 1),
            address: '127.0.0.1:1',
            publicKey: 'pk1',
            lastSeen: Date.now()
        };
        bucket.add(contact);
        expect(bucket.size).toBe(1);
    });

    it('should move existing contacts to the end (LRU)', () => {
        const c1 = {
            upeerId: 'id1',
            nodeId: Buffer.alloc(32, 1),
            address: '',
            publicKey: 'pk1',
            lastSeen: Date.now()
        };
        const c2 = {
            upeerId: 'id2',
            nodeId: Buffer.alloc(32, 2),
            address: '',
            publicKey: 'pk2',
            lastSeen: Date.now()
        };
        bucket.add(c1);
        bucket.add(c2);

        // Re-añadir c1 debería moverlo al final
        bucket.add(c1);
        const all = bucket.all;
        expect(all[0].upeerId).toBe('id2');
        expect(all[1].upeerId).toBe('id1');
    });

    it('should evict the oldest contact when full', () => {
        for (let i = 1; i <= K_SIZE; i++) {
            bucket.add({
                upeerId: `id${i}`,
                nodeId: Buffer.alloc(32, i),
                address: '',
                publicKey: `pk${i}`,
                lastSeen: Date.now()
            });
        }
        expect(bucket.size).toBe(K_SIZE);

        // Añadir uno nuevo debería eliminar id1 (el más antiguo)
        bucket.add({
            upeerId: 'new-id',
            nodeId: Buffer.alloc(32, 99),
            address: '',
            publicKey: 'pk-new',
            lastSeen: Date.now()
        });
        expect(bucket.size).toBe(K_SIZE);
        expect(bucket.all.find(c => c.upeerId === 'id1')).toBeUndefined();
        expect(bucket.all[K_SIZE - 1].upeerId).toBe('new-id');
    });

    it('should find closest contacts to a target', () => {
        const target = Buffer.alloc(32, 10);
        // c1 es el más cercano al target 10
        const c1 = {
            upeerId: 'near',
            nodeId: Buffer.alloc(32, 11),
            address: '',
            publicKey: 'pk-near',
            lastSeen: Date.now()
        };
        const c2 = {
            upeerId: 'far',
            nodeId: Buffer.alloc(32, 20),
            address: '',
            publicKey: 'pk-far',
            lastSeen: Date.now()
        };

        bucket.add(c2);
        bucket.add(c1);

        const closest = bucket.findClosest(target, 1);
        expect(closest[0].upeerId).toBe('near');
    });

    it('should remove contacts by upeerId', () => {
        bucket.add({
            upeerId: 'rm-me',
            nodeId: Buffer.alloc(32, 1),
            address: '',
            publicKey: 'pk-rm',
            lastSeen: Date.now()
        });
        expect(bucket.size).toBe(1);
        bucket.remove('rm-me');
        expect(bucket.size).toBe(0);
    });
});
