import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProtocolHandler } from '../../../src/main_process/network/dht/kademlia/protocol.js';
import { RoutingTable } from '../../../src/main_process/network/dht/kademlia/routing.js';
import { ValueStore } from '../../../src/main_process/network/dht/kademlia/store.js';
import { toKademliaId } from '../../../src/main_process/network/dht/kademlia/types.js';
import {
    getLocationStatusSnapshot,
    resetLocationStatus,
} from '../../../src/main_process/network/locationStatus.js';

type SendMessage = ConstructorParameters<typeof ProtocolHandler>[4];

const UPEER_ID = '0123456789abcdef0123456789abcdef';

const createHandler = () => {
    const nodeId = toKademliaId(UPEER_ID);
    const routingTable = new RoutingTable(nodeId);
    const valueStore = new ValueStore();
    const sendMessage = vi.fn() as unknown as SendMessage;
    const handler = new ProtocolHandler(nodeId, UPEER_ID, routingTable, valueStore, sendMessage);
    return { handler, routingTable, sendMessage };
};

describe('locationStatus wiring', () => {
    beforeEach(() => {
        resetLocationStatus();
    });

    afterEach(() => {
        resetLocationStatus();
    });

    it('cuenta un ACK solo cuando corresponde a la clave propia', async () => {
        const { handler } = createHandler();
        const ownKey = toKademliaId(UPEER_ID).toString('hex');

        await handler.handleMessage('a'.repeat(32), { type: 'DHT_STORE_ACK', key: 'b'.repeat(40) }, '1.2.3.4');
        expect(getLocationStatusSnapshot().storeAcks).toBe(0);

        await handler.handleMessage('a'.repeat(32), { type: 'DHT_STORE_ACK', key: ownKey }, '1.2.3.4');
        await handler.handleMessage('a'.repeat(32), { type: 'DHT_STORE_ACK', key: ownKey }, '1.2.3.5');
        expect(getLocationStatusSnapshot().storeAcks).toBe(2);
    });

    it('devuelve el número de nodos a los que se envió el valor', async () => {
        const { handler, routingTable, sendMessage } = createHandler();
        routingTable.addContact({
            upeerId: 'c'.repeat(32),
            address: '1.2.3.4',
            publicKey: 'pk1',
            nodeId: toKademliaId('c'.repeat(32)),
            lastSeen: Date.now(),
        });

        const sent = await handler.storeValue(Buffer.alloc(20, 9), { cualquier: 'cosa' }, UPEER_ID);
        expect(sent).toBe(1);
        expect(sendMessage).toHaveBeenCalledTimes(1);
    });
});
