import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProtocolHandler } from '../../../src/main_process/network/dht/kademlia/protocol.js';
import { RoutingTable } from '../../../src/main_process/network/dht/kademlia/routing.js';
import { ValueStore } from '../../../src/main_process/network/dht/kademlia/store.js';
import { toKademliaId } from '../../../src/main_process/network/dht/kademlia/types.js';

describe('Kademlia ProtocolHandler', () => {
    let handler: ProtocolHandler;
    let routingTable: RoutingTable;
    let valueStore: ValueStore;
    let mockSendMessage: any;
    const nodeId = Buffer.alloc(20, 1);
    const upeerId = '0123456789abcdef0123456789abcdef';

    beforeEach(() => {
        routingTable = new RoutingTable(nodeId);
        valueStore = new ValueStore();
        mockSendMessage = vi.fn();
        handler = new ProtocolHandler(
            nodeId,
            upeerId,
            routingTable,
            valueStore,
            mockSendMessage
        );
    });

    it('should handle DHT_PING', async () => {
        const sender = 'abcdefabcdef0123456789abcdef0123';
        const response = await handler.handleMessage(sender, { type: 'DHT_PING' }, '1.2.3.4');
        expect(response.type).toBe('DHT_PONG');
        expect(response.nodeId).toBe(nodeId.toString('hex'));

        // Should have added sender to routing table
        expect(routingTable.findContact(sender)).toBeDefined();
    });

    it('should handle DHT_STORE and save to ValueStore', async () => {
        const alice = '11112222333344445555666677778888';
        const data = {
            type: 'DHT_STORE',
            key: Buffer.alloc(20, 2).toString('hex'),
            value: 'secret-data',
            publisher: alice
        };

        const response = await handler.handleMessage(alice, data, '127.0.0.1');
        expect(response.type).toBe('DHT_STORE_ACK');

        const stored = valueStore.get(Buffer.alloc(20, 2));
        expect(stored?.value).toBe('secret-data');
    });

    it('should handle DHT_FIND_VALUE and return matching value', async () => {
        const bob = 'aaaabbbbccccddddeeeeffff00001111';
        const charlie = 'ffffeeeeaaaabbbbccccdddd22223333';
        const key = Buffer.alloc(20, 3);
        valueStore.set(key, 'found-me', bob);

        const data = {
            type: 'DHT_FIND_VALUE',
            key: key.toString('hex')
        };

        const response = await handler.handleMessage(charlie, data, '4.5.6.7');
        expect(response.type).toBe('DHT_FOUND_VALUE');
        expect(response.value).toBe('found-me');
    });

    it('should handle DHT_FIND_VALUE and return closest nodes if value not found', async () => {
        const peer1 = '00001111222233334444555566667777';
        const charlie = 'ffffeeeeaaaabbbbccccdddd22223333';
        const key = Buffer.alloc(20, 4);

        // Add some contacts to routing table
        const contact1 = {
            nodeId: Buffer.alloc(20, 5),
            upeerId: peer1,
            address: '1.1.1.1',
            publicKey: 'pub1',
            lastSeen: Date.now()
        };
        routingTable.addContact(contact1);

        const data = {
            type: 'DHT_FIND_VALUE',
            key: key.toString('hex')
        };

        const response = await handler.handleMessage(charlie, data, '4.5.6.7');
        expect(response.type).toBe('DHT_FOUND_NODES');
        expect(response.nodes.length).toBeGreaterThan(0);
        expect(response.nodes[0].upeerId).toBe(peer1);
    });

    it('should update lastSeen and LRU position on every message', async () => {
        const senderId = 'abcdeabcdeabcdeabcdeabcdeabcde11';
        const contact = {
            nodeId: toKademliaId(senderId),
            upeerId: senderId,
            address: '1.1.1.1',
            publicKey: 'pub1',
            lastSeen: Date.now() - 10000
        };
        routingTable.addContact(contact);

        const initialContact = routingTable.findContact(senderId);
        const initialLastSeen = initialContact?.lastSeen;
        expect(initialLastSeen).toBeDefined();

        await handler.handleMessage(senderId, { type: 'DHT_PING' }, '1.1.1.1');

        const updatedContact = routingTable.findContact(senderId);
        expect(updatedContact?.lastSeen).toBeGreaterThan(initialLastSeen!);
    });
});
