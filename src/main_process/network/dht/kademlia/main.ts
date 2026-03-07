import { toKademliaId } from './types.js';
import { RoutingTable } from './routing.js';
import { ValueStore } from './store.js';
import { BootstrapManager } from './bootstrap.js';
import { ProtocolHandler } from './protocol.js';
import { KademliaContact, KademliaStats } from './types.js';
import { REFRESH_INTERVAL_MS, REPUBLISH_INTERVAL_MS, BOOTSTRAP_RETRY_MS } from './types.js';

// Main Kademlia DHT implementation
export class KademliaDHT {
    private readonly nodeId: Buffer;
    private readonly revelnestId: string;
    
    private routingTable: RoutingTable;
    private valueStore: ValueStore;
    private bootstrapManager: BootstrapManager;
    private protocolHandler: ProtocolHandler;
    
    private stats = {
        storeOperations: 0,
        findOperations: 0
    };

    constructor(
        revelnestId: string,
        sendMessage: (address: string, data: any) => void,
        getContacts?: () => any[],
        userDataPath?: string
    ) {
        this.revelnestId = revelnestId;
        this.nodeId = toKademliaId(revelnestId);
        
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
            this.revelnestId,
            this.routingTable,
            this.valueStore,
            sendMessage
        );
        
        // Bootstrap from existing contacts
        const bootstrappedCount = this.bootstrapManager.bootstrapFromContacts();
        
        console.log(`[Kademlia] Node initialized: ${revelnestId}`);
        console.log(`[Kademlia] Kademlia ID: ${this.nodeId.toString('hex')}`);
        console.log(`[Kademlia] Bootstrap status: ${this.isBootstrapped() ? 'READY' : 'PENDING'} (${bootstrappedCount} contacts)`);
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
    removeContact(revelnestId: string): void {
        this.routingTable.removeContact(revelnestId);
        this.bootstrapManager.updateBootstrapStatus();
    }

    // Find a contact by RevelNest ID
    findContact(revelnestId: string): KademliaContact | null {
        return this.routingTable.findContact(revelnestId);
    }

    // Find the K closest contacts to a given ID
    findClosestContacts(targetRevelnestId: string, limit?: number): KademliaContact[] {
        return this.routingTable.findClosestContacts(targetRevelnestId, limit);
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
    async storeLocationBlock(revelnestId: string, locationBlock: any): Promise<void> {
        const key = toKademliaId(revelnestId);
        await this.storeValue(
            key,
            locationBlock,
            revelnestId,
            locationBlock.signature
        );
        console.log(`[Kademlia] Stored location block for ${revelnestId} in DHT`);
    }

    // Find location block in DHT
    async findLocationBlock(revelnestId: string): Promise<any | null> {
        const key = toKademliaId(revelnestId);
        const result = await this.findValue(key);
        
        if (result && result.value) {
            // Verify signature if present
            if (result.signature) {
                const contact = this.findContact(revelnestId);
                if (contact) {
                    // TODO: Implement signature verification
                    console.log(`[Kademlia] Found location block for ${revelnestId}`);
                    return result.value;
                }
            }
        }
        
        return null;
    }

    // Handle incoming DHT message
    async handleMessage(senderRevelnestId: string, data: any, senderAddress: string): Promise<any> {
        return this.protocolHandler.handleMessage(senderRevelnestId, data, senderAddress);
    }

    // Periodic maintenance
    async performMaintenance(): Promise<void> {
        // Check bootstrap status and retry if needed
        if (!this.isBootstrapped()) {
            const timeSinceLastAttempt = this.bootstrapManager.getTimeSinceLastAttempt();
            if (timeSinceLastAttempt >= BOOTSTRAP_RETRY_MS) {
                console.log(`[Kademlia] Not bootstrapped (${this.getContactCount()} contacts). Retrying...`);
                await this.bootstrapManager.retryBootstrap();
            }
        }
        
        // Refresh stale buckets
        const staleBuckets = this.routingTable.refreshStaleBuckets();
        if (staleBuckets.length > 0) {
            console.log(`[Kademlia] Refreshing ${staleBuckets.length} stale buckets`);
            // In a real implementation, we would perform FIND_NODE for random IDs in each bucket
        }
        
        // Clean up expired values
        const removed = this.valueStore.cleanupExpiredValues();
        if (removed > 0) {
            console.log(`[Kademlia] Cleaned up ${removed} expired values`);
        }
        
        console.log(`[Kademlia] Maintenance completed. Stats:`, this.getStats());
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