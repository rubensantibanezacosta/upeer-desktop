import dns from 'node:dns';
import fs from 'node:fs';
import path from 'node:path';
import { RoutingTable } from './routing.js';
import { KademliaContact, SeedNode, SEED_NODES, BOOTSTRAP_MIN_NODES, BOOTSTRAP_RETRY_MS } from './types.js';
import { toKademliaId } from './types.js';
import { warn, info } from '../../../security/secure-logger.js';

// DNS domain for seed nodes (can be overridden via config)
const SEED_DNS_DOMAIN = 'dht-seeds.upeer.chat';
// Local seed nodes file name
const LOCAL_SEEDS_FILE = 'seednodes.json';

// Bootstrap manager for Kademlia DHT
export class BootstrapManager {
    private bootstrapped: boolean = false;
    private lastBootstrapAttempt: number = 0;
    private totalContacts: number = 0;
    private stats = {
        bootstrapAttempts: 0,
        bootstrapSuccesses: 0
    };

    constructor(
        private readonly routingTable: RoutingTable,
        private readonly sendMessage: (address: string, data: any) => void,
        private readonly getContacts?: () => any[],
        private readonly userDataPath?: string
    ) { }

    // Load seed nodes from multiple sources
    private async loadSeedNodes(): Promise<SeedNode[]> {
        const seedNodes: SeedNode[] = [];
        const seenIds = new Set<string>();

        // 1. Hardcoded seed nodes
        for (const seed of SEED_NODES) {
            if (!seenIds.has(seed.upeerId)) {
                seedNodes.push(seed);
                seenIds.add(seed.upeerId);
            }
        }

        // 2. DNS TXT records
        try {
            const dnsSeeds = await this.loadSeedNodesFromDNS();
            for (const seed of dnsSeeds) {
                if (!seenIds.has(seed.upeerId)) {
                    seedNodes.push(seed);
                    seenIds.add(seed.upeerId);
                }
            }
        } catch (error) {
            warn('Failed to load seed nodes from DNS', error, 'kademlia-bootstrap');
        }

        // 3. Local configuration file
        try {
            const fileSeeds = await this.loadSeedNodesFromFile();
            for (const seed of fileSeeds) {
                if (!seenIds.has(seed.upeerId)) {
                    seedNodes.push(seed);
                    seenIds.add(seed.upeerId);
                }
            }
        } catch (error) {
            warn('Failed to load seed nodes from file', error, 'kademlia-bootstrap');
        }

        // 4. LAN discovery (multicast/broadcast)
        try {
            const lanSeeds = await this.loadSeedNodesFromLAN();
            for (const seed of lanSeeds) {
                if (!seenIds.has(seed.upeerId)) {
                    seedNodes.push(seed);
                    seenIds.add(seed.upeerId);
                }
            }
        } catch (error) {
            warn('Failed to load seed nodes from LAN', error, 'kademlia-bootstrap');
        }

        info(`Loaded ${seedNodes.length} seed nodes from ${seenIds.size} unique sources`, undefined, 'kademlia-bootstrap');
        return seedNodes;
    }

    // Load seed nodes from DNS TXT records
    private async loadSeedNodesFromDNS(): Promise<SeedNode[]> {
        const records = await dns.promises.resolveTxt(SEED_DNS_DOMAIN);
        const seedNodes: SeedNode[] = [];

        for (const record of records) {
            for (const entry of record) {
                try {
                    // Expected format: "upeerId=xxxx;address=xxxx;publicKey=xxxx"
                    const parts = entry.split(';');
                    const seed: any = {};
                    for (const part of parts) {
                        const [key, value] = part.split('=');
                        if (key && value) {
                            seed[key] = value;
                        }
                    }
                    if (seed.upeerId && seed.address && seed.publicKey) {
                        seedNodes.push({
                            upeerId: seed.upeerId,
                            address: seed.address,
                            publicKey: seed.publicKey
                        });
                    }
                } catch (error) {
                    // Skip malformed entries
                }
            }
        }
        return seedNodes;
    }

    // Load seed nodes from local configuration file
    private async loadSeedNodesFromFile(): Promise<SeedNode[]> {
        if (!this.userDataPath) return [];

        const filePath = path.join(this.userDataPath, LOCAL_SEEDS_FILE);
        if (!fs.existsSync(filePath)) return [];

        const content = fs.readFileSync(filePath, 'utf8');
        const data = JSON.parse(content);

        if (!Array.isArray(data)) return [];

        const seedNodes: SeedNode[] = [];
        for (const item of data) {
            if (item.upeerId && item.address && item.publicKey) {
                seedNodes.push({
                    upeerId: item.upeerId,
                    address: item.address,
                    publicKey: item.publicKey
                });
            }
        }
        return seedNodes;
    }

    // Load seed nodes from LAN discovery
    private async loadSeedNodesFromLAN(): Promise<SeedNode[]> {
        // This would integrate with the LAN discovery module
        // For now, return empty array - integration will be added separately
        return [];
    }

    // Bootstrap from existing contacts in database
    bootstrapFromContacts(): number {
        if (!this.getContacts) return 0;

        const contacts = this.getContacts();
        let bootstrapped = 0;
        for (const contact of contacts) {
            // Skip contacts without required fields
            if (!contact.upeerId || !contact.publicKey || contact.status !== 'connected') {
                continue;
            }

            const kContact: KademliaContact = {
                nodeId: toKademliaId(contact.upeerId),
                upeerId: contact.upeerId,
                address: contact.address,
                publicKey: contact.publicKey,
                lastSeen: Date.now(),
                dhtSeq: contact.dhtSeq || undefined,
                dhtSignature: contact.dhtSignature || undefined
            };
            const added = this.routingTable.addContact(kContact);
            if (added) bootstrapped++;
        }

        this.totalContacts = this.routingTable.getContactCount();
        this.updateBootstrapStatus();

        info(`Bootstrapped with ${bootstrapped} contacts (out of ${contacts.length})`, undefined, 'kademlia-bootstrap');
        return bootstrapped;
    }

    // Attempt bootstrap from seed nodes
    async attemptBootstrapFromSeeds(): Promise<void> {
        const now = Date.now();
        if (now - this.lastBootstrapAttempt < BOOTSTRAP_RETRY_MS) {
            return; // Too soon to retry
        }

        this.lastBootstrapAttempt = now;
        this.stats.bootstrapAttempts++;

        const seedNodes = await this.loadSeedNodes();
        info(`Attempting bootstrap from ${seedNodes.length} seed nodes`, undefined, 'kademlia-bootstrap');

        for (const seed of seedNodes) {
            // Add seed to contacts
            const kContact: KademliaContact = {
                nodeId: toKademliaId(seed.upeerId),
                upeerId: seed.upeerId,
                address: seed.address,
                publicKey: seed.publicKey,
                lastSeen: Date.now()
            };
            this.routingTable.addContact(kContact);

            // Try to ping seed node to verify connectivity
            try {
                this.sendMessage(seed.address, {
                    type: 'DHT_PING',
                    timestamp: now
                });
            } catch (error) {
                warn(`Failed to ping seed node ${seed.upeerId}`, error, 'kademlia-bootstrap');
            }
        }

        // Update bootstrap status
        this.updateBootstrapStatus();

        if (this.bootstrapped) {
            info(`Bootstrap successful with ${this.totalContacts} contacts`, undefined, 'kademlia-bootstrap');
        }
    }

    // Update bootstrap status based on current contact count
    updateBootstrapStatus(): void {
        const wasBootstrapped = this.bootstrapped;
        this.totalContacts = this.routingTable.getContactCount();
        this.bootstrapped = this.totalContacts >= BOOTSTRAP_MIN_NODES;

        if (wasBootstrapped && !this.bootstrapped) {
            // We lost bootstrap status
            warn(`Lost bootstrap status (${this.totalContacts} contacts)`, undefined, 'kademlia-bootstrap');
        } else if (!wasBootstrapped && this.bootstrapped) {
            // Gained bootstrap status
            info(`Gained bootstrap status (${this.totalContacts} contacts)`, undefined, 'kademlia-bootstrap');
            this.stats.bootstrapSuccesses++;
        }
    }

    // Force bootstrap retry
    async retryBootstrap(): Promise<void> {
        this.lastBootstrapAttempt = 0; // Reset timer
        await this.attemptBootstrapFromSeeds();
    }

    // Check if node is bootstrapped
    isBootstrapped(): boolean {
        return this.bootstrapped;
    }

    // Get total contact count
    getContactCount(): number {
        return this.totalContacts;
    }

    // Get bootstrap statistics
    getStats() {
        return { ...this.stats };
    }

    // Get time since last bootstrap attempt
    getTimeSinceLastAttempt(): number {
        return Date.now() - this.lastBootstrapAttempt;
    }
}