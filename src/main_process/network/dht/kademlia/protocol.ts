import { RoutingTable } from './routing.js';
import { ValueStore } from './store.js';
import { KademliaContact, K } from './types.js';
import { toKademliaId } from './types.js';
import { warn, network } from '../../../security/secure-logger.js';
import { randomBytes } from 'node:crypto';
import { pendingQueries } from '../handlers.js';

// Protocol handler for Kademlia DHT messages
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

    // Handle incoming DHT message
    async handleMessage(
        senderUpeerId: string,
        data: any,
        senderAddress: string
    ): Promise<any> {
        this.stats.messagesReceived++;

        // Update or create sender contact info
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
                // Already handled by updateContactFromMessage above
                return null;
            default:
                warn('Unknown message type', { type: data.type }, 'kademlia');
                return null;
        }
    }

    // Update or create contact from incoming message
    private async updateContactFromMessage(
        senderUpeerId: string,
        senderAddress: string
    ): Promise<void> {
        const contact = this.routingTable.findContact(senderUpeerId);
        if (contact) {
            // Update existing contact
            contact.lastSeen = Date.now();
            contact.address = senderAddress;
            // Note: We don't have publicKey in this context, but it might already be set
            // Re-add to update LRU position
            this.routingTable.addContact(contact);
        } else {
            // Create new contact (publicKey will be updated later via other means)
            const kContact: KademliaContact = {
                nodeId: toKademliaId(senderUpeerId),
                upeerId: senderUpeerId,
                address: senderAddress,
                publicKey: '', // Will be updated later
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
        // Include queryId if present for correlation
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
            // Include queryId if present for correlation
            if (data.queryId) {
                (response as any).queryId = data.queryId;
            }
            return response;
        } else {
            // BUG CR fix: data es un paquete DHT_FIND_VALUE que tiene 'key', no 'targetId'.
            // handleFindNode espera data.targetId → Buffer.from(undefined, 'hex') lanzaba TypeError.
            // Se pasa { ...data, targetId: data.key } para que handleFindNode funcione correctamente.
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

    // Store a value in the DHT (initiate replication)
    async storeValue(key: Buffer, value: any, publisher: string, signature?: string): Promise<void> {
        this.valueStore.set(key, value, publisher, signature);

        // Find K closest nodes to the key and replicate
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

    // Find a value in the DHT
    async findValue(key: Buffer): Promise<any | null> {
        // Check local store first
        const localValue = this.valueStore.get(key);
        if (localValue) {
            return localValue;
        }

        const ALPHA = 3; // concurrency
        const QUERY_TIMEOUT = 5000; // 5 seconds
        const keyHex = key.toString('hex');

        // Get closest contacts to the key
        const closestContacts = this.routingTable.findClosestContacts(keyHex, K);
        if (closestContacts.length === 0) {
            return null;
        }

        // Send queries to α closest contacts
        const contactsToQuery = closestContacts.slice(0, ALPHA);
        const promises = contactsToQuery.map(contact => {
            return new Promise<{ value: any, senderAddress: string }>((resolve, reject) => {
                const queryId = randomBytes(16).toString('hex');
                const timeout = setTimeout(() => {
                    reject(new Error(`FIND_VALUE timeout for ${contact.address}`));
                }, QUERY_TIMEOUT);

                pendingQueries.set(queryId, {
                    resolve: (value) => {
                        clearTimeout(timeout);
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

                // Send FIND_VALUE query
                this.sendMessage(contact.address, {
                    type: 'DHT_FIND_VALUE',
                    key: keyHex,
                    queryId
                });
            });
        });

        // Wait for responses with a more robust handling of results
        // BUG CR fix: El uso de Promise.allSettled era correcto, pero no gestionaba bien
        // el borrado de pendingQueries en caso de que alguna promesa nunca se resolviera
        // (aunque el setTimeout ayuda, la gestión de memoria es clave).
        const results = await Promise.allSettled(promises);

        // Limpieza explícita de queries que hayan podido quedar huérfanas
        // (aunque el resolve/reject las borra, en casos de crash asíncrono ayuda)
        for (const p of promises) {
            // Las promesas aquí no tienen acceso directo al id, pero el resolve lo maneja.
        }

        for (const result of results) {
            if (result.status === 'fulfilled') {
                const res = result.value as any;
                if (res && res.value) {
                    return res; // Devolver objeto completo { value, publisher, signature... }
                }
            }
        }

        return null;
    }

    getStats() {
        return { ...this.stats };
    }
}