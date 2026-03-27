import { RoutingTable } from './routing.js';
import { ValueStore } from './store.js';
import type { KademliaContact, StoredValue } from './types.js';
import { K } from './types.js';
import { toKademliaId } from './types.js';
import { warn, network } from '../../../security/secure-logger.js';
import { randomBytes } from 'node:crypto';
import { pendingQueries } from '../handlers.js';

type DhtPing = { type: 'DHT_PING'; queryId?: string };
type DhtPong = { type: 'DHT_PONG'; nodeId: string; queryId?: string };
type DhtFindNodeRequest = { type: 'DHT_FIND_NODE'; targetId: string; queryId?: string };
type DhtFoundNodesResponse = { type: 'DHT_FOUND_NODES'; nodes: Array<{ upeerId: string; address: string; publicKey: string; nodeId: string }>; queryId?: string };
type DhtFindValueRequest = { type: 'DHT_FIND_VALUE'; key: string; queryId?: string };
type DhtFoundValueResponse = { type: 'DHT_FOUND_VALUE'; key: string; value: unknown; publisher: string; timestamp: number; signature?: string; queryId?: string };
type DhtStoreRequest = { type: 'DHT_STORE'; key: string; value: unknown; publisher: string; timestamp: number; signature?: string; queryId?: string };
type DhtStoreAck = { type: 'DHT_STORE_ACK'; key: string; queryId?: string };
type DhtPacket = DhtPing | DhtPong | DhtFindNodeRequest | DhtFoundNodesResponse | DhtFindValueRequest | DhtFoundValueResponse | DhtStoreRequest | DhtStoreAck;

type DhtResponse = DhtPong | DhtFoundNodesResponse | DhtFoundValueResponse | DhtStoreAck | null;

type PendingFoundValueResult = {
    value: unknown;
    publisher?: string;
    timestamp?: number;
    signature?: string;
};

export class ProtocolHandler {
    private stats = {
        messagesReceived: 0,
        messagesSent: 0
    };

    constructor(
        private readonly nodeId: Buffer,
        private readonly upeerId: string,
        private readonly routingTable: RoutingTable,
        private readonly valueStore: ValueStore,
        private readonly sendMessage: (address: string, data: DhtPacket) => void
    ) { }

    async handleMessage(
        senderUpeerId: string,
        data: DhtPacket,
        senderAddress: string
    ): Promise<DhtResponse> {
        this.stats.messagesReceived++;

        await this.updateContactFromMessage(senderUpeerId, senderAddress);

        switch (data.type) {
            case 'DHT_PING':
                return this.handlePing(senderUpeerId, data);
            case 'DHT_FIND_NODE':
                return this.handleFindNode(senderUpeerId, data);
            case 'DHT_FIND_VALUE':
                return this.handleFindValue(senderUpeerId, data);
            case 'DHT_STORE':
                return this.handleStore(senderUpeerId, data);
            case 'DHT_STORE_ACK':
            case 'DHT_PONG':
                return null;
            default:
                warn('Unknown message type', { type: data.type }, 'kademlia');
                return null;
        }
    }

    private async updateContactFromMessage(
        senderUpeerId: string,
        senderAddress: string
    ): Promise<void> {
        const contact = this.routingTable.findContact(senderUpeerId);
        if (contact) {
            contact.lastSeen = Date.now();
            contact.address = senderAddress;
            this.routingTable.addContact(contact);
        } else {
            const kContact: KademliaContact = {
                nodeId: toKademliaId(senderUpeerId),
                upeerId: senderUpeerId,
                address: senderAddress,
                publicKey: '',
                lastSeen: Date.now()
            };
            this.routingTable.addContact(kContact);
            network('Created new contact from incoming message', undefined, { upeerId: senderUpeerId }, 'kademlia');
        }
    }

    private handlePing(_senderUpeerId: string, _data: DhtPing): DhtPong {
        return { type: 'DHT_PONG', nodeId: this.nodeId.toString('hex') };
    }

    private handleFindNode(_senderUpeerId: string, data: DhtFindNodeRequest): DhtFoundNodesResponse {
        const targetId = Buffer.from(data.targetId, 'hex');
        const closestContacts = this.routingTable.findClosestContacts(targetId.toString('hex'), K);

        const response: DhtFoundNodesResponse = {
            type: 'DHT_FOUND_NODES',
            nodes: closestContacts.map(c => ({
                upeerId: c.upeerId,
                address: c.address,
                publicKey: c.publicKey,
                nodeId: c.nodeId.toString('hex')
            })),
            queryId: data.queryId
        };

        return response;
    }

    private handleFindValue(senderUpeerId: string, data: DhtFindValueRequest): DhtFoundValueResponse | DhtFoundNodesResponse {
        const key = Buffer.from(data.key, 'hex');
        const value = this.valueStore.get(key);

        if (value) {
            const response: DhtFoundValueResponse = {
                type: 'DHT_FOUND_VALUE',
                key: data.key,
                value: value.value,
                publisher: value.publisher,
                timestamp: value.timestamp,
                signature: value.signature,
                queryId: data.queryId
            };
            return response;
        } else {
            return this.handleFindNode(senderUpeerId, { type: 'DHT_FIND_NODE', targetId: data.key, queryId: data.queryId });
        }
    }

    private handleStore(senderUpeerId: string, data: DhtStoreRequest): DhtStoreAck {
        const key = Buffer.from(data.key, 'hex');
        this.valueStore.set(
            key,
            data.value,
            data.publisher,
            data.signature
        );

        return { type: 'DHT_STORE_ACK', key: data.key, queryId: data.queryId };
    }

    async storeValue(key: Buffer, value: unknown, publisher: string, signature?: string): Promise<void> {
        this.valueStore.set(key, value, publisher, signature);

        const closestContacts = this.routingTable.findClosestContacts(key.toString('hex'), K);

        for (const contact of closestContacts) {
            if (contact.upeerId === this.upeerId) continue;

            try {
                this.sendMessage(contact.address, {
                    type: 'DHT_STORE',
                    key: key.toString('hex'),
                    value,
                    publisher,
                    timestamp: Date.now(),
                    signature
                });
                this.stats.messagesSent++;
            } catch (error) {
                warn('Failed to store value on contact', { contactId: contact.upeerId, error }, 'kademlia');
            }
        }
    }

    async findValue(key: Buffer): Promise<StoredValue | null> {
        const localValue = this.valueStore.get(key);
        if (localValue) {
            return localValue;
        }

        const ALPHA = 3;
        const QUERY_TIMEOUT = 5000;
        const keyHex = key.toString('hex');

        const closestContacts = this.routingTable.findClosestContacts(keyHex, K);
        if (closestContacts.length === 0) {
            return null;
        }

        const contactsToQuery = closestContacts.slice(0, ALPHA);
        const promises = contactsToQuery.map(contact => {
            return new Promise<{ value: DhtFoundValueResponse | PendingFoundValueResult; senderAddress: string }>((resolve, reject) => {
                const queryId = randomBytes(16).toString('hex');
                const timeout = setTimeout(() => {
                    pendingQueries.delete(queryId);
                    reject(new Error(`FIND_VALUE timeout for ${contact.address}`));
                }, QUERY_TIMEOUT);

                pendingQueries.set(queryId, {
                    resolve: (value) => {
                        clearTimeout(timeout);
                        pendingQueries.delete(queryId);
                        resolve(value);
                    },
                    reject: (error) => {
                        clearTimeout(timeout);
                        pendingQueries.delete(queryId);
                        reject(error);
                    },
                    type: 'DHT_FIND_VALUE',
                    targetId: keyHex,
                    timestamp: Date.now(),
                    timeoutId: timeout
                });

                this.sendMessage(contact.address, { type: 'DHT_FIND_VALUE', key: keyHex, queryId });
                this.stats.messagesSent++;
            });
        });

        const results = await Promise.allSettled(promises);

        for (const result of results) {
            if (result.status === 'fulfilled') {
                const resolved = result.value;
                const payload = typeof resolved === 'object' && resolved !== null && 'senderAddress' in resolved && 'value' in resolved
                    ? resolved.value
                    : resolved;

                const resultValue = typeof payload === 'object' && payload !== null && 'value' in payload
                    ? (payload as { value: unknown }).value
                    : undefined;

                if (resultValue !== undefined) {
                    return {
                        key,
                        value: resultValue,
                        publisher: typeof payload === 'object' && payload !== null && 'publisher' in payload && typeof payload.publisher === 'string' ? payload.publisher : '',
                        timestamp: typeof payload === 'object' && payload !== null && 'timestamp' in payload && typeof payload.timestamp === 'number' ? payload.timestamp : Date.now(),
                        signature: typeof payload === 'object' && payload !== null && 'signature' in payload && typeof payload.signature === 'string' ? payload.signature : undefined
                    };
                }
            }
        }

        return null;
    }

    getStats() {
        return { ...this.stats };
    }
}