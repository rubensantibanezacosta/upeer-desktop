import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProtocolHandler } from '../../../src/main_process/network/dht/kademlia/protocol.js';
import { RoutingTable } from '../../../src/main_process/network/dht/kademlia/routing.js';
import { ValueStore } from '../../../src/main_process/network/dht/kademlia/store.js';
import { toKademliaId } from '../../../src/main_process/network/dht/kademlia/types.js';

type SendMessage = ConstructorParameters<typeof ProtocolHandler>[4];

describe('Kademlia ProtocolHandler', () => {
    let handler: ProtocolHandler;
    let routingTable: RoutingTable;
    let valueStore: ValueStore;
    let mockSendMessage: SendMessage;
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
        expect(response).not.toBeNull();
        if (!response) return;
        expect(response.type).toBe('DHT_PONG');
        if (response.type !== 'DHT_PONG') return;
        expect(response.nodeId).toBe(nodeId.toString('hex'));

        expect(routingTable.findContact(sender)).toBeDefined();
    });

    it('should handle DHT_STORE and save to ValueStore', async () => {
        const alice = '11112222333344445555666677778888';
        const data = {
            type: 'DHT_STORE',
            key: Buffer.alloc(20, 2).toString('hex'),
            value: 'secret-data',
            publisher: alice,
            timestamp: Date.now(),
        } as const;

        const response = await handler.handleMessage(alice, data, '127.0.0.1');
        expect(response).not.toBeNull();
        if (!response) return;
        expect(response.type).toBe('DHT_STORE_ACK');

        const stored = valueStore.get(Buffer.alloc(20, 2));
        expect(stored?.value).toBe('secret-data');
    });

    it('should handle DHT_FIND_VALUE and return matching value', async () => {
        const bob = 'aaaabbbbccccddddeeeeffff00001111';
        const charlie = 'ffffeeeeaaaabbbbccccdddd22223333';
        const key = Buffer.alloc(20, 3);
        valueStore.set(key, 'found-me', bob);

        const response = await handler.handleMessage(charlie, {
            type: 'DHT_FIND_VALUE',
            key: key.toString('hex'),
            queryId: 'q1',
        }, '4.5.6.7');
        expect(response).not.toBeNull();
        if (!response) return;
        expect(response.type).toBe('DHT_FOUND_VALUE');
        if (response.type !== 'DHT_FOUND_VALUE') return;
        expect(response.value).toBe('found-me');
    });

    it('should handle DHT_FIND_VALUE and return closest nodes if value not found', async () => {
        const peer1 = '00001111222233334444555566667777';
        const charlie = 'ffffeeeeaaaabbbbccccdddd22223333';
        const key = Buffer.alloc(20, 4);

        routingTable.addContact({
            nodeId: Buffer.alloc(20, 5),
            upeerId: peer1,
            address: '1.1.1.1',
            publicKey: 'pub1',
            lastSeen: Date.now()
        });

        const response = await handler.handleMessage(charlie, {
            type: 'DHT_FIND_VALUE',
            key: key.toString('hex'),
            queryId: 'q2',
        }, '4.5.6.7');
        expect(response).not.toBeNull();
        if (!response) return;
        expect(response.type).toBe('DHT_FOUND_NODES');
        if (response.type !== 'DHT_FOUND_NODES') return;
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
        expect(updatedContact?.lastSeen).toBeGreaterThan(initialLastSeen ?? 0);
    });

    it('should handle DHT_STORE with replication', async () => {
        const key = Buffer.alloc(20, 10);
        const alice = 'aliceAliceAliceAliceAliceAlice0';
        const bob = 'bobBobBobBobBobBobBobBobBobBo0';

        routingTable.addContact({
            nodeId: Buffer.alloc(20, 11),
            upeerId: bob,
            address: '2.2.2.2',
            publicKey: 'pub-bob',
            lastSeen: Date.now()
        });

        await handler.storeValue(key, 'replicated-data', alice);

        expect(mockSendMessage).toHaveBeenCalledWith('2.2.2.2', expect.objectContaining({
            type: 'DHT_STORE',
            value: 'replicated-data',
            publisher: alice
        }));
    });

    it('should handle unknown message types gracefully', async () => {
        const response = await handler.handleMessage('sender', { type: 'UNKNOWN' } as never, '1.1.1.1');
        expect(response).toBeNull();
    });

    it('should include queryId in responses if provided', async () => {
        const qId = 'query-123';
        const key = Buffer.alloc(20, 12).toString('hex');

        const resNode = await handler.handleMessage('sender', { type: 'DHT_FIND_NODE', targetId: key, queryId: qId }, '1.1.1.1');
        expect(resNode).not.toBeNull();
        if (!resNode) return;
        expect(resNode.queryId).toBe(qId);

        valueStore.set(Buffer.from(key, 'hex'), 'val', 'pub');
        const resVal = await handler.handleMessage('sender', { type: 'DHT_FIND_VALUE', key, queryId: qId }, '1.1.1.1');
        expect(resVal).not.toBeNull();
        if (!resVal) return;
        expect(resVal.queryId).toBe(qId);
    });

    it('should handle findValue locally and remotely', async () => {
        const key = Buffer.alloc(20, 15);

        valueStore.set(key, 'local-val', 'me');
        const localRes = await handler.findValue(key);
        expect(localRes).not.toBeNull();
        if (!localRes) return;
        expect(localRes.value).toBe('local-val');

        const remoteKey = Buffer.alloc(20, 16);
        routingTable.addContact({
            nodeId: Buffer.alloc(20, 17),
            upeerId: 'remote-peer',
            address: '3.3.3.3',
            publicKey: 'pub',
            lastSeen: Date.now()
        });

        void handler.findValue(remoteKey);

        expect(mockSendMessage).toHaveBeenCalledWith('3.3.3.3', expect.objectContaining({
            type: 'DHT_FIND_VALUE',
            key: remoteKey.toString('hex')
        }));
    });
});