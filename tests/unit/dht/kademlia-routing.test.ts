import { describe, it, expect, beforeEach } from 'vitest';
import { RoutingTable } from '../../../src/main_process/network/dht/kademlia/routing.js';
import { toKademliaId, type KademliaContact } from '../../../src/main_process/network/dht/kademlia/types.js';

function createContact(upeerId: string, address: string, publicKey: string, lastSeen = Date.now()): KademliaContact {
    return {
        upeerId,
        nodeId: toKademliaId(upeerId),
        address,
        lastSeen,
        publicKey,
    };
}

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
        const contact = createContact(contactUpeerId, '2001:db8::1', 'pk1');

        const added = routingTable.addContact(contact);
        expect(added).toBe(true);
        expect(routingTable.getContactCount()).toBe(1);

        const found = routingTable.findContact(contactUpeerId);
        expect(found).not.toBeNull();
        expect(found?.upeerId).toBe(contactUpeerId);
    });

    it('should not add ourselves', () => {
        const myself: KademliaContact = {
            upeerId: myUpeerId,
            nodeId: myNodeId,
            address: '2001:db8::1',
            lastSeen: Date.now(),
            publicKey: 'pk-me'
        };

        const added = routingTable.addContact(myself);
        expect(added).toBe(false);
        expect(routingTable.getContactCount()).toBe(0);
    });

    it('should remove a contact correctly', () => {
        const contactUpeerId = 'ffffffffffffffffffffffffffffffff';
        const contact = createContact(contactUpeerId, '2001:db8::1', 'pk1');

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

        const contactClose = createContact(closeId, '::1', 'pk1');

        const contactFar = createContact(farId, '::2', 'pk2');

        routingTable.addContact(contactFar);
        routingTable.addContact(contactClose);

        const closest = routingTable.findClosestContacts(targetId, 1);

        expect(closest).toHaveLength(1);
        expect(closest[0].upeerId).toBe(closeId);
    });

    it('should identify stale buckets for refresh', () => {
        const stale = routingTable.refreshStaleBuckets();
        expect(Array.isArray(stale)).toBe(true);
    });

    it('should return all contacts', () => {
        const c1 = createContact('aaaa', '::1', 'pk-a', 0);
        const c2 = createContact('bbbb', '::2', 'pk-b', 0);

        routingTable.addContact(c1);
        routingTable.addContact(c2);

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
