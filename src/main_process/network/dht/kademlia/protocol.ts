import { RoutingTable } from './routing.js';
import { ValueStore } from './store.js';
import { KademliaContact, K } from './types.js';
import { toKademliaId } from './types.js';
import { warn, network } from '../../../security/secure-logger.js';

// Protocol handler for Kademlia DHT messages
export class ProtocolHandler {
    private stats = {
        messagesReceived: 0,
        messagesSent: 0
    };

    constructor(
        private readonly nodeId: Buffer,
        private readonly revelnestId: string,
        private readonly routingTable: RoutingTable,
        private readonly valueStore: ValueStore,
        private readonly sendMessage: (address: string, data: any) => void
    ) {}

    // Handle incoming DHT message
    async handleMessage(
        senderRevelnestId: string, 
        data: any, 
        senderAddress: string
    ): Promise<any> {
        this.stats.messagesReceived++;
        
        // Update or create sender contact info
        await this.updateContactFromMessage(senderRevelnestId, senderAddress);
        
        switch (data.type) {
            case 'DHT_PING':
                return this.handlePing(senderRevelnestId, data);
            case 'DHT_FIND_NODE':
                return this.handleFindNode(senderRevelnestId, data);
            case 'DHT_FIND_VALUE':
                return this.handleFindValue(senderRevelnestId, data);
            case 'DHT_STORE':
                return this.handleStore(senderRevelnestId, data);
            default:
                warn('Unknown message type', { type: data.type }, 'kademlia');
                return null;
        }
    }

    // Update or create contact from incoming message
    private async updateContactFromMessage(
        senderRevelnestId: string, 
        senderAddress: string
    ): Promise<void> {
        let contact = this.routingTable.findContact(senderRevelnestId);
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
                nodeId: toKademliaId(senderRevelnestId),
                revelnestId: senderRevelnestId,
                address: senderAddress,
                publicKey: '', // Will be updated later
                lastSeen: Date.now()
            };
            this.routingTable.addContact(kContact);
            network('Created new contact from incoming message', undefined, { revelnestId: senderRevelnestId }, 'kademlia');
        }
    }

    private handlePing(senderRevelnestId: string, data: any): any {
        return { type: 'DHT_PONG', nodeId: this.nodeId.toString('hex') };
    }

    private handleFindNode(senderRevelnestId: string, data: any): any {
        const targetId = Buffer.from(data.targetId, 'hex');
        const closestContacts = this.routingTable.findClosestContacts(targetId.toString('hex'), K);
        
        return {
            type: 'DHT_FOUND_NODES',
            nodes: closestContacts.map(c => ({
                revelnestId: c.revelnestId,
                address: c.address,
                publicKey: c.publicKey,
                nodeId: c.nodeId.toString('hex')
            }))
        };
    }

    private handleFindValue(senderRevelnestId: string, data: any): any {
        const key = Buffer.from(data.key, 'hex');
        const value = this.valueStore.get(key);
        
        if (value) {
            return {
                type: 'DHT_FOUND_VALUE',
                key: data.key,
                value: value.value,
                publisher: value.publisher,
                timestamp: value.timestamp,
                signature: value.signature
            };
        } else {
            // Return closest nodes
            return this.handleFindNode(senderRevelnestId, data);
        }
    }

    private handleStore(senderRevelnestId: string, data: any): any {
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
            if (contact.revelnestId === this.revelnestId) continue;
            
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
                warn('Failed to store value on contact', { contactId: contact.revelnestId, error }, 'kademlia');
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
        
        // TODO: Implement iterative find with parallel queries
        // For now, just return null
        return null;
    }

    // Get protocol statistics
    getStats() {
        return { ...this.stats };
    }
}