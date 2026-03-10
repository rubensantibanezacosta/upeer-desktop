import { toKademliaId } from './types.js';
import { RoutingTable } from './routing.js';
import { ValueStore } from './store.js';
import { BootstrapManager } from './bootstrap.js';
import { ProtocolHandler } from './protocol.js';
import { KademliaContact, KademliaStats } from './types.js';
import { REFRESH_INTERVAL_MS, REPUBLISH_INTERVAL_MS, BOOTSTRAP_RETRY_MS } from './types.js';
import { network, info, debug, warn } from '../../../security/secure-logger.js';

// Main Kademlia DHT implementation
export class KademliaDHT {
    private readonly nodeId: Buffer;
    private readonly upeerId: string;

    private routingTable: RoutingTable;
    private valueStore: ValueStore;
    private bootstrapManager: BootstrapManager;
    private protocolHandler: ProtocolHandler;

    private stats = {
        storeOperations: 0,
        findOperations: 0
    };

    constructor(
        upeerId: string,
        sendMessage: (address: string, data: any) => void,
        getContacts?: () => any[],
        userDataPath?: string
    ) {
        this.upeerId = upeerId;
        this.nodeId = toKademliaId(upeerId);

        // Initialize components
        this.routingTable = new RoutingTable(this.nodeId);
        this.valueStore = new ValueStore();

        this.bootstrapManager = new BootstrapManager(
            this.routingTable,
            sendMessage,
            getContacts,
            userDataPath
        );
        this.protocolHandler = new ProtocolHandler(
            this.nodeId,
            this.upeerId,
            this.routingTable,
            this.valueStore,
            sendMessage
        );

        // Bootstrap from existing contacts
        const bootstrappedCount = this.bootstrapManager.bootstrapFromContacts();

        info('Kademlia node initialized', { upeerId }, 'kademlia');
        debug('Kademlia ID', { nodeId: this.nodeId.toString('hex') }, 'kademlia');
        info('Kademlia bootstrap status', {
            ready: this.isBootstrapped(),
            contacts: bootstrappedCount
        }, 'kademlia');
    }

    // === Public API ===

    // Check if node is bootstrapped
    isBootstrapped(): boolean {
        return this.bootstrapManager.isBootstrapped();
    }

    // Get total contact count
    getContactCount(): number {
        return this.bootstrapManager.getContactCount();
    }

    // Force bootstrap retry
    retryBootstrap(): void {
        this.bootstrapManager.retryBootstrap();
    }

    // Add a contact (e.g., from external source)
    addContact(contact: KademliaContact): void {
        this.routingTable.addContact(contact);
        this.bootstrapManager.updateBootstrapStatus();
    }

    // Remove a contact
    removeContact(upeerId: string): void {
        this.routingTable.removeContact(upeerId);
        this.bootstrapManager.updateBootstrapStatus();
    }

    // Find a contact by upeer ID
    findContact(upeerId: string): KademliaContact | null {
        return this.routingTable.findContact(upeerId);
    }

    // Find the K closest contacts to a given ID
    findClosestContacts(targetUpeerId: string, limit?: number): KademliaContact[] {
        return this.routingTable.findClosestContacts(targetUpeerId, limit);
    }

    // Store a value in the DHT
    async storeValue(key: Buffer, value: any, publisher: string, signature?: string): Promise<void> {
        await this.protocolHandler.storeValue(key, value, publisher, signature);
        this.stats.storeOperations++;
    }


    // Find a value in the DHT
    async findValue(key: Buffer): Promise<any | null> {
        const result = await this.protocolHandler.findValue(key);
        this.stats.findOperations++;
        return result;
    }

    // Store location block in DHT
    async storeLocationBlock(upeerId: string, locationBlock: any): Promise<void> {
        const key = toKademliaId(upeerId);
        await this.storeValue(
            key,
            locationBlock,
            upeerId,
            locationBlock.signature
        );
        network('Stored location block in DHT', undefined, { upeerId }, 'kademlia');
    }

    // Find location block in DHT
    async findLocationBlock(upeerId: string): Promise<any | null> {
        const key = toKademliaId(upeerId);
        const result = await this.findValue(key);

        if (result && result.value) {
            // BUG AU fix: el código anterior solo devolvía el valor si el contacto ya
            // existía en la routing table Y tenía firma — un círculo vicioso, ya que el
            // objetivo de buscar en DHT es precisamente encontrar contactos desconocidos.
            // Ahora devolvemos el valor siempre que esté presente; la verificación de firma
            // se hace en la capa superior (DHT_RESPONSE handler en network/handlers.ts).
            network('Found location block in DHT', undefined, { upeerId }, 'kademlia');
            return result.value;
        }

        return null;
    }

    // Handle incoming DHT message
    async handleMessage(senderUpeerId: string, data: any, senderAddress: string): Promise<any> {
        return this.protocolHandler.handleMessage(senderUpeerId, data, senderAddress);
    }

    // Periodic maintenance
    async performMaintenance(): Promise<void> {
        // Check bootstrap status and retry if needed
        if (!this.isBootstrapped()) {
            const timeSinceLastAttempt = this.bootstrapManager.getTimeSinceLastAttempt();
            if (timeSinceLastAttempt >= BOOTSTRAP_RETRY_MS) {
                warn('Kademlia not bootstrapped, retrying', { contacts: this.getContactCount() }, 'kademlia');
                await this.bootstrapManager.retryBootstrap();
            }
        }

        // Refresh stale buckets
        const staleBuckets = this.routingTable.refreshStaleBuckets();
        if (staleBuckets.length > 0) {
            debug('Refreshing stale Kademlia buckets', { count: staleBuckets.length }, 'kademlia');
            // In a real implementation, we would perform FIND_NODE for random IDs in each bucket
        }

        // Clean up expired values
        const removed = this.valueStore.cleanupExpiredValues();

        debug('Kademlia maintenance completed', { removed, ...this.getStats() }, 'kademlia');
    }

    // Get statistics
    getStats(): KademliaStats {
        const protocolStats = this.protocolHandler.getStats();
        const bootstrapStats = this.bootstrapManager.getStats();
        const totalContacts = this.getContactCount();

        return {
            ...this.stats,
            ...protocolStats,
            ...bootstrapStats,
            totalContacts,
            totalBuckets: this.routingTable.getBucketCount(),
            storedValues: this.valueStore.size()
        };
    }
}