import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ProtocolHandler } from '../../../src/main_process/network/dht/kademlia/protocol.js';
import { RoutingTable } from '../../../src/main_process/network/dht/kademlia/routing.js';
import { ValueStore } from '../../../src/main_process/network/dht/kademlia/store.js';
import { pendingQueries } from '../../../src/main_process/network/dht/handlers.js';

describe('Kademlia ProtocolHandler - Edge Cases & Robustness', () => {
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
        pendingQueries.clear();
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    describe('handleMessage - Corner Cases', () => {
        it('should handle unknown message types gracefully', async () => {
            const sender = 's'.repeat(32);
            const result = await handler.handleMessage(sender, { type: 'UNKNOWN_DHT_MSG' }, '1.2.3.4');
            expect(result).toBeNull();
            // Should still update/add the sender to routing table
            expect(routingTable.findContact(sender)).toBeDefined();
        });

        it('should handle DHT_PONG and DHT_STORE_ACK by returning null (already handled by update)', async () => {
            const resultPong = await handler.handleMessage('s1'.repeat(16), { type: 'DHT_PONG' }, '1.2.3.4');
            const resultAck = await handler.handleMessage('s2'.repeat(16), { type: 'DHT_STORE_ACK' }, '1.2.3.4');
            expect(resultPong).toBeNull();
            expect(resultAck).toBeNull();
        });

        it('should handle DHT_FIND_NODE with queryId', async () => {
            const targetId = Buffer.alloc(20, 99).toString('hex');
            const result = await handler.handleMessage('s'.repeat(32), {
                type: 'DHT_FIND_NODE',
                targetId,
                queryId: 'q-123'
            }, '1.1.1.1');
            expect(result.type).toBe('DHT_FOUND_NODES');
            expect(result.queryId).toBe('q-123');
        });
    });

    describe('Value Replication (storeValue)', () => {
        it('should replicate value to K closest nodes (excluding self)', async () => {
            const key = Buffer.alloc(20, 0xAA);
            const value = { data: 'replicate-me' };
            const publisher = 'alice';

            // Add some contacts
            for (let i = 0; i < 5; i++) {
                routingTable.addContact({
                    nodeId: Buffer.alloc(20, i + 10),
                    upeerId: `peer-${i}`,
                    address: `1.2.3.${i}`,
                    publicKey: `pk-${i}`,
                    lastSeen: Date.now()
                });
            }

            await handler.storeValue(key, value, publisher, 'sig-123');

            // Check that it tried to send to closest contacts
            // K is usually 20, we have 5 contacts. Should send to all 5.
            expect(mockSendMessage).toHaveBeenCalledTimes(5);
            expect(mockSendMessage).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
                type: 'DHT_STORE',
                key: key.toString('hex'),
                value,
                publisher,
                signature: 'sig-123'
            }));
        });

        it('should handle send failures during replication gracefully', async () => {
            routingTable.addContact({
                nodeId: Buffer.alloc(20, 5),
                upeerId: 'p1',
                address: '1.2.3.4',
                publicKey: 'pk',
                lastSeen: Date.now()
            });

            mockSendMessage.mockImplementation(() => { throw new Error('Network Down'); });

            // Should not throw
            await expect(handler.storeValue(Buffer.alloc(20, 1), 'val', 'pub')).resolves.not.toThrow();
        });
    });

    describe('Distributed Search (findValue)', () => {
        it('should return null if no contacts available to query', async () => {
            const result = await handler.findValue(Buffer.alloc(20, 1));
            expect(result).toBeNull();
        });

        it('should query ALPHA contacts in parallel and return first found value', async () => {
            const key = Buffer.alloc(20, 0xBB);

            // Add 1 node (ALPHA = 3)
            routingTable.addContact({
                nodeId: Buffer.alloc(20, 50),
                upeerId: `p-0`,
                address: `addr-0`,
                publicKey: `pk-0`,
                lastSeen: Date.now()
            });

            const findPromise = handler.findValue(key);

            // Wait a tiny bit for the queries to be sent and recorded in pendingQueries
            await vi.advanceTimersByTimeAsync(1);

            // Check that 1 query was sent (only have 1 contact)
            expect(mockSendMessage).toHaveBeenCalledTimes(1);

            // Simulate one response
            const queryIds = Array.from(pendingQueries.keys());
            const firstQueryId = queryIds[0];
            const pending = pendingQueries.get(firstQueryId);
            pending?.resolve({ value: 'found-it', publisher: 'p-0' });

            // We need to advance timers again to let the promise resolve 
            // if it's trapped in any await
            await vi.advanceTimersByTimeAsync(1);

            const result = await findPromise;
            expect(result.value).toBe('found-it');
        });

        it('should handle timeouts and failures in findValue', async () => {
            const key = Buffer.alloc(20, 0xCC);
            routingTable.addContact({
                nodeId: Buffer.alloc(20, 60),
                upeerId: 'p1',
                address: 'addr1',
                publicKey: 'pk1',
                lastSeen: Date.now()
            });

            const findPromise = handler.findValue(key);

            // Travel in time to trigger timeout
            await vi.advanceTimersByTimeAsync(5001);

            const result = await findPromise;
            expect(result).toBeNull();

            // The cleanup in handler.ts handles the deletion after timeout/reject.
            // If it's still 1, we might need to manually trigger the rejection or 
            // check why it's not being deleted.
            expect(pendingQueries.size).toBe(0);
        });

        it('should return null if all contacts return null/no value', async () => {
            const key = Buffer.alloc(20, 0xDD);
            routingTable.addContact({
                nodeId: Buffer.alloc(20, 70),
                upeerId: 'p1',
                address: 'addr1',
                publicKey: 'pk1',
                lastSeen: Date.now()
            });

            const findPromise = handler.findValue(key);

            const queryId = Array.from(pendingQueries.keys())[0];
            pendingQueries.get(queryId)?.resolve(null);

            const result = await findPromise;
            expect(result).toBeNull();
        });
    });

    describe('Stats', () => {
        it('should track messages received and sent', async () => {
            // Receive a ping (Sent response: 1, Received: 1)
            // handleMessage will trigger update (Received++) and handlePing (Sent++)
            await handler.handleMessage('s1-id'.repeat(4), { type: 'DHT_PING' }, '1.1.1.1');

            // Add a contact to enable replication
            routingTable.addContact({
                nodeId: Buffer.alloc(20, 80),
                upeerId: 'p-remote-id'.repeat(2),
                address: 'remote-addr',
                publicKey: 'pk',
                lastSeen: Date.now()
            });

            // Replicate value to 1 contact (Sent: 1 more)
            await handler.storeValue(Buffer.alloc(20, 1), 'val', 'pub');

            // Find value (Sent: 1 more)
            const _findPromise = handler.findValue(Buffer.alloc(20, 99));
            await vi.advanceTimersByTimeAsync(1);

            const stats = handler.getStats();
            expect(stats.messagesReceived).toBe(1);
            expect(stats.messagesSent).toBe(4); // ping response (1) + store replication (1) + findValue query (1) + PONG(1)
        });
    });
});
