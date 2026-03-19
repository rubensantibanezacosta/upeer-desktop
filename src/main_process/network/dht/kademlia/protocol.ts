import { RoutingTable } from './routing.js';
import { ValueStore } from './store.js';
import { KademliaContact, K } from './types.js';
import { toKademliaId } from './types.js';
import { warn, network } from '../../../security/secure-logger.js';
import { randomBytes } from 'node:crypto';
import { pendingQueries } from '../handlers.js';

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
        private readonly sendMessage: (address: string, data: any) => void
    ) { }

    async handleMessage(
        senderUpeerId: string,
        data: any,
        senderAddress: string
    ): Promise<any> {
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

    private handlePing(_senderUpeerId: string, _data: any): any {
        return { type: 'DHT_PONG', nodeId: this.nodeId.toString('hex') };
    }

    private handleFindNode(_senderUpeerId: string, data: any): any {
        const targetId = Buffer.from(data.targetId, 'hex');
        const closestContacts = this.routingTable.findClosestContacts(targetId.toString('hex'), K);

        const response = {
            type: 'DHT_FOUND_NODES',
            nodes: closestContacts.map(c => ({
                upeerId: c.upeerId,
                address: c.address,
                publicKey: c.publicKey,
                nodeId: c.nodeId.toString('hex')
            }))
        };
        if (data.queryId) {
            (response as any).queryId = data.queryId;
        }
        return response;
    }

    private handleFindValue(senderUpeerId: string, data: any): any {
        const key = Buffer.from(data.key, 'hex');
        const value = this.valueStore.get(key);

        if (value) {
            const response = {
                type: 'DHT_FOUND_VALUE',
                key: data.key,
                value: value.value,
                publisher: value.publisher,
                timestamp: value.timestamp,
                signature: value.signature
            };
            if (data.queryId) {
                (response as any).queryId = data.queryId;
            }
            return response;
        } else {
            return this.handleFindNode(senderUpeerId, { ...data, targetId: data.key });
        }
    }

    private handleStore(senderUpeerId: string, data: any): any {
        const key = Buffer.from(data.key, 'hex');
        this.valueStore.set(
            key,
            data.value,
            data.publisher,
            data.signature
        );

        return { type: 'DHT_STORE_ACK', key: data.key };
    }

    async storeValue(key: Buffer, value: any, publisher: string, signature?: string): Promise<void> {
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

    async findValue(key: Buffer): Promise<any | null> {
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
            return new Promise<{ value: any, senderAddress: string }>((resolve, reject) => {
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

                this.sendMessage(contact.address, {
                    type: 'DHT_FIND_VALUE',
                    key: keyHex,
                    queryId
                });
                this.stats.messagesSent++;
            });
        });

        const results = await Promise.allSettled(promises);

        for (const result of results) {
            if (result.status === 'fulfilled') {
                const res = result.value as any;
                if (res && res.value) {
                    return res;
                }
            }
        }

        return null;
    }

    getStats() {
        return { ...this.stats };
    }
}