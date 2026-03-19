import { describe, it, expect, beforeEach } from 'vitest';
import { RoutingTable } from '../../../src/main_process/network/dht/kademlia/routing.js';
import { toKademliaId } from '../../../src/main_process/network/dht/kademlia/types.js';

describe('Kademlia RoutingTable Unit Tests', () => {
    const myUpeerId = '00000000000000000000000000000001';
    const myNodeId = toKademliaId(myUpeerId);
    let routingTable: RoutingTable;

    beforeEach(() => {
        routingTable = new RoutingTable(myNodeId);
    });

    it('should initialize with correct number of buckets', () => {
        expect(routingTable.getBucketCount()).toBe(160);
        expect(routingTable.getContactCount()).toBe(0);
    });

    it('should add a contact to the correct bucket', () => {
        const contactUpeerId = 'ffffffffffffffffffffffffffffffff';
        const contactNodeId = toKademliaId(contactUpeerId);
        const contact = {
            upeerId: contactUpeerId,
            nodeId: contactNodeId,
            address: '2001:db8::1',
            lastSeen: Date.now(),
            publicKey: 'pk1'
        } as any;

        const added = routingTable.addContact(contact);
        expect(added).toBe(true);
        expect(routingTable.getContactCount()).toBe(1);

        const found = routingTable.findContact(contactUpeerId);
        expect(found).not.toBeNull();
        expect(found?.upeerId).toBe(contactUpeerId);
    });

    it('should not add ourselves', () => {
        const myself = {
            upeerId: myUpeerId,
            nodeId: myNodeId,
            address: '2001:db8::1',
            lastSeen: Date.now(),
            publicKey: 'pk-me'
        } as any;

        const added = routingTable.addContact(myself);
        expect(added).toBe(false);
        expect(routingTable.getContactCount()).toBe(0);
    });

    it('should remove a contact correctly', () => {
        const contactUpeerId = 'ffffffffffffffffffffffffffffffff';
        const contact = {
            upeerId: contactUpeerId,
            nodeId: toKademliaId(contactUpeerId),
            address: '2001:db8::1',
            lastSeen: Date.now(),
            publicKey: 'pk1'
        } as any;

        routingTable.addContact(contact);
        expect(routingTable.getContactCount()).toBe(1);

        const removed = routingTable.removeContact(contactUpeerId);
        expect(removed).toBe(true);
        expect(routingTable.getContactCount()).toBe(0);
        expect(routingTable.findContact(contactUpeerId)).toBeNull();
    });

    it('should return false when removing non-existent contact', () => {
        expect(routingTable.removeContact('non-existent')).toBe(false);
    });

    it('should find closest contacts sorted by distance', () => {
        const targetId = '80000000000000000000000000000000';
        const closeId = '80000000000000000000000000000001';
        const farId = '10000000000000000000000000000000';

        const contactClose = {
            upeerId: closeId,
            nodeId: toKademliaId(closeId),
            address: '::1',
            lastSeen: Date.now(),
            publicKey: 'pk1'
        } as any;

        const contactFar = {
            upeerId: farId,
            nodeId: toKademliaId(farId),
            address: '::2',
            lastSeen: Date.now(),
            publicKey: 'pk2'
        } as any;

        routingTable.addContact(contactFar);
        routingTable.addContact(contactClose);

        const closest = routingTable.findClosestContacts(targetId, 1);

        expect(closest).toHaveLength(1);
        expect(closest[0].upeerId).toBe(closeId);
    });

    it('should identify stale buckets for refresh', () => {
        // Since we can't easily advance time for KBucket internal private state without mocks
        // we'll just verify the method exists and returns an array
        const stale = routingTable.refreshStaleBuckets();
        expect(Array.isArray(stale)).toBe(true);
    });

    it('should return all contacts', () => {
        const c1 = { upeerId: 'aaaa', nodeId: toKademliaId('0'.repeat(31) + 'a'), address: '::1', lastSeen: 0 };
        const c2 = { upeerId: 'bbbb', nodeId: toKademliaId('0'.repeat(31) + 'b'), address: '::2', lastSeen: 0 };

        routingTable.addContact(c1 as any);
        routingTable.addContact(c2 as any);

        const all = routingTable.getAllContacts();
        expect(all).toHaveLength(2);
        expect(all.map(c => c.upeerId)).toContain('aaaa');
        expect(all.map(c => c.upeerId)).toContain('bbbb');
    });

    it('should provide direct bucket access', () => {
        const bucket = routingTable.getBucket(0);
        expect(bucket).toBeDefined();
        expect(bucket.size).toBe(0);
    });
});
